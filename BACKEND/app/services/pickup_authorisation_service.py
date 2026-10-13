from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.pickup_authorisation import PickupAuthorisation
from app.models.pupil import Pupil
from app.schemas.pickup_authorisation import (
    PickupAuthorisationCreate,
    PickupAuthorisationUpdate,
)
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


def _scoped_authorisations(
        school_id: int,
        parent_id: int | None,
) -> Select[tuple[PickupAuthorisation]]:
    """Build a query limited to authorisations the caller may access.

    Authorisations are owned through their pupil. Every query is limited to
    the caller's school; when parent_id is given it is also limited to that
    parent's pupils. Pass parent_id=None only for school-wide staff roles.
    """

    query = (
        select(PickupAuthorisation)
        .join(Pupil, PickupAuthorisation.pupil_id == Pupil.id)
        .where(Pupil.school_id == school_id)
    )

    if parent_id is not None:
        query = query.where(Pupil.parent_id == parent_id)

    return query


async def list_pickup_authorisations(
        session: AsyncSession,
        school_id: int,
        parent_id: int | None,
        pupil_id: int | None = None,
) -> list[PickupAuthorisation]:
    """List accessible pickup authorisations, optionally for one pupil."""

    query = _scoped_authorisations(school_id, parent_id)

    if pupil_id is not None:
        query = query.where(PickupAuthorisation.pupil_id == pupil_id)

    result = await session.scalars(query.order_by(PickupAuthorisation.id))

    return list(result.all())


async def get_pickup_authorisation(
        session: AsyncSession,
        school_id: int,
        parent_id: int | None,
        authorisation_id: int,
) -> PickupAuthorisation | None:
    """Retrieve one accessible pickup authorisation."""

    return await session.scalar(
        _scoped_authorisations(school_id, parent_id).where(
            PickupAuthorisation.id == authorisation_id
        )
    )


async def update_pickup_authorisation(
        session: AsyncSession,
        school_id: int,
        parent_id: int | None,
        authorisation_id: int,
        data: PickupAuthorisationUpdate,
) -> PickupAuthorisation | None:
    """Update the details and validity period of an accessible authorisation."""

    authorisation = await get_pickup_authorisation(
        session=session,
        school_id=school_id,
        parent_id=parent_id,
        authorisation_id=authorisation_id,
    )

    if authorisation is None:
        return None

    update_data = data.model_dump(exclude_unset=True)

    starts_at = update_data.get("starts_at", authorisation.starts_at)
    expires_at = update_data.get("expires_at", authorisation.expires_at)

    if expires_at <= starts_at:
        raise ValueError("Expiry time must be after start time")

    for field, value in update_data.items():
        setattr(authorisation, field, value)

    await session.commit()
    await session.refresh(authorisation)

    return authorisation


async def set_pickup_authorisation_active(
        session: AsyncSession,
        school_id: int,
        parent_id: int | None,
        authorisation_id: int,
        is_active: bool,
) -> PickupAuthorisation | None:
    """Activate or deactivate an accessible pickup authorisation."""

    authorisation = await get_pickup_authorisation(
        session=session,
        school_id=school_id,
        parent_id=parent_id,
        authorisation_id=authorisation_id,
    )

    if authorisation is None:
        return None

    authorisation.is_active = is_active

    await session.commit()
    await session.refresh(authorisation)

    return authorisation
