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
from app.schemas.auth import OwnDetailsUpdate, UserLogin, UserRegister
from app.services.audit_service import USER_CREATED, USER_UPDATED, record_audit

ACCOUNT_DEACTIVATED = "This account has been deactivated. Contact your school."


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

    # Only after the right password, so it reveals nothing to a guesser (SRS 6.7).
    if not user.is_active:
        raise ValueError(ACCOUNT_DEACTIVATED)

    access_token = create_access_token(str(user.id))

    return {
        "access_token": access_token,
        "token_type": "bearer",
    }


async def update_own_details(
        session: AsyncSession,
        user: User,
        data: OwnDetailsUpdate,
) -> User:
    """Change the signed-in user's own name and/or phone (SRS 6.9).

    Only changed fields are written and audited, by name only.
    """

    changes = {
        field: value
        for field, value in data.model_dump(exclude_unset=True).items()
        if getattr(user, field) != value
    }

    if not changes:
        return user

    for field, value in changes.items():
        setattr(user, field, value)

    await record_audit(
        session=session,
        school_id=user.school_id,
        user_id=user.id,
        action=USER_UPDATED,
        entity_type="user",
        entity_id=user.id,
        metadata={"fields": sorted(changes)},
    )

    await session.commit()
    await session.refresh(user)

    return user