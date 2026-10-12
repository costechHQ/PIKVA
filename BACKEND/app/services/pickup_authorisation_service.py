from sqlalchemy.ext.asyncio import AsyncSession

from app.models.pickup_authorisation import PickupAuthorisation
from app.schemas.pickup_authorisation import PickupAuthorisationCreate
from app.services.pupil_service import get_parent_pupil_by_id

async def create_pickup_authorisation(
        session: AsyncSession,
        school_id: int,
        parent_id: int,
        data: PickupAuthorisationCreate,
) -> PickupAuthorisation | None:
    """Create a pickup authorisation for a parent's pupil."""

    pupil = await get_parent_pupil_by_id(
        session=session,
        school_id=school_id,
        parent_id=parent_id,
        pupil_id=data.pupil_id,
    )

    if pupil is None:
        return None

    if data.expires_at <= data.starts_at:
        raise ValueError("Expiry time must be after start time")

    authorisation = PickupAuthorisation(
        pupil_id = data.pupil_id,
        picker_name = data.picker_name,
        picker_phone = data.picker_phone,
        relationship = data.relationship,
        photo_url = data.photo_url,
        type = data.type,
        starts_at = data.starts_at,
        expires_at = data.expires_at,
    )

    session.add(authorisation)
    await session.commit()
    await session.refresh(authorisation)

    return authorisation