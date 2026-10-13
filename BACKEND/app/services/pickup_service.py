import json
from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone
from enum import Enum

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import generate_pickup_code, hash_pickup_code
from app.models.pickup_authorisation import AuthorisationStatus, PickupAuthorisation
from app.models.pickup_code import DailyPickupCode
from app.models.pupil import Pupil
from app.schemas.pickup import PickupCodeResponse
from app.services.pickup_authorisation_service import get_pickup_authorisation

# A hash collision is astronomically unlikely; retry a few times, then fail.
MAX_CODE_ATTEMPTS = 5


class PickupCodeCheckResult(str, Enum):
    """Define the outcomes of checking a pickup code at the gate."""

    VALID = "valid"
    INVALID_CODE = "invalid_code"
    WRONG_PUPIL = "wrong_pupil"
    WRONG_AUTHORISATION = "wrong_authorisation"
    USED_CODE = "used_code"
    EXPIRED_CODE = "expired_code"
    AUTHORISATION_INACTIVE = "authorisation_inactive"
    AUTHORISATION_SCHEDULED = "authorisation_scheduled"
    AUTHORISATION_EXPIRED = "authorisation_expired"


_AUTHORISATION_FAILURES = {
    AuthorisationStatus.INACTIVE: PickupCodeCheckResult.AUTHORISATION_INACTIVE,
    AuthorisationStatus.SCHEDULED: PickupCodeCheckResult.AUTHORISATION_SCHEDULED,
    AuthorisationStatus.EXPIRED: PickupCodeCheckResult.AUTHORISATION_EXPIRED,
}


@dataclass
class PickupCodeCheck:
    """Hold the result of a code check and the records it matched, if any."""

    result: PickupCodeCheckResult
    code: DailyPickupCode | None = None
    authorisation: PickupAuthorisation | None = None


async def issue_pickup_code(
        session: AsyncSession,
        school_id: int,
        parent_id: int,
        authorisation_id: int,
) -> PickupCodeResponse | None:
    """Issue today's pickup code for a parent's active authorisation.

    Any unused code issued today for the same authorisation is expired, so
    only the newest code is valid. The plaintext code is returned once and
    only its hash is stored.
    """

    authorisation = await get_pickup_authorisation(
        session=session,
        school_id=school_id,
        parent_id=parent_id,
        authorisation_id=authorisation_id,
    )

    if authorisation is None:
        return None

    # Lock the authorisation so concurrent requests cannot both leave a valid
    # code, and re-read its status under the lock.
    await session.refresh(authorisation, with_for_update=True)

    now = datetime.now(timezone.utc)
    authorisation_status = authorisation.status_at(now)

    if authorisation_status != AuthorisationStatus.ACTIVE:
        raise ValueError(f"Pickup authorisation is {authorisation_status.value}")

    code_date = now.date()
    next_midnight = datetime.combine(
        code_date + timedelta(days=1), time.min, tzinfo=timezone.utc
    )
    expires_at = min(next_midnight, authorisation.expires_at)

    await session.execute(
        update(DailyPickupCode)
        .where(
            DailyPickupCode.authorisation_id == authorisation.id,
            DailyPickupCode.code_date == code_date,
            DailyPickupCode.used_at.is_(None),
            DailyPickupCode.expires_at > now,
        )
        .values(expires_at=now)
    )

    for _ in range(MAX_CODE_ATTEMPTS):
        code = generate_pickup_code()

        try:
            async with session.begin_nested():
                session.add(
                    DailyPickupCode(
                        pupil_id=authorisation.pupil_id,
                        authorisation_id=authorisation.id,
                        code_hash=hash_pickup_code(code),
                        code_date=code_date,
                        expires_at=expires_at,
                    )
                )

        except IntegrityError:
            continue

        await session.commit()

        return PickupCodeResponse(
            authorisation_id=authorisation.id,
            pupil_id=authorisation.pupil_id,
            code=code,
            code_date=code_date,
            expires_at=expires_at,
        )

    raise RuntimeError("Could not generate a unique pickup code")


def code_from_qr_data(qr_data: str) -> str | None:
    """Extract the pickup code from scanned QR data, or None if malformed.

    Only the code is trusted; the date and expiry in the QR payload are
    ignored because the backend decides validity from the database.
    """

    try:
        payload = json.loads(qr_data)
    except ValueError:
        return None

    code = payload.get("code") if isinstance(payload, dict) else None

    return code if isinstance(code, str) and code.strip() else None


async def check_pickup_code(
        session: AsyncSession,
        school_id: int,
        code: str,
        pupil_id: int | None = None,
        authorisation_id: int | None = None,
) -> PickupCodeCheck:
    """Check a plaintext pickup code within the staff member's school.

    When pupil_id or authorisation_id is given, the code must belong to that
    pupil or authorisation. Codes from other schools are reported as invalid
    so their existence is never revealed.
    """

    row = (
        await session.execute(
            select(DailyPickupCode, PickupAuthorisation)
            .join(
                PickupAuthorisation,
                DailyPickupCode.authorisation_id == PickupAuthorisation.id,
            )
            .join(Pupil, DailyPickupCode.pupil_id == Pupil.id)
            .where(
                DailyPickupCode.code_hash == hash_pickup_code(code),
                Pupil.school_id == school_id,
            )
        )
    ).one_or_none()

    if row is None:
        return PickupCodeCheck(PickupCodeCheckResult.INVALID_CODE)

    pickup_code, authorisation = row
    now = datetime.now(timezone.utc)

    if pupil_id is not None and pickup_code.pupil_id != pupil_id:
        result = PickupCodeCheckResult.WRONG_PUPIL
    elif authorisation_id is not None and authorisation.id != authorisation_id:
        result = PickupCodeCheckResult.WRONG_AUTHORISATION
    elif pickup_code.used_at is not None:
        result = PickupCodeCheckResult.USED_CODE
    elif now >= pickup_code.expires_at:
        result = PickupCodeCheckResult.EXPIRED_CODE
    else:
        result = _AUTHORISATION_FAILURES.get(
            authorisation.status_at(now),
            PickupCodeCheckResult.VALID,
        )

    return PickupCodeCheck(result, pickup_code, authorisation)


async def mark_code_used(
        session: AsyncSession,
        school_id: int,
        code_id: int,
) -> bool:
    """Atomically mark an unused, unexpired code as used.

    Returns False if the code was already used, has expired, or is outside
    the school. Does not commit: the caller commits together with the
    release record so both succeed or fail as one.
    """

    now = datetime.now(timezone.utc)

    marked_id = await session.scalar(
        update(DailyPickupCode)
        .where(
            DailyPickupCode.id == code_id,
            DailyPickupCode.used_at.is_(None),
            DailyPickupCode.expires_at > now,
            DailyPickupCode.pupil_id.in_(
                select(Pupil.id).where(Pupil.school_id == school_id)
            ),
        )
        .values(used_at=now)
        .returning(DailyPickupCode.id)
    )

    return marked_id is not None
