import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.pickup_authorisation import PickupAuthorisation
from app.models.pickup_code import PickupCodeCheckResult
from app.models.pupil import Pupil
from app.models.release import ReleaseRecord, ReleaseResult
from app.models.user import User
from app.schemas.pickup import GatePicker, GatePupil, PickupVerifyRequest
from app.schemas.release import PickupReleaseResponse, ReleaseHistoryItem, ReleaseStaff
from app.services.audit_service import PUPIL_RELEASED, record_audit
from app.services.pickup_service import (
    AlertNotifier,
    PickupCodeCheck,
    check_presented_code,
    mark_code_used,
    record_failed_check,
)

logger = logging.getLogger(__name__)


async def release_pupil(
        session: AsyncSession,
        school_id: int,
        staff_id: int,
        data: PickupVerifyRequest,
        notify: AlertNotifier | None = None,
) -> PickupReleaseResponse:
    """Release a pupil after gate staff confirm the pickup person.

    The code is checked again because it may have been used or expired since
    verification. Marking the code used, the release record and the audit
    entry are committed together, so a pupil is never released without a
    record and a code can release only once. Failures record security alerts
    and release nobody; once they are committed, notify (if given) is told
    about the new alerts.
    """

    check = await check_presented_code(session, school_id, data)

    if check.result == PickupCodeCheckResult.VALID:
        if not await mark_code_used(session, school_id, check.code.id):
            # Another gate used the code, or it expired, since it was checked.
            now = datetime.now(timezone.utc)
            reason = (
                PickupCodeCheckResult.EXPIRED_CODE
                if now >= check.code.expires_at
                else PickupCodeCheckResult.USED_CODE
            )
            check = PickupCodeCheck(reason, check.code, check.authorisation)

    if check.result != PickupCodeCheckResult.VALID:
        alert_ids = await record_failed_check(
            session, school_id, staff_id, check, data.method, "release"
        )
        await session.commit()

        if notify is not None:
            notify(school_id, alert_ids)

        return PickupReleaseResponse(result=check.result, method=data.method)

    release = ReleaseRecord(
        pupil_id=check.code.pupil_id,
        authorisation_id=check.authorisation.id,
        verified_by=staff_id,
        verification_method=data.method.value,
        result=ReleaseResult.RELEASED.value,
        released_at=datetime.now(timezone.utc),
    )
    session.add(release)
    await session.flush()

    await record_audit(
        session=session,
        school_id=school_id,
        user_id=staff_id,
        action=PUPIL_RELEASED,
        entity_type="release_record",
        entity_id=release.id,
        metadata={
            "pupil_id": release.pupil_id,
            "authorisation_id": release.authorisation_id,
            "verification_method": release.verification_method,
        },
    )

    pupil = await session.get(Pupil, release.pupil_id)
    await session.commit()

    logger.info(
        "Pupil released: release=%d school=%d staff=%d", release.id, school_id, staff_id
    )

    return PickupReleaseResponse(
        result=check.result,
        method=data.method,
        release_id=release.id,
        released_at=release.released_at,
        pupil=GatePupil.model_validate(pupil),
        authorisation=GatePicker.model_validate(check.authorisation),
    )


async def list_release_history(
        session: AsyncSession,
        school_id: int,
        parent_id: int | None,
        pupil_id: int | None = None,
        limit: int = 50,
        offset: int = 0,
        since: datetime | None = None,
        until: datetime | None = None,
) -> list[ReleaseHistoryItem]:
    """List accessible releases, newest first.

    Every query is limited to the caller's school; when parent_id is given it
    is also limited to that parent's pupils, and the releasing staff member
    is left out. Pass parent_id=None only for school-wide staff roles.
    """

    query = (
        select(ReleaseRecord, Pupil, PickupAuthorisation, User)
        .join(Pupil, ReleaseRecord.pupil_id == Pupil.id)
        .join(PickupAuthorisation, ReleaseRecord.authorisation_id == PickupAuthorisation.id)
        .join(User, ReleaseRecord.verified_by == User.id)
        .where(Pupil.school_id == school_id)
    )

    if parent_id is not None:
        query = query.where(Pupil.parent_id == parent_id)

    if pupil_id is not None:
        query = query.where(ReleaseRecord.pupil_id == pupil_id)

    # A half-open range, so consecutive days never share a release (SRS 18.8).
    if since is not None:
        query = query.where(ReleaseRecord.released_at >= since)

    if until is not None:
        query = query.where(ReleaseRecord.released_at < until)

    rows = await session.execute(
        query.order_by(ReleaseRecord.released_at.desc(), ReleaseRecord.id.desc())
        .limit(limit)
        .offset(offset)
    )

    return [
        ReleaseHistoryItem(
            id=release.id,
            pupil=GatePupil.model_validate(pupil),
            authorisation=GatePicker.model_validate(authorisation),
            # Parents are not told which staff member released the pupil (SRS 18.9).
            verified_by=ReleaseStaff.model_validate(staff) if parent_id is None else None,
            verification_method=release.verification_method,
            result=release.result,
            released_at=release.released_at,
        )
        for release, pupil, authorisation, staff in rows
    ]
