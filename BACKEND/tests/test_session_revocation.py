"""Tests that a password reset signs out older sessions (SRS 6.6)."""

from datetime import datetime, timedelta, timezone

import jwt
from sqlalchemy import update

import test_pickup_code_api as api
from app.core.config import settings
from app.core.security import decode_access_token
from app.db.session import async_session
from app.models.user import User

ADMIN_EMAIL = "admin-rev@example.com"


async def register_admin(client) -> dict[str, str]:
    """Register a school and return its admin's Bearer header."""

    response = await client.post(
        "/api/v1/auth/register",
        json={
            "name": "rev Admin",
            "email": ADMIN_EMAIL,
            "phone": "0700000000",
            "password": api.PASSWORD,
            "school_name": "rev School",
            "school_address": "1 Test Road",
        },
    )
    assert response.status_code == 201

    return await api.login(client, ADMIN_EMAIL)


async def set_password_changed_at(when: datetime | None) -> None:
    """Record a password change for the test admin, as a reset would."""

    async with async_session() as session:
        await session.execute(
            update(User).where(User.email == ADMIN_EMAIL).values(password_changed_at=when)
        )
        await session.commit()


def token_of(headers: dict[str, str]) -> str:
    return headers["Authorization"].removeprefix("Bearer ")


async def test_new_tokens_carry_issued_at(client):
    """Login tokens include iat (issued-at) as whole seconds."""

    headers = await register_admin(client)

    payload = decode_access_token(token_of(headers))
    now = int(datetime.now(timezone.utc).timestamp())

    assert isinstance(payload["iat"], int)
    assert now - 5 <= payload["iat"] <= now


async def test_token_works_when_password_never_changed(client):
    headers = await register_admin(client)

    response = await client.get("/api/v1/auth/me", headers=headers)

    assert response.status_code == 200


async def test_token_issued_before_password_change_is_rejected(client):
    """A session from before the reset is signed out."""

    headers = await register_admin(client)
    await set_password_changed_at(datetime.now(timezone.utc) + timedelta(seconds=5))

    response = await client.get("/api/v1/auth/me", headers=headers)

    assert response.status_code == 401


async def test_token_issued_after_password_change_works(client):
    """Signing in again after the reset gives a working session."""

    await register_admin(client)
    await set_password_changed_at(datetime.now(timezone.utc) - timedelta(minutes=1))
    headers = await api.login(client, ADMIN_EMAIL)

    response = await client.get("/api/v1/auth/me", headers=headers)

    assert response.status_code == 200


async def test_login_in_the_same_second_as_the_change_works(client):
    """iat has no fractions of a second, so the comparison must not either."""

    headers = await register_admin(client)
    user_id = decode_access_token(token_of(headers))["sub"]
    second = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(seconds=10)
    await set_password_changed_at(second.replace(microsecond=999_999))

    same_second = {"Authorization": f"Bearer {token_issued_at(user_id, second)}"}
    second_before = {
        "Authorization": f"Bearer {token_issued_at(user_id, second - timedelta(seconds=1))}"
    }

    assert (await client.get("/api/v1/auth/me", headers=same_second)).status_code == 200
    assert (await client.get("/api/v1/auth/me", headers=second_before)).status_code == 401


def token_issued_at(user_id: str, issued_at: datetime) -> str:
    """A signed token with a chosen iat."""

    expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    return jwt.encode(
        {"sub": user_id, "iat": issued_at, "exp": expires_at},
        settings.secret_key,
        algorithm="HS256",
    )


def legacy_token(user_id: str) -> str:
    """A token shaped like those issued before iat existed."""

    expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    return jwt.encode({"sub": user_id, "exp": expires_at}, settings.secret_key, algorithm="HS256")


async def test_token_without_iat_works_until_a_password_change(client):
    """Deploying iat does not sign anyone out; a reset does."""

    headers = await register_admin(client)
    user_id = decode_access_token(token_of(headers))["sub"]
    old = {"Authorization": f"Bearer {legacy_token(user_id)}"}

    assert (await client.get("/api/v1/auth/me", headers=old)).status_code == 200

    await set_password_changed_at(datetime.now(timezone.utc) - timedelta(minutes=1))

    assert (await client.get("/api/v1/auth/me", headers=old)).status_code == 401
