import logging
from datetime import datetime, timezone

from sqlalchemy import Select, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.pickup_authorisation import PickupAuthorisation
from app.models.pupil import Pupil
from app.schemas.pickup_authorisation import (
    PickupAuthorisationCreate,
    PickupAuthorisationUpdate,
)
from app.services.audit_service import (
    AUTHORISATION_ACTIVATED,
    AUTHORISATION_APPROVED,
    AUTHORISATION_CREATED,
    AUTHORISATION_DEACTIVATED,
    AUTHORISATION_PHOTO_REMOVED,
    AUTHORISATION_PHOTO_UPDATED,
    AUTHORISATION_UPDATED,
    record_audit,
)
from app.services.photo_service import PhotoStorage
from app.services.pupil_service import get_parent_pupil_by_id

logger = logging.getLogger(__name__)

async def create_pickup_authorisation(
        session: AsyncSession,
        school_id: int,
        parent_id: int,
        data: PickupAuthorisationCreate,
) -> PickupAuthorisation | None:
    """Create a pickup authorisation for a parent's pupil.

    It starts unapproved (approved_at None) until a school admin approves
    it (SRS 9.2).
    """

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
        type = data.type,
        starts_at = data.starts_at,
        expires_at = data.expires_at,
    )

    session.add(authorisation)
    await session.flush()

    await record_audit(
        session=session,
        school_id=school_id,
        user_id=parent_id,
        action=AUTHORISATION_CREATED,
        entity_type="pickup_authorisation",
        entity_id=authorisation.id,
        metadata={"pupil_id": authorisation.pupil_id},
    )

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
        actor_id: int,
) -> PickupAuthorisation | None:
    """Update the details and validity period of an accessible authorisation.

    actor_id is the user making the change, recorded in the audit log.
    """

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

    # A parent's change needs the school's approval again, so an approved
    # person cannot be swapped for someone else (SRS 9.2).
    approval_reset = _reset_approval_if_parent(authorisation, parent_id, changed=bool(update_data))

    # Record which fields changed, not their personal values.
    await record_audit(
        session=session,
        school_id=school_id,
        user_id=actor_id,
        action=AUTHORISATION_UPDATED,
        entity_type="pickup_authorisation",
        entity_id=authorisation.id,
        metadata={
            "pupil_id": authorisation.pupil_id,
            "fields": sorted(update_data),
            "approval_reset": approval_reset,
        },
    )

    await session.commit()
    await session.refresh(authorisation)

    return authorisation


async def set_pickup_authorisation_active(
        session: AsyncSession,
        school_id: int,
        parent_id: int | None,
        authorisation_id: int,
        is_active: bool,
        actor_id: int,
) -> PickupAuthorisation | None:
    """Activate or deactivate an accessible pickup authorisation.

    actor_id is the user making the change, recorded in the audit log.
    """

    authorisation = await get_pickup_authorisation(
        session=session,
        school_id=school_id,
        parent_id=parent_id,
        authorisation_id=authorisation_id,
    )

    if authorisation is None:
        return None

    # A parent re-activating needs the school's approval again, so a parent
    # cannot undo an admin's deactivation (SRS 9.2).
    activated = is_active and not authorisation.is_active
    authorisation.is_active = is_active
    approval_reset = _reset_approval_if_parent(authorisation, parent_id, changed=activated)

    await record_audit(
        session=session,
        school_id=school_id,
        user_id=actor_id,
        action=AUTHORISATION_ACTIVATED if is_active else AUTHORISATION_DEACTIVATED,
        entity_type="pickup_authorisation",
        entity_id=authorisation.id,
        metadata={"pupil_id": authorisation.pupil_id, "approval_reset": approval_reset},
    )

    await session.commit()
    await session.refresh(authorisation)

    return authorisation


async def set_pickup_authorisation_photo(
        session: AsyncSession,
        school_id: int,
        parent_id: int,
        authorisation_id: int,
        photo: bytes | None,
        storage: PhotoStorage,
) -> PickupAuthorisation | None:
    """Replace (photo given) or remove (None) a parent's pickup person photo (SRS 9.3).

    photo must already be cleaned by process_photo. A new photo or a removal
    is a parent change, so an approved person needs approval again (SRS 9.2).
    The old file is deleted only after the change is saved.
    """

    authorisation = await get_pickup_authorisation(
        session=session,
        school_id=school_id,
        parent_id=parent_id,
        authorisation_id=authorisation_id,
    )

    if authorisation is None:
        return None

    old_key = authorisation.photo_key

    # Removing a photo that is not there changes nothing.
    if photo is None and old_key is None:
        return authorisation

    new_key = await storage.save(photo) if photo is not None else None

    authorisation.photo_key = new_key
    authorisation.photo_updated_at = datetime.now(timezone.utc) if new_key else None
    approval_reset = _reset_approval_if_parent(authorisation, parent_id, changed=True)

    await record_audit(
        session=session,
        school_id=school_id,
        user_id=parent_id,
        action=AUTHORISATION_PHOTO_UPDATED if new_key else AUTHORISATION_PHOTO_REMOVED,
        entity_type="pickup_authorisation",
        entity_id=authorisation.id,
        metadata={"pupil_id": authorisation.pupil_id, "approval_reset": approval_reset},
    )

    try:
        await session.commit()
    except Exception:
        # Not saved: the new file belongs to nothing.
        if new_key is not None:
            await storage.delete(new_key)
        raise

    if old_key is not None:
        await _delete_photo_quietly(storage, old_key)

    await session.refresh(authorisation)

    return authorisation


async def _delete_photo_quietly(storage: PhotoStorage, key: str) -> None:
    """Delete a replaced photo; a failure is logged, never raised.

    The change is already saved, so a leftover file only wastes space.
    """

    try:
        await storage.delete(key)
    except Exception as exc:
        logger.error("Old pickup person photo not deleted: %s", type(exc).__name__)


async def get_pickup_authorisation_photo(
        session: AsyncSession,
        school_id: int,
        parent_id: int | None,
        authorisation_id: int,
        storage: PhotoStorage,
) -> bytes | None:
    """Return an accessible pickup person's photo, or None (SRS 9.3).

    parent_id limits parents to their own pupils; staff pass None for their
    whole school.
    """

    authorisation = await get_pickup_authorisation(
        session=session,
        school_id=school_id,
        parent_id=parent_id,
        authorisation_id=authorisation_id,
    )

    if authorisation is None or authorisation.photo_key is None:
        return None

    return await storage.read(authorisation.photo_key)


def _reset_approval_if_parent(
        authorisation: PickupAuthorisation,
        parent_id: int | None,
        changed: bool,
) -> bool:
    """Clear the approval when a parent changed an approved authorisation.

    parent_id is set only for parents; staff changes keep the approval.
    Returns whether an approval was cleared.
    """

    if parent_id is None or not changed or authorisation.approved_at is None:
        return False

    authorisation.approved_at = None
    return True


async def approve_pickup_authorisation(
        session: AsyncSession,
        school_id: int,
        authorisation_id: int,
        seen_updated_at: datetime,
        actor_id: int,
) -> PickupAuthorisation | None:
    """Approve a pending authorisation in the admin's school (SRS 9.2).

    seen_updated_at is the updated_at the admin was shown; if the parent has
    changed the authorisation since, nothing is approved, so an admin never
    approves details they have not seen. Returns None if the authorisation is
    not in the school. Raises ValueError if it is already approved or has
    changed; the conditional update means only one approval succeeds.
    """

    authorisation = await get_pickup_authorisation(
        session=session,
        school_id=school_id,
        parent_id=None,
        authorisation_id=authorisation_id,
    )

    if authorisation is None:
        return None

    approved_id = await session.scalar(
        update(PickupAuthorisation)
        .where(
            PickupAuthorisation.id == authorisation.id,
            PickupAuthorisation.approved_at.is_(None),
            PickupAuthorisation.updated_at == seen_updated_at,
        )
        .values(approved_at=datetime.now(timezone.utc))
        .returning(PickupAuthorisation.id)
    )

    if approved_id is None:
        # Read the current row, not the copy loaded above, to say why.
        approved_at = await session.scalar(
            select(PickupAuthorisation.approved_at).where(PickupAuthorisation.id == authorisation.id)
        )
        if approved_at is not None:
            raise ValueError("Pickup authorisation is already approved")
        raise ValueError("Pickup authorisation has changed; review it again before approving")

    await record_audit(
        session=session,
        school_id=school_id,
        user_id=actor_id,
        action=AUTHORISATION_APPROVED,
        entity_type="pickup_authorisation",
        entity_id=authorisation.id,
        metadata={"pupil_id": authorisation.pupil_id},
    )

    await session.commit()
    await session.refresh(authorisation)

    return authorisation
