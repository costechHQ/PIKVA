from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.pickup_code import PickupCodeCheckResult
from app.models.security_alert import SecurityAlert

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
