from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.pupil import Pupil
from app.schemas.pupil import PupilCreate

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
