from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.school import School
from app.core.security import unusable_password_hash
from app.models.user import User, UserRole
from app.schemas.auth import SchoolUserCreate, SchoolUserUpdate
from app.services.audit_service import (
    USER_ACTIVATED,
    USER_CREATED,
    USER_DEACTIVATED,
    USER_UPDATED,
    record_audit,
)
from app.services.notification_service import EmailMessage
from app.services.password_reset_service import account_setup_email, issue_password_reset_token

DUPLICATE_EMAIL = "A user with this email already exists"


@dataclass
class CreatedSchoolUser:
    """A new school user and the set-password email to send after commit."""

    user: User
    setup_email: EmailMessage


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
        actor_id: int,
) -> CreatedSchoolUser:
    """Create a user within the authenticated admin's school (SRS 6.7).

    The account gets an unusable password and a set-password token, both
    committed with the user; the caller sends setup_email after the commit.
    actor_id is the admin creating the user, recorded in the audit log.
    """

    if data.role not in {UserRole.PARENT, UserRole.GATE_STAFF}:
        raise ValueError("School Admins can only create parents or gate staff")

    existing_user = await session.scalar(select(User.id).where(User.email == data.email))

    if existing_user is not None:
        raise ValueError(DUPLICATE_EMAIL)

    user = User(
        school_id=school_id,
        name=data.name,
        email=data.email,
        phone=data.phone,
        password_hash=await unusable_password_hash(),
        role=data.role,
    )

    session.add(user)

    try:
        await session.flush()

    except IntegrityError as exc:
        # Another request created the same email after the check above.
        await session.rollback()
        raise ValueError(DUPLICATE_EMAIL) from exc

    setup = await issue_password_reset_token(session, user)
    school = await session.get(School, school_id)

    await record_audit(
        session=session,
        school_id=school_id,
        user_id=actor_id,
        action=USER_CREATED,
        entity_type="user",
        entity_id=user.id,
        metadata={"role": user.role.value, "via": "admin"},
    )

    # Built before the commit, while user and school are still loaded.
    setup_email = account_setup_email(setup, school.name)

    await session.commit()
    await session.refresh(user)

    return CreatedSchoolUser(user=user, setup_email=setup_email)


async def list_school_users(
        session: AsyncSession,
        school_id: int,
        role: UserRole | None = None,
        limit: int = 200,
        offset: int = 0,
) -> list[User]:
    """List users in the school, optionally of one role, ordered by name."""

    query = select(User).where(User.school_id == school_id)

    if role is not None:
        query = query.where(User.role == role)

    result = await session.scalars(
        query.order_by(User.name, User.id).limit(limit).offset(offset)
    )

    return list(result.all())


# Accounts an admin may edit and deactivate; never another administrator.
MANAGED_ROLES = (UserRole.PARENT, UserRole.GATE_STAFF)


async def get_managed_user(
        session: AsyncSession,
        school_id: int,
        user_id: int,
) -> User | None:
    """Return a parent or gate staff user in the school, or None (SRS 6.7)."""

    return await session.scalar(
        select(User).where(
            User.id == user_id,
            User.school_id == school_id,
            User.role.in_(MANAGED_ROLES),
        )
    )


async def update_school_user(
        session: AsyncSession,
        school_id: int,
        user_id: int,
        data: SchoolUserUpdate,
        actor_id: int,
) -> User | None:
    """Change a parent's or gate staff member's name, email or phone (SRS 6.7).

    Returns None if the user is not one the admin may manage. Raises
    ValueError if the new email is already used. Only the names of the
    changed fields are audited.
    """

    user = await get_managed_user(session, school_id, user_id)

    if user is None:
        return None

    changes = {
        field: value
        for field, value in data.model_dump(exclude_unset=True).items()
        if getattr(user, field) != value
    }

    if not changes:
        return user

    if "email" in changes:
        taken = await session.scalar(
            select(User.id).where(User.email == changes["email"], User.id != user.id)
        )
        if taken is not None:
            raise ValueError(DUPLICATE_EMAIL)

    for field, value in changes.items():
        setattr(user, field, value)

    try:
        await session.flush()
    except IntegrityError as exc:
        # Another request took the same email after the check above.
        await session.rollback()
        raise ValueError(DUPLICATE_EMAIL) from exc

    await record_audit(
        session=session,
        school_id=school_id,
        user_id=actor_id,
        action=USER_UPDATED,
        entity_type="user",
        entity_id=user.id,
        metadata={"fields": sorted(changes)},
    )

    await session.commit()
    await session.refresh(user)

    return user


async def set_school_user_active(
        session: AsyncSession,
        school_id: int,
        user_id: int,
        is_active: bool,
        actor_id: int,
) -> User | None:
    """Deactivate or reactivate a parent or gate staff account (SRS 6.7).

    A deactivated user cannot sign in and their existing sessions stop
    working (see get_current_user). Returns None if the user is not one the
    admin may manage; asking for the current state changes nothing.
    """

    user = await get_managed_user(session, school_id, user_id)

    if user is None or user.is_active == is_active:
        return user

    user.deactivated_at = None if is_active else datetime.now(timezone.utc)

    await record_audit(
        session=session,
        school_id=school_id,
        user_id=actor_id,
        action=USER_ACTIVATED if is_active else USER_DEACTIVATED,
        entity_type="user",
        entity_id=user.id,
        metadata={"role": user.role.value},
    )

    await session.commit()
    await session.refresh(user)

    return user
