"""API tests for renewing a session (SRS 6.10)."""

from datetime import datetime, timedelta, timezone

import jwt
import pytest

import test_pickup_code_api as api
from app.core.config import settings
from app.routes import auth as auth_routes

REFRESH_URL = "/api/v1/auth/refresh"
ME_URL = "/api/v1/auth/me"


@pytest.fixture
async def school(client):
    return await api.create_school(client, "refresh")


def claims_of(headers: dict[str, str]) -> dict:
    return jwt.decode(headers["Authorization"].removeprefix("Bearer "), settings.secret_key, algorithms=["HS256"])


def token_with(user_id: int, **claims) -> dict[str, str]:
    """A signed token with exactly the claims given, for cases login cannot make."""

    token = jwt.encode({"sub": str(user_id), **claims}, settings.secret_key, algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}


async def user_id_of(client, headers) -> int:
    return (await client.get(ME_URL, headers=headers)).json()["id"]


def bearer(response) -> dict[str, str]:
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def test_refresh_returns_a_working_token_with_the_same_auth_time(client, school):
    headers = school["headers"]["gate_staff"]
    old = claims_of(headers)

    response = await client.post(REFRESH_URL, headers=headers)

    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"
    new = claims_of(bearer(response))
    assert new["auth_time"] == old["auth_time"]
    assert new["sub"] == old["sub"]
    assert (await client.get(ME_URL, headers=bearer(response))).status_code == 200


async def test_a_renewed_token_never_outlives_the_maximum_age(client, school):
    parent = school["headers"]["parent"]
    now = datetime.now(timezone.utc)
    # Signed in 5 minutes short of the 30-day maximum, so only 5 minutes remain.
    auth_time = now - timedelta(days=settings.session_max_days_parent) + timedelta(minutes=5)
    near_the_end = token_with(
        await user_id_of(client, parent),
        iat=now - timedelta(minutes=1),
        auth_time=int(auth_time.timestamp()),
        exp=now + timedelta(minutes=4),
    )

    response = await client.post(REFRESH_URL, headers=near_the_end)

    assert response.status_code == 200
    new = claims_of(bearer(response))
    assert new["exp"] == int(auth_time.timestamp()) + settings.session_max_days_parent * 24 * 3600


async def test_a_session_past_its_maximum_age_cannot_be_renewed(client, school):
    admin = school["headers"]["admin"]
    now = datetime.now(timezone.utc)
    too_old = token_with(
        await user_id_of(client, admin),
        iat=now - timedelta(minutes=1),
        auth_time=int((now - timedelta(hours=settings.session_max_hours_staff, minutes=1)).timestamp()),
        exp=now + timedelta(minutes=10),
    )

    response = await client.post(REFRESH_URL, headers=too_old)

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid or expired token"


async def test_a_token_without_auth_time_cannot_be_renewed(client, school):
    parent = school["headers"]["parent"]
    now = datetime.now(timezone.utc)
    old_style = token_with(
        await user_id_of(client, parent), iat=now, exp=now + timedelta(minutes=10)
    )

    assert (await client.get(ME_URL, headers=old_style)).status_code == 200
    assert (await client.post(REFRESH_URL, headers=old_style)).status_code == 401


async def test_an_expired_token_cannot_be_renewed(client, school):
    parent = school["headers"]["parent"]
    now = datetime.now(timezone.utc)
    expired = token_with(
        await user_id_of(client, parent),
        iat=now - timedelta(hours=2),
        auth_time=int((now - timedelta(hours=2)).timestamp()),
        exp=now - timedelta(seconds=1),
    )

    assert (await client.post(REFRESH_URL, headers=expired)).status_code == 401


async def test_a_deactivated_user_cannot_renew(client, school):
    gate = school["headers"]["gate_staff"]
    gate_id = await user_id_of(client, gate)

    deactivated = await client.post(
        f"/api/v1/schools/users/{gate_id}/deactivate", headers=school["headers"]["admin"]
    )
    assert deactivated.status_code == 200

    assert (await client.post(REFRESH_URL, headers=gate)).status_code == 401


async def test_a_token_from_before_a_password_change_cannot_renew(client, school):
    parent = school["headers"]["parent"]
    parent_id = await user_id_of(client, parent)
    now = datetime.now(timezone.utc)
    # Another device, signed in a minute before the change.
    other_device = token_with(
        parent_id,
        iat=now - timedelta(minutes=1),
        auth_time=int((now - timedelta(minutes=1)).timestamp()),
        exp=now + timedelta(minutes=30),
    )
    assert (await client.post(REFRESH_URL, headers=other_device)).status_code == 200

    changed = await client.post(
        "/api/v1/auth/change-password",
        headers=parent,
        json={"current_password": api.PASSWORD, "new_password": "A-brand-new-password-2"},
    )
    assert changed.status_code == 200

    assert (await client.post(REFRESH_URL, headers=other_device)).status_code == 401


async def test_refresh_is_rate_limited_per_user(client, school, monkeypatch):
    monkeypatch.setattr(auth_routes, "SESSION_REFRESH_LIMIT", 2)
    headers = school["headers"]["parent"]

    assert (await client.post(REFRESH_URL, headers=headers)).status_code == 200
    assert (await client.post(REFRESH_URL, headers=headers)).status_code == 200
    limited = await client.post(REFRESH_URL, headers=headers)

    assert limited.status_code == 429
    assert "Retry-After" in limited.headers
    # Another user is not affected.
    assert (await client.post(REFRESH_URL, headers=school["headers"]["admin"])).status_code == 200


async def test_refresh_needs_a_token(client):
    assert (await client.post(REFRESH_URL)).status_code in (401, 403)
