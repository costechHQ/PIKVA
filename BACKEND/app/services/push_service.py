"""Push notifications for new security alerts (SRS 13).

A push reaches an admin's browser through the browser's own push service,
even when the Pikva page is closed; the device plays its notification sound.
Messages never hold names or pickup codes, only what the alert email holds.
"""

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Protocol
from urllib.parse import urlsplit

from pywebpush import WebPushException, webpush
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import async_session
from app.models.push_subscription import PushSubscription
from app.models.security_alert import SecurityAlert
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)

# Browsers an admin can have at once (phone, laptop, ...); the oldest is dropped beyond this.
MAX_SUBSCRIPTIONS_PER_USER = 10

# How long a push service keeps a message for a browser that is offline.
PUSH_TTL_SECONDS = 60 * 60
PUSH_TIMEOUT_SECONDS = 10

# What a push service answers for a subscription that no longer exists.
GONE_STATUSES = frozenset({404, 410})

ALERTS_URL = "/admin/alerts"


@dataclass(frozen=True)
class PushTarget:
    """One browser to notify."""

    endpoint: str
    p256dh: str
    auth: str


class PushSender(Protocol):
    """Define anything that can deliver a push message."""

    async def send(self, target: PushTarget, payload: str) -> bool:
        """Deliver the payload. Return False when the subscription no longer exists; raise on any other failure."""


class WebPushSender:
    """Send pushes through the browsers' push services with VAPID."""

    def __init__(self, private_key: str, subject: str) -> None:
        self._private_key = private_key
        self._subject = subject

    async def send(self, target: PushTarget, payload: str) -> bool:
        """Send one message; the blocking HTTP call runs in a thread."""

        try:
            await asyncio.to_thread(
                webpush,
                subscription_info={"endpoint": target.endpoint, "keys": {"p256dh": target.p256dh, "auth": target.auth}},
                data=payload,
                vapid_private_key=self._private_key,
                vapid_claims={"sub": self._subject},
                ttl=PUSH_TTL_SECONDS,
                timeout=PUSH_TIMEOUT_SECONDS,
            )
        except WebPushException as exc:
            status = getattr(exc.response, "status_code", None)

            if status in GONE_STATUSES:
                return False

            raise

        return True


def get_push_sender() -> PushSender | None:
    """Return the sender, or None unless the VAPID settings are all present."""

    if not (settings.vapid_public_key and settings.vapid_private_key and settings.vapid_subject):
        return None

    return WebPushSender(settings.vapid_private_key.get_secret_value(), settings.vapid_subject)


def push_public_key() -> str | None:
    """Return the key browsers subscribe with, or None when pushes are not set up."""

    return settings.vapid_public_key if get_push_sender() is not None else None


async def save_subscription(
        session: AsyncSession,
        user_id: int,
        endpoint: str,
        p256dh: str,
        auth: str,
) -> None:
    """Save a browser's subscription for the user, replacing an earlier one for the same browser."""

    existing = await session.scalar(select(PushSubscription).where(PushSubscription.endpoint == endpoint))

    if existing is not None:
        # The same browser signed in as someone else: it now belongs to them.
        existing.user_id = user_id
        existing.p256dh = p256dh
        existing.auth = auth
        await session.commit()
        return

    owned = list(
        (
            await session.scalars(
                select(PushSubscription.id)
                .where(PushSubscription.user_id == user_id)
                .order_by(PushSubscription.id.desc())
            )
        ).all()
    )

    if len(owned) >= MAX_SUBSCRIPTIONS_PER_USER:
        await session.execute(
            delete(PushSubscription).where(PushSubscription.id.in_(owned[MAX_SUBSCRIPTIONS_PER_USER - 1:]))
        )

    session.add(PushSubscription(user_id=user_id, endpoint=endpoint, p256dh=p256dh, auth=auth))
    await session.commit()


async def remove_subscription(session: AsyncSession, user_id: int, endpoint: str) -> None:
    """Remove one of the user's own subscriptions; an unknown one is ignored."""

    await session.execute(
        delete(PushSubscription).where(
            PushSubscription.user_id == user_id,
            PushSubscription.endpoint == endpoint,
        )
    )
    await session.commit()


def alert_push_payload(alerts: list[SecurityAlert], reminder: bool = False) -> str:
    """Build the notification: a title, the alert's own message and where to look."""

    if len(alerts) == 1:
        body = alerts[0].message
    elif reminder:
        body = f"{len(alerts)} security alerts are still open. Open the dashboard to review them."
    else:
        body = f"{len(alerts)} new security alerts. Open the dashboard to review them."

    return json.dumps(
        {
            "title": "Pikva security alert, still open" if reminder else "Pikva security alert",
            "body": body,
            "url": ALERTS_URL,
            "tag": "pikva-security-alert",
        }
    )


async def push_security_alerts(
        school_id: int,
        alert_ids: list[int],
        sender: PushSender | None = None,
) -> int:
    """Push new security alerts to every subscribed admin browser at the school; never raises.

    Runs after the request has finished. Every alert is pushed: unlike the
    email there is no cooldown. Subscriptions a push service reports gone
    are deleted. Returns how many browsers were reached.
    """

    sender = sender or get_push_sender()

    if sender is None:
        return 0

    try:
        async with async_session() as session:
            alerts = list(
                (
                    await session.scalars(
                        select(SecurityAlert)
                        .where(SecurityAlert.id.in_(alert_ids), SecurityAlert.school_id == school_id)
                        .order_by(SecurityAlert.id)
                    )
                ).all()
            )
    except Exception as exc:
        logger.error("Push notification lookup failed: %s", type(exc).__name__)
        return 0

    if not alerts:
        return 0

    return await _push_to_school_admins(school_id, alert_push_payload(alerts), sender)


async def _push_to_school_admins(school_id: int, payload: str, sender: PushSender) -> int:
    """Send the payload to every active admin browser at the school; never raises. Returns how many were reached."""

    try:
        async with async_session() as session:
            rows = (
                await session.execute(
                    select(PushSubscription.id, PushSubscription.endpoint, PushSubscription.p256dh, PushSubscription.auth)
                    .join(User, User.id == PushSubscription.user_id)
                    .where(
                        User.school_id == school_id,
                        User.role == UserRole.SCHOOL_ADMIN,
                        User.deactivated_at.is_(None),
                    )
                    .order_by(PushSubscription.id)
                )
            ).all()
    except Exception as exc:
        logger.error("Push notification lookup failed: %s", type(exc).__name__)
        return 0

    reached = 0
    gone: list[int] = []

    for subscription_id, endpoint, p256dh, auth in rows:
        try:
            if await sender.send(PushTarget(endpoint, p256dh, auth), payload):
                reached += 1
            else:
                gone.append(subscription_id)
        except Exception as exc:
            # The address is private to the browser, so only the service's host is logged.
            logger.warning(
                "Push notification failed: %s (%s)", type(exc).__name__, urlsplit(endpoint).hostname
            )

    if gone:
        try:
            async with async_session() as session:
                await session.execute(delete(PushSubscription).where(PushSubscription.id.in_(gone)))
                await session.commit()
        except Exception as exc:
            logger.error("Removing expired push subscriptions failed: %s", type(exc).__name__)

    return reached


# One repeating task per school, kept here so it is not garbage collected while it runs.
_repeaters: dict[int, asyncio.Task[None]] = {}


async def _open_recent_alerts(school_id: int) -> list[SecurityAlert]:
    """Return the school's unresolved alerts raised within the repeat window, oldest first."""

    since = datetime.now(timezone.utc) - timedelta(minutes=settings.push_repeat_window_minutes)

    async with async_session() as session:
        return list(
            (
                await session.scalars(
                    select(SecurityAlert)
                    .where(
                        SecurityAlert.school_id == school_id,
                        SecurityAlert.resolved_at.is_(None),
                        SecurityAlert.created_at >= since,
                    )
                    .order_by(SecurityAlert.id)
                )
            ).all()
        )


async def repeat_open_alert_pushes(
        school_id: int,
        sender: PushSender,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> int:
    """Push a reminder every interval while the school has unresolved alerts; never raises.

    Stops once every alert is resolved, or older than the repeat window, so a
    forgotten alert cannot ring all night. Returns how many reminder rounds were sent.
    """

    rounds = 0

    while True:
        await sleep(settings.push_repeat_interval_seconds)

        try:
            alerts = await _open_recent_alerts(school_id)
        except Exception as exc:
            logger.error("Push reminder lookup failed: %s", type(exc).__name__)
            return rounds

        if not alerts:
            return rounds

        await _push_to_school_admins(school_id, alert_push_payload(alerts, reminder=True), sender)
        rounds += 1


async def push_new_security_alerts(school_id: int, alert_ids: list[int]) -> None:
    """Push new alerts now, then keep reminding the school's admins until the alerts are resolved.

    Reminders run as one task per school, so a second alert joins the one
    already running instead of doubling the pushes. They are lost if the server restarts.
    """

    await push_security_alerts(school_id, alert_ids)

    sender = get_push_sender()

    if sender is None or settings.push_repeat_interval_seconds <= 0:
        return

    running = _repeaters.get(school_id)

    if running is None or running.done():
        _repeaters[school_id] = asyncio.create_task(repeat_open_alert_pushes(school_id, sender))
