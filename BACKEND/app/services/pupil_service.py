from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.pupil import Pupil
from app.schemas.pupil import PupilCreate, PupilUpdate

async def create_pupil(
        session: AsyncSession,
        school_id: int,
        parent_id: int,
        data: PupilCreate,
) -> Pupil:
    
    """Create a pupil under the specified school and parent."""

    pupil = Pupil(
        school_id = school_id,
        parent_id = parent_id,
        first_name = data.first_name,
        last_name = data.last_name,
        photo_url = data.photo_url,
        date_of_birth = data.date_of_birth,
    )

    session.add(pupil)
    await session.commit()
    await session.refresh(pupil)

    return pupil


async def get_parent_pupils(
        session: AsyncSession,
        school_id: int,
        parent_id: int,
)-> list[Pupil]:
    
    """Retrieve pupils belonging to a parent within their school."""

    result = await session.scalars(
        select(Pupil).where(
            Pupil.school_id == school_id,
            Pupil.parent_id == parent_id,
        )
    )

    return list(result.all())


async def get_parent_pupil_by_id(
        session: AsyncSession,
        school_id: int,
        parent_id: int,
        pupil_id: int,
) -> Pupil | None:

    """Retrieve one pupil owned by a parent within their school."""

    result = await session.scalar(
        select(Pupil).where(
            Pupil.id == pupil_id,
            Pupil.school_id == school_id,
            Pupil.parent_id == parent_id,
        )
    )

    return result


async def update_parent_pupil(
    session: AsyncSession,
    school_id: int,
    parent_id: int,
    pupil_id: int,
    data: PupilUpdate,
) -> Pupil | None:
    """Update editable details of a pupil owned by the parent."""
    pupil = await get_parent_pupil_by_id(
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

    await session.commit()
    await session.refresh(pupil)
    return pupil
