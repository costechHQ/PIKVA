from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.security import (
    create_access_token,
    hash_password, 
    verify_dummy_password,
    verify_password,
)
from app.models.school import School
from app.models.user import User, UserRole
from app.schemas.auth import UserLogin, UserRegister
from app.services.audit_service import USER_CREATED, record_audit


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
        password_hash = await hash_password(data.password),
        role = UserRole.SCHOOL_ADMIN,
    )

    session.add(user)
    await session.flush()

    await record_audit(
        session=session,
        school_id=school.id,
        user_id=user.id,
        action=USER_CREATED,
        entity_type="user",
        entity_id=user.id,
        metadata={"role": user.role.value, "via": "registration"},
    )

    await session.commit()
    await session.refresh(user)

    return user


async def login_user(
        session: AsyncSession,
        data: UserLogin,
):
    """Authenticate a user and return an access token."""

    user = await session.scalar(
        select(User).where(User.email == data.email)
    )

    if user is None:
        # Same Argon2 cost as a wrong password, so timing hides which emails exist.
        await verify_dummy_password(data.password)
        raise ValueError("Invalid email or password")

    if not await verify_password(data.password, user.password_hash):
        raise ValueError("Invalid email or password")

    access_token = create_access_token(str(user.id))

    return {
        "access_token": access_token,
        "token_type": "bearer",
    }