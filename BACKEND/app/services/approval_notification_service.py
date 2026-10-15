import logging

from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy import select

from app.core.config import settings
from app.db.redis import redis_client
from app.db.session import async_session
from app.models.school import School
from app.models.user import User, UserRole
from app.services.notification_service import EmailMessage, EmailSender, send_email_safely

logger = logging.getLogger(__name__)

APPROVAL_EMAIL_COOLDOWN_SECONDS = 15 * 60


def approval_request_email(school_name: str, recipients: tuple[str, ...]) -> EmailMessage:
    """Build the email telling school admins a pickup person awaits approval (SRS 9.2).

    It names no pupil, pickup person or parent (SRS 20); the details are on
    the Approvals page behind sign-in.
    """

    link = f"{settings.web_app_url.rstrip('/')}/admin/approvals"

    return EmailMessage(
        to=recipients,
        subject="Pikva: a pickup person is waiting for approval",
        text=(
            f"A parent at {school_name} has added or changed a pickup person in Pikva. "
            "They cannot collect a pupil until a school administrator approves them.\n\n"
            f"Review waiting requests:\n{link}\n\n"
            f"Pikva sends at most one of these emails every "
            f"{APPROVAL_EMAIL_COOLDOWN_SECONDS // 60} minutes per school; "
            "later requests appear on the Approvals page.\n"
        ),
    )


def _cooldown_key(school_id: int) -> str:
    """Return the Redis key marking a school's recent approval email."""

    return f"pikva:approval-email:school:{school_id}"


async def _claim_email_slot(redis: Redis, school_id: int) -> bool:
    """Start the school's email cooldown; return whether to send.

    If Redis is unreachable the email is sent, since a request nobody sees
    is worse than an extra email.
    """

    try:
        claimed = await redis.set(
            _cooldown_key(school_id), "1", nx=True, ex=APPROVAL_EMAIL_COOLDOWN_SECONDS
        )
    except RedisError as exc:
        logger.warning("Approval email cooldown unavailable, sending: %s", type(exc).__name__)
        return True

    return bool(claimed)


async def _release_email_slot(redis: Redis, school_id: int) -> None:
    """End the school's cooldown after a failed send, so the next request retries."""

    try:
        await redis.delete(_cooldown_key(school_id))
    except RedisError as exc:
        logger.warning("Approval email cooldown unavailable: %s", type(exc).__name__)


async def notify_approval_requested(
        school_id: int,
        sender: EmailSender | None = None,
        redis: Redis | None = None,
) -> bool:
    """Email a school's admins that a pickup person awaits approval; never raises.

    Runs after the request has finished, so it opens its own session. At
    most one email per school is sent per cooldown. Returns whether an email
    was sent.
    """

    redis = redis or redis_client

    try:
        async with async_session() as session:
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
        logger.error("Approval notification failed: %s", type(exc).__name__)
        return False

    if school is None or not admin_emails:
        return False

    if not await _claim_email_slot(redis, school_id):
        logger.info("Approval email skipped during cooldown")
        return False

    sent = await send_email_safely(approval_request_email(school.name, admin_emails), sender)

    if not sent:
        await _release_email_slot(redis, school_id)

    return sent
