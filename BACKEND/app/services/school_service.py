from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.school import School
from app.core.security import unusable_password_hash
from app.models.user import User, UserRole
from app.schemas.auth import SchoolUserCreate
from app.services.audit_service import USER_CREATED, record_audit
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
