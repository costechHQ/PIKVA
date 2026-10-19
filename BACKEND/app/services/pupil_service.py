import logging
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import Select, select
from sqlalchemy.orm import selectinload

from app.models.pupil import Pupil
from app.models.user import User, UserRole
from app.schemas.pupil import PupilCreate, PupilUpdate
from app.services.audit_service import (
    PUPIL_CREATED,
    PUPIL_PHOTO_REMOVED,
    PUPIL_PHOTO_UPDATED,
    PUPIL_UPDATED,
    record_audit,
)
from app.services.photo_service import PhotoStorage

logger = logging.getLogger(__name__)


async def create_pupil(
        session: AsyncSession,
        school_id: int,
        parent_id: int | None,
        data: PupilCreate,
        actor_id: int,
) -> Pupil:
    """Create a pupil in the school for a parent.

    A parent (parent_id set) creates pupils for themselves and must not send
    data.parent_id. An admin (parent_id=None) must send data.parent_id, which
    must be a parent in the same school. Raises ValueError otherwise.
    """

    if parent_id is not None:
        if data.parent_id is not None:
            raise ValueError("Parents cannot choose a parent for a pupil")

        owner_id = parent_id

    else:
        if data.parent_id is None:
            raise ValueError("parent_id is required")

        owner_id = await session.scalar(
            select(User.id).where(
                User.id == data.parent_id,
                User.school_id == school_id,
                User.role == UserRole.PARENT,
            )
        )

        if owner_id is None:
            raise ValueError("Parent not found in this school")

    pupil = Pupil(
        school_id = school_id,
        parent_id = owner_id,
        first_name = data.first_name,
        last_name = data.last_name,
        photo_url = data.photo_url,
        date_of_birth = data.date_of_birth,
    )

    session.add(pupil)
    await session.flush()

    await record_audit(
        session=session,
        school_id=school_id,
        user_id=actor_id,
        action=PUPIL_CREATED,
        entity_type="pupil",
        entity_id=pupil.id,
        metadata={"parent_id": owner_id},
    )

    pupil_id = pupil.id
    await session.commit()

    # Re-read so the response includes the parent summary.
    return await get_pupil(session, school_id, None, pupil_id)


def _scoped_pupils(school_id: int, parent_id: int | None) -> Select[tuple[Pupil]]:
    """Build a query limited to pupils the caller may access.

    Every query is limited to the caller's school; when parent_id is given it
    is also limited to that parent's pupils. Pass parent_id=None only for
    school-wide staff roles. Loads each pupil's parent for the response.
    """

    query = select(Pupil).options(selectinload(Pupil.parent)).where(Pupil.school_id == school_id)

    if parent_id is not None:
        query = query.where(Pupil.parent_id == parent_id)

    return query


async def list_pupils(
        session: AsyncSession,
        school_id: int,
        parent_id: int | None,
) -> list[Pupil]:
    """List accessible pupils, ordered by name."""

    result = await session.scalars(
        _scoped_pupils(school_id, parent_id).order_by(
            Pupil.last_name, Pupil.first_name, Pupil.id
        )
    )

    return list(result.all())


async def get_pupil(
        session: AsyncSession,
        school_id: int,
        parent_id: int | None,
        pupil_id: int,
) -> Pupil | None:
    """Retrieve one accessible pupil."""

    return await session.scalar(
        _scoped_pupils(school_id, parent_id).where(Pupil.id == pupil_id)
    )


async def get_parent_pupil_by_id(
        session: AsyncSession,
        school_id: int,
        parent_id: int,
        pupil_id: int,
) -> Pupil | None:

    """Retrieve one pupil owned by a parent within their school."""

    return await get_pupil(session, school_id, parent_id, pupil_id)


async def update_pupil(
    session: AsyncSession,
    school_id: int,
    parent_id: int | None,
    pupil_id: int,
    data: PupilUpdate,
    actor_id: int,
) -> Pupil | None:
    """Update editable details of an accessible pupil.

    actor_id is the user making the change, recorded in the audit log.
    """
    pupil = await get_pupil(
        session=session,
        school_id=school_id,
        parent_id=parent_id,
        pupil_id=pupil_id,
    )

    if pupil is None:
        return None

    update_data = data.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(pupil, field, value)

    # Record which fields changed, not their personal values.
    await record_audit(
        session=session,
        school_id=school_id,
        user_id=actor_id,
        action=PUPIL_UPDATED,
        entity_type="pupil",
        entity_id=pupil.id,
        metadata={"fields": sorted(update_data)},
    )

    await session.commit()

    # Re-read so the response includes the parent summary.
    return await get_pupil(session, school_id, parent_id, pupil_id)


async def set_pupil_photo(
        session: AsyncSession,
        school_id: int,
        parent_id: int | None,
        pupil_id: int,
        photo: bytes | None,
        storage: PhotoStorage,
        actor_id: int,
) -> Pupil | None:
    """Replace (photo given) or remove (None) an accessible pupil's photo.

    photo must already be cleaned by process_photo. The old file is deleted
    only after the change is saved.
    """

    pupil = await get_pupil(
        session=session,
        school_id=school_id,
        parent_id=parent_id,
        pupil_id=pupil_id,
    )

    if pupil is None:
        return None

    old_key = pupil.photo_key

    # Removing a photo that is not there changes nothing.
    if photo is None and old_key is None:
        return pupil

    new_key = await storage.save(photo) if photo is not None else None

    pupil.photo_key = new_key
    pupil.photo_updated_at = datetime.now(timezone.utc) if new_key else None

    await record_audit(
        session=session,
        school_id=school_id,
        user_id=actor_id,
        action=PUPIL_PHOTO_UPDATED if new_key else PUPIL_PHOTO_REMOVED,
        entity_type="pupil",
        entity_id=pupil.id,
        metadata={"parent_id": pupil.parent_id},
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

    # Re-read so the response includes the parent summary.
    return await get_pupil(session, school_id, parent_id, pupil_id)


async def _delete_photo_quietly(storage: PhotoStorage, key: str) -> None:
    """Delete a replaced photo; a failure is logged, never raised.

    The change is already saved, so a leftover file only wastes space.
    """

    try:
        await storage.delete(key)
    except Exception as exc:
        logger.error("Old pupil photo not deleted: %s", type(exc).__name__)


async def get_pupil_photo(
        session: AsyncSession,
        school_id: int,
        parent_id: int | None,
        pupil_id: int,
        storage: PhotoStorage,
) -> bytes | None:
    """Return an accessible pupil's photo, or None.

    parent_id limits parents to their own pupils; staff pass None for their
    whole school.
    """

    pupil = await get_pupil(
        session=session,
        school_id=school_id,
        parent_id=parent_id,
        pupil_id=pupil_id,
    )

    if pupil is None or pupil.photo_key is None:
        return None

    return await storage.read(pupil.photo_key)
