import logging
from datetime import datetime, timedelta, timezone

from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.redis import redis_client
from app.db.session import async_session
from app.models.pickup_code import PickupCodeCheckResult
from app.models.school import School
from app.models.security_alert import SecurityAlert
from app.models.user import User, UserRole
from app.schemas.alert import AlertStatus
from app.services.audit_service import ALERT_RESOLVED, record_audit
from app.services.notification_service import EmailMessage, EmailSender, send_email_safely

logger = logging.getLogger(__name__)

# Raise a repeated-attempts alert after this many failures by one staff
# member within the window (SRS 11.3 "suspicious repeated attempts").
REPEATED_FAILURE_LIMIT = 5
REPEATED_FAILURE_WINDOW = timedelta(minutes=10)
REPEATED_FAILED_ATTEMPTS = "repeated_failed_attempts"

# At most one alert email per school in this time, so a burst of failures
# cannot flood admins or use up the email quota (SRS 20). Repeated-attempts
# alerts are always sent; every alert is still recorded for the dashboard.
ALERT_EMAIL_COOLDOWN_SECONDS = 10 * 60

# Messages never include the plaintext code (SRS 14, 28).
_FAILURE_MESSAGES = {
    PickupCodeCheckResult.INVALID_CODE: "Pickup code was not recognised",
    PickupCodeCheckResult.WRONG_PUPIL: "Pickup code belongs to a different pupil",
    PickupCodeCheckResult.WRONG_AUTHORISATION: "Pickup code belongs to a different authorisation",
    PickupCodeCheckResult.USED_CODE: "Pickup code has already been used",
    PickupCodeCheckResult.EXPIRED_CODE: "Pickup code has expired",
    PickupCodeCheckResult.AUTHORISATION_INACTIVE: "Pickup authorisation is inactive",
    PickupCodeCheckResult.AUTHORISATION_SCHEDULED: "Pickup authorisation has not started yet",
    PickupCodeCheckResult.AUTHORISATION_EXPIRED: "Pickup authorisation has expired",
}


async def record_failed_verification(
        session: AsyncSession,
        school_id: int,
        staff_id: int,
        result: PickupCodeCheckResult,
        method: str,
        pupil_id: int | None = None,
        authorisation_id: int | None = None,
) -> list[SecurityAlert]:
    """Record security alerts for a failed pickup verification.

    Creates one alert typed by the failure reason, plus a repeated-attempts
    alert when the staff member reaches the failure limit within the window
    and has not already triggered one in that window. Does not commit.
    """

    if result == PickupCodeCheckResult.VALID:
        raise ValueError("A valid verification is not a failure")

    now = datetime.now(timezone.utc)

    alerts = [
        SecurityAlert(
            school_id=school_id,
            pupil_id=pupil_id,
            authorisation_id=authorisation_id,
            attempted_by=staff_id,
            alert_type=result.value,
            message=f"{_FAILURE_MESSAGES[result]} ({method} verification)",
            created_at=now,
        )
    ]
    session.add(alerts[0])
    await session.flush()

    recent = (
        select(SecurityAlert.alert_type, func.count())
        .where(
            SecurityAlert.attempted_by == staff_id,
            SecurityAlert.created_at > now - REPEATED_FAILURE_WINDOW,
        )
        .group_by(SecurityAlert.alert_type)
    )
    counts = dict((await session.execute(recent)).all())

    already_alerted = counts.pop(REPEATED_FAILED_ATTEMPTS, 0) > 0

    if sum(counts.values()) >= REPEATED_FAILURE_LIMIT and not already_alerted:
        repeated = SecurityAlert(
            school_id=school_id,
            attempted_by=staff_id,
            alert_type=REPEATED_FAILED_ATTEMPTS,
            message=(
                f"{REPEATED_FAILURE_LIMIT} or more failed pickup verifications "
                f"within {int(REPEATED_FAILURE_WINDOW.total_seconds() // 60)} minutes"
            ),
            created_at=now,
        )
        session.add(repeated)
        alerts.append(repeated)

    return alerts


async def list_alerts(
        session: AsyncSession,
        school_id: int,
        status: AlertStatus | None = None,
        limit: int = 50,
        offset: int = 0,
) -> list[SecurityAlert]:
    """List a school's security alerts, newest first, optionally by status."""

    query = select(SecurityAlert).where(SecurityAlert.school_id == school_id)

    if status == AlertStatus.OPEN:
        query = query.where(SecurityAlert.resolved_at.is_(None))
    elif status == AlertStatus.RESOLVED:
        query = query.where(SecurityAlert.resolved_at.is_not(None))

    result = await session.scalars(
        query.order_by(SecurityAlert.created_at.desc(), SecurityAlert.id.desc())
        .limit(limit)
        .offset(offset)
    )

    return list(result.all())


async def get_alert(
        session: AsyncSession,
        school_id: int,
        alert_id: int,
) -> SecurityAlert | None:
    """Retrieve one security alert belonging to the school."""

    return await session.scalar(
        select(SecurityAlert).where(
            SecurityAlert.id == alert_id,
            SecurityAlert.school_id == school_id,
        )
    )


async def resolve_alert(
        session: AsyncSession,
        school_id: int,
        alert_id: int,
        actor_id: int,
) -> SecurityAlert | None:
    """Resolve an open security alert and audit who resolved it.

    Returns None if the alert is not in the school. Raises ValueError if it
    is already resolved; the conditional update means only one of several
    simultaneous resolutions succeeds.
    """

    alert = await get_alert(session, school_id, alert_id)

    if alert is None:
        return None

    resolved_id = await session.scalar(
        update(SecurityAlert)
        .where(SecurityAlert.id == alert.id, SecurityAlert.resolved_at.is_(None))
        .values(resolved_at=datetime.now(timezone.utc))
        .returning(SecurityAlert.id)
    )

    if resolved_id is None:
        raise ValueError("Security alert is already resolved")

    await record_audit(
        session=session,
        school_id=school_id,
        user_id=actor_id,
        action=ALERT_RESOLVED,
        entity_type="security_alert",
        entity_id=alert.id,
        metadata={"alert_type": alert.alert_type},
    )

    await session.commit()
    await session.refresh(alert)

    return alert


def security_alert_email(
        school_name: str,
        alerts: list[SecurityAlert],
        recipients: tuple[str, ...],
) -> EmailMessage:
    """Build the email telling school admins about new security alerts.

    Records are referred to by ID only, so no names or pickup codes are
    sent by email (SRS 20).
    """

    types = ", ".join(dict.fromkeys(alert.alert_type for alert in alerts))
    subject = f"Pikva security alert{'s' if len(alerts) > 1 else ''}: {types}"

    lines = [f"Pikva recorded {len(alerts)} security alert(s) at {school_name}.", ""]

    for alert in alerts:
        details = [f"Type: {alert.alert_type}", f"Alert #{alert.id}"]
        if alert.pupil_id is not None:
            details.append(f"Pupil #{alert.pupil_id}")
        if alert.authorisation_id is not None:
            details.append(f"Authorisation #{alert.authorisation_id}")
        if alert.attempted_by is not None:
            details.append(f"Staff #{alert.attempted_by}")

        when = alert.created_at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        lines += [f"- {when}: {alert.message}", f"  {' | '.join(details)}", ""]

    lines.append("Review and resolve these alerts in the Pikva dashboard.")
    lines.append(
        f"Pikva sends at most one alert email every "
        f"{ALERT_EMAIL_COOLDOWN_SECONDS // 60} minutes per school (repeated "
        f"failed attempts are always sent); later alerts appear in the dashboard."
    )

    return EmailMessage(to=recipients, subject=subject, text="\n".join(lines))


def _cooldown_key(school_id: int) -> str:
    """Return the Redis key marking a school's recent alert email."""

    return f"pikva:alert-email:school:{school_id}"


async def _claim_email_slot(redis: Redis, school_id: int, urgent: bool) -> bool:
    """Start the school's email cooldown; return whether to send.

    Urgent alerts are always sent. If Redis is unreachable the email is sent,
    since a missed alert is worse than an extra email.
    """

    try:
        claimed = await redis.set(
            _cooldown_key(school_id), "1", nx=True, ex=ALERT_EMAIL_COOLDOWN_SECONDS
        )
    except RedisError as exc:
        logger.warning("Alert email cooldown unavailable, sending: %s", type(exc).__name__)
        return True

    return bool(claimed) or urgent


async def _release_email_slot(redis: Redis, school_id: int) -> None:
    """End the school's cooldown after a failed send, so the next alert retries."""

    try:
        await redis.delete(_cooldown_key(school_id))
    except RedisError as exc:
        logger.warning("Alert email cooldown unavailable: %s", type(exc).__name__)


async def notify_security_alerts(
        school_id: int,
        alert_ids: list[int],
        sender: EmailSender | None = None,
        redis: Redis | None = None,
) -> bool:
    """Email a school's admins about new security alerts; never raises.

    Runs after the request has finished, so it opens its own session and
    loads only this school's alerts and admins. At most one email per school
    is sent per cooldown, except for repeated-attempts alerts.
    """

    redis = redis or redis_client

    try:
        async with async_session() as session:
            alerts = list(
                (
                    await session.scalars(
                        select(SecurityAlert)
                        .where(
                            SecurityAlert.id.in_(alert_ids),
                            SecurityAlert.school_id == school_id,
                        )
                        .order_by(SecurityAlert.id)
                    )
                ).all()
            )

            if not alerts:
                return False

            admin_emails = tuple(
                (
                    await session.scalars(
                        select(User.email)
                        .where(User.school_id == school_id, User.role == UserRole.SCHOOL_ADMIN)
                        .order_by(User.id)
                    )
                ).all()
            )
            school = await session.get(School, school_id)

    except Exception as exc:
        logger.error("Security alert notification failed: %s", type(exc).__name__)
        return False

    urgent = any(alert.alert_type == REPEATED_FAILED_ATTEMPTS for alert in alerts)

    if not await _claim_email_slot(redis, school_id, urgent):
        logger.info("Security alert email skipped during cooldown: %d alert(s)", len(alerts))
        return False

    message = security_alert_email(school.name, alerts, admin_emails)
    sent = await send_email_safely(message, sender)

    if not sent:
        await _release_email_slot(redis, school_id)

    return sent
