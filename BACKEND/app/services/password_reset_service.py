"""Password reset by email (SRS 6.6) and changing a password while signed in (SRS 6.8)."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.constants import PASSWORD_RESET_TOKEN_MINUTES
from app.core.security import (
    create_access_token,
    generate_password_reset_token,
    hash_password,
    hash_password_reset_token,
    verify_password,
)
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User
from app.services.audit_service import (
    PASSWORD_CHANGED,
    PASSWORD_RESET,
    PASSWORD_RESET_REQUESTED,
    record_audit,
)
from app.services.notification_service import EmailMessage


@dataclass
class PasswordResetRequest:
    """A new reset link's plaintext token and its user, for the email only."""

    user: User
    token: str


async def request_password_reset(
        session: AsyncSession,
        email: str,
) -> PasswordResetRequest | None:
    """Create a reset token for the account with this email, if any.

    Returns None for an unknown email or a deactivated account; the caller must answer the same way
    either way. Older unused tokens for the user are cancelled, only the
    token's hash is stored, and the request is audited. Commits.
    """

    user = await session.scalar(select(User).where(User.email == email))

    # A deactivated account gets no link either, answered the same way (SRS 6.7).
    if user is None or not user.is_active:
        return None

    request = await issue_password_reset_token(session, user)

    await record_audit(
        session=session,
        school_id=user.school_id,
        user_id=user.id,
        action=PASSWORD_RESET_REQUESTED,
        entity_type="user",
        entity_id=user.id,
    )

    await session.commit()

    return request


async def issue_password_reset_token(session: AsyncSession, user: User) -> PasswordResetRequest:
    """Create a new reset token for the user, cancelling older open ones.

    Stores only the token's hash. Flushes but does not commit or audit, so
    callers commit it with their own change (reset request, account setup).
    """

    now = datetime.now(timezone.utc)
    await _cancel_open_tokens(session, user.id, now)

    token = generate_password_reset_token()
    session.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hash_password_reset_token(token),
            expires_at=now + timedelta(minutes=PASSWORD_RESET_TOKEN_MINUTES),
        )
    )
    await session.flush()

    return PasswordResetRequest(user=user, token=token)


def _reset_link(token: str) -> str:
    """Return the web page link that uses a reset token."""

    return f"{settings.web_app_url.rstrip('/')}/reset-password?token={token}"


def password_reset_email(request: PasswordResetRequest) -> EmailMessage:
    """Build the email carrying the reset link to the user.

    One of the two emails that must hold a secret (with account_setup_email):
    the link is single use and expires, and email senders never log bodies.
    """

    link = _reset_link(request.token)

    return EmailMessage(
        to=(request.user.email,),
        subject="Reset your Pikva password",
        text=(
            f"Hello {request.user.name},\n\n"
            "We received a request to reset your Pikva password. "
            "Open this link to choose a new one:\n\n"
            f"{link}\n\n"
            f"The link works once and expires in {PASSWORD_RESET_TOKEN_MINUTES} minutes. "
            "Resetting your password signs you out everywhere.\n\n"
            "If you did not ask for this, ignore this email; your password "
            "stays the same.\n"
        ),
    )


def account_setup_email(request: PasswordResetRequest, school_name: str) -> EmailMessage:
    """Build the email inviting a new school user to set a password (SRS 6.7)."""

    link = _reset_link(request.token)

    return EmailMessage(
        to=(request.user.email,),
        subject="Set up your Pikva account",
        text=(
            f"Hello {request.user.name},\n\n"
            f"{school_name} has created a Pikva account for you. "
            "Open this link to choose your password:\n\n"
            f"{link}\n\n"
            f"The link works once and expires in {PASSWORD_RESET_TOKEN_MINUTES} minutes. "
            "If it has expired, use \"Forgot password?\" on the Pikva sign-in page "
            "to get a new one.\n"
        ),
    )


async def reset_password(
        session: AsyncSession,
        token: str,
        new_password: str,
) -> bool:
    """Set a new password using an unused, unexpired reset token.

    The token is marked used by one atomic UPDATE, so a link works once even
    when used twice at the same moment. Sets password_changed_at, which
    signs out every older session. Returns False for a bad, used or expired
    token. Commits.
    """

    now = datetime.now(timezone.utc)

    user_id = await session.scalar(
        update(PasswordResetToken)
        .where(
            PasswordResetToken.token_hash == hash_password_reset_token(token),
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
        .values(used_at=now)
        .returning(PasswordResetToken.user_id)
    )

    if user_id is None:
        return False

    user = await session.get(User, user_id)
    user.password_hash = await hash_password(new_password)
    user.password_changed_at = now

    await _cancel_open_tokens(session, user.id, now)

    await record_audit(
        session=session,
        school_id=user.school_id,
        user_id=user.id,
        action=PASSWORD_RESET,
        entity_type="user",
        entity_id=user.id,
    )

    await session.commit()

    return True


async def _cancel_open_tokens(session: AsyncSession, user_id: int, now: datetime) -> None:
    """Expire the user's unused reset tokens so older links stop working."""

    await session.execute(
        update(PasswordResetToken)
        .where(
            PasswordResetToken.user_id == user_id,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
        .values(expires_at=now)
    )


# --- Change password while signed in (SRS 6.8) -----------------------------------

WRONG_CURRENT_PASSWORD = "Your current password is not correct"


@dataclass
class ChangedPassword:
    """A fresh access token for the device that made the change, and the notice to email."""

    access_token: str
    notice: EmailMessage


def password_changed_email(user: User, changed_at: datetime) -> EmailMessage:
    """Build the notice that a password was changed. It holds no secret."""

    when = changed_at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    return EmailMessage(
        to=(user.email,),
        subject="Your Pikva password was changed",
        text=(
            f"Hello {user.name},\n\n"
            f"The password for your Pikva account was changed at {when}. "
            "You have been signed out on your other devices.\n\n"
            "If you did not do this, reset your password now with \"Forgot password?\" "
            "on the Pikva sign-in page, and tell your school.\n"
        ),
    )


async def change_password(
        session: AsyncSession,
        user: User,
        current_password: str,
        new_password: str,
) -> ChangedPassword:
    """Change a signed-in user's password (SRS 6.8).

    Raises ValueError if the current password is wrong. Otherwise signs out
    every other session (password_changed_at), cancels open reset links,
    audits the change and commits. The new token is made after the change,
    so it is not itself signed out.
    """

    if not await verify_password(current_password, user.password_hash):
        raise ValueError(WRONG_CURRENT_PASSWORD)

    now = datetime.now(timezone.utc)
    user.password_hash = await hash_password(new_password)
    user.password_changed_at = now

    await _cancel_open_tokens(session, user.id, now)

    await record_audit(
        session=session,
        school_id=user.school_id,
        user_id=user.id,
        action=PASSWORD_CHANGED,
        entity_type="user",
        entity_id=user.id,
    )

    # Built before the commit, while the user is still loaded.
    notice = password_changed_email(user, now)
    user_id = user.id
    await session.commit()

    return ChangedPassword(access_token=create_access_token(str(user_id)), notice=notice)
