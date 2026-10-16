"""Service tests for password reset by email (SRS 6.6)."""

import logging
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select, update

from app.core.config import settings
from app.core.constants import PASSWORD_RESET_TOKEN_MINUTES
from app.core.security import hash_password_reset_token, verify_password
from app.db.session import async_session
from app.models.audit_log import AuditLog
from app.models.password_reset_token import PasswordResetToken
from app.models.school import School
from app.models.user import User, UserRole
from app.services.audit_service import PASSWORD_RESET, PASSWORD_RESET_REQUESTED
from app.services.notification_service import LogEmailSender, send_email_safely
from app.services.password_reset_service import (
    password_reset_email,
    request_password_reset,
    reset_password,
)

EMAIL = "reset-me@example.com"
NEW_PASSWORD = "A-brand-new-password-1"


@pytest.fixture
async def session():
    """Provide a database session on the test database."""

    async with async_session() as session:
        yield session


@pytest.fixture
async def user(session) -> User:
    """Create a school and one user who will reset their password."""

    school = School(name="Reset School", address="1 Test Road")
    session.add(school)
    await session.flush()

    user = User(
        school_id=school.id,
        name="Reset User",
        email=EMAIL,
        phone="0700000000",
        password_hash="old-hash",
        role=UserRole.GATE_STAFF,
    )
    session.add(user)
    await session.commit()

    return user


async def tokens_of(session, user_id: int) -> list[PasswordResetToken]:
    result = await session.scalars(
        select(PasswordResetToken)
        .execution_options(populate_existing=True)
        .where(PasswordResetToken.user_id == user_id)
        .order_by(PasswordResetToken.id)
    )
    return list(result)


async def audit_actions(session) -> list[str]:
    result = await session.scalars(select(AuditLog.action).order_by(AuditLog.id))
    return list(result)


# --- Request ---


async def test_unknown_email_creates_nothing(session, user):
    assert await request_password_reset(session, "nobody@example.com") is None

    assert await tokens_of(session, user.id) == []
    assert await audit_actions(session) == []


async def test_request_stores_only_the_hash(session, user):
    request = await request_password_reset(session, EMAIL)

    assert request is not None
    assert request.user.id == user.id
    assert len(request.token) >= 40

    [stored] = await tokens_of(session, user.id)
    assert stored.token_hash == hash_password_reset_token(request.token)
    assert stored.token_hash != request.token
    assert stored.used_at is None


async def test_request_expires_after_thirty_minutes(session, user):
    before = datetime.now(timezone.utc)

    await request_password_reset(session, EMAIL)

    [stored] = await tokens_of(session, user.id)
    lifetime = stored.expires_at - before
    assert timedelta(minutes=PASSWORD_RESET_TOKEN_MINUTES) <= lifetime
    assert lifetime < timedelta(minutes=PASSWORD_RESET_TOKEN_MINUTES, seconds=5)


async def test_new_request_cancels_older_links(session, user):
    first = await request_password_reset(session, EMAIL)
    second = await request_password_reset(session, EMAIL)

    assert await reset_password(session, first.token, NEW_PASSWORD) is False
    assert await reset_password(session, second.token, NEW_PASSWORD) is True


async def test_request_is_audited(session, user):
    await request_password_reset(session, EMAIL)

    assert await audit_actions(session) == [PASSWORD_RESET_REQUESTED]


# --- Reset ---


async def test_reset_sets_new_password_and_change_time(session, user):
    request = await request_password_reset(session, EMAIL)
    before = datetime.now(timezone.utc)

    assert await reset_password(session, request.token, NEW_PASSWORD) is True

    updated = await session.get(User, user.id, populate_existing=True)
    assert await verify_password(NEW_PASSWORD, updated.password_hash)
    assert updated.password_changed_at >= before


async def test_reset_marks_link_used_and_audits(session, user):
    request = await request_password_reset(session, EMAIL)

    await reset_password(session, request.token, NEW_PASSWORD)

    [stored] = await tokens_of(session, user.id)
    assert stored.used_at is not None
    assert await audit_actions(session) == [PASSWORD_RESET_REQUESTED, PASSWORD_RESET]


async def test_link_works_only_once(session, user):
    request = await request_password_reset(session, EMAIL)

    assert await reset_password(session, request.token, NEW_PASSWORD) is True
    assert await reset_password(session, request.token, "Another-password-2") is False


async def test_expired_link_is_refused(session, user):
    request = await request_password_reset(session, EMAIL)
    await session.execute(
        update(PasswordResetToken)
        .where(PasswordResetToken.user_id == user.id)
        .values(expires_at=datetime.now(timezone.utc) - timedelta(seconds=1))
    )
    await session.commit()

    assert await reset_password(session, request.token, NEW_PASSWORD) is False

    unchanged = await session.get(User, user.id, populate_existing=True)
    assert unchanged.password_hash == "old-hash"
    assert unchanged.password_changed_at is None


async def test_unknown_token_is_refused(session, user):
    await request_password_reset(session, EMAIL)

    assert await reset_password(session, "not-a-real-token", NEW_PASSWORD) is False
    assert await audit_actions(session) == [PASSWORD_RESET_REQUESTED]


# --- Email ---


async def test_email_links_to_web_reset_page(session, user, monkeypatch):
    monkeypatch.setattr(settings, "web_app_url", "https://pikva.example/")
    request = await request_password_reset(session, EMAIL)

    message = password_reset_email(request)

    assert message.to == (EMAIL,)
    assert message.subject == "Reset your Pikva password"
    assert f"https://pikva.example/reset-password?token={request.token}\n" in message.text
    assert f"{PASSWORD_RESET_TOKEN_MINUTES} minutes" in message.text


async def test_emailed_link_resets_the_password(session, user):
    """The token in the link is exactly the one the reset accepts."""

    request = await request_password_reset(session, EMAIL)
    message = password_reset_email(request)
    token = message.text.split("?token=", 1)[1].split()[0]

    assert await reset_password(session, token, NEW_PASSWORD) is True


async def test_logged_email_never_contains_the_link(session, user, caplog):
    """Without Resend, the log shows only the subject."""

    request = await request_password_reset(session, EMAIL)

    with caplog.at_level(logging.DEBUG):
        await send_email_safely(password_reset_email(request), LogEmailSender())

    assert request.token not in caplog.text
    assert EMAIL not in caplog.text
