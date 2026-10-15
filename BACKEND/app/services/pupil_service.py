from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import Select, select
from sqlalchemy.orm import selectinload

from app.models.pupil import Pupil
from app.models.user import User, UserRole
from app.schemas.pupil import PupilCreate, PupilUpdate
from app.services.audit_service import PUPIL_CREATED, PUPIL_UPDATED, record_audit

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
