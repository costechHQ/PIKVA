from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.pickup_code import PickupCodeCheckResult
from app.models.security_alert import SecurityAlert
from app.schemas.alert import AlertStatus
from app.services.audit_service import ALERT_RESOLVED, record_audit

# Raise a repeated-attempts alert after this many failures by one staff
# member within the window (SRS 11.3 "suspicious repeated attempts").
REPEATED_FAILURE_LIMIT = 5
REPEATED_FAILURE_WINDOW = timedelta(minutes=10)
REPEATED_FAILED_ATTEMPTS = "repeated_failed_attempts"

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
