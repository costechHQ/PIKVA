from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.security import hash_password
from app.models.school import School
from app.models.user import User, UserRole
from app.schemas.auth import UserRegister


async def register_school_admin(
        session: AsyncSession,
        data: UserRegister,
):

    """Create a school and its first Admin User."""

    existing_user = await session.scalar(
        select(User).where(User.email == data.email)
    )

    if existing_user:
        raise ValueError("A user with this email already exists")

    school = School(
        name=data.school_name,
        address=data.school_address,
    )

    session.add(school)
    await session.flush()

    user = User(
        school_id = school.id,
        name = data.name,
        email = data.email,
        phone = data.phone,
        password_hash = hash_password(data.password),
        role = UserRole.SCHOOL_ADMIN,
    )

    session.add(user)
    await session.commit()
    await session.refresh(user)

    return user