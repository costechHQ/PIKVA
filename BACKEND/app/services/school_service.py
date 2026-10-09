from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.school import School
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.schemas.auth import SchoolUserCreate


async def get_school_by_id(
    session: AsyncSession,
    school_id: int,
) -> School | None:
    """Retrieve a school using its database ID."""

    result = await session.execute(select(School).where(School.id == school_id))
    return result.scalar_one_or_none()


async def create_school_user(
        session: AsyncSession,
        school_id: int,
        data: SchoolUserCreate,
) -> User:
    """Create a user within the authenticated admin's school."""

    if data.role not in {UserRole.PARENT, UserRole.GATE_STAFF}:
        raise ValueError("School Admins can only create parents or gate staff")

    user = User(
        school_id=school_id,
        name=data.name,
        email=data.email,
        phone=data.phone,
        password_hash=hash_password(data.password),
        role=data.role,
    )

    session.add(user)
    await session.commit()
    await session.refresh(user)

    return user
