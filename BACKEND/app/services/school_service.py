from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.school import School


async def get_school_by_id(
    session: AsyncSession,
    school_id: int,
) -> School | None:
    """Retrieve a school using its database ID."""

    result = await session.execute(select(School).where(School.id == school_id))
    return result.scalar_one_or_none()
