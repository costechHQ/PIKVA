"""API tests for password reset by email (SRS 6.6)."""

import logging
from datetime import datetime, timedelta, timezone

import httpx
import pytest

import test_pickup_code_api as api
from app.core.constants import (
    PASSWORD_RESET_CONFIRM_IP_LIMIT,
    PASSWORD_RESET_EMAIL_LIMIT,
    PASSWORD_RESET_IP_LIMIT,
)
from app.core.security import decode_access_token
from app.main import app
from app.routes.auth import PASSWORD_RESET_SENT
from app.services import notification_service
from test_security_api import Outbox
from test_session_revocation import token_issued_at

REQUEST_URL = "/api/v1/auth/password-reset/request"
CONFIRM_URL = "/api/v1/auth/password-reset/confirm"
EMAIL = "admin-reset@example.com"
NEW_PASSWORD = "A-brand-new-password-1"


@pytest.fixture
def outbox(monkeypatch):
    """Capture emails instead of sending them."""

    box = Outbox()
    monkeypatch.setattr(notification_service, "get_email_sender", lambda: box)

    return box


@pytest.fixture
async def admin(client) -> dict[str, str]:
    """Register a school and return its admin's Bearer header."""

    response = await client.post(
        "/api/v1/auth/register",
        json={
            "name": "reset Admin",
            "email": EMAIL,
            "phone": "0700000000",
            "password": api.PASSWORD,
            "school_name": "reset School",
            "school_address": "1 Test Road",
        },
    )
    assert response.status_code == 201

    return await api.login(client, EMAIL)


def token_in(message) -> str:
    """Return the reset token from an emailed link."""

    return message.text.split("?token=", 1)[1].split()[0]


async def request_reset(client, email: str = EMAIL) -> httpx.Response:
    return await client.post(REQUEST_URL, json={"email": email})


async def confirm(client, token: str, password: str = NEW_PASSWORD) -> httpx.Response:
    return await client.post(CONFIRM_URL, json={"token": token, "new_password": password})


# --- Request ---


async def test_known_email_gets_a_link(client, admin, outbox):
    response = await request_reset(client)

    assert response.status_code == 202
    assert response.json() == {"detail": PASSWORD_RESET_SENT}

    [message] = outbox.sent
    assert message.to == (EMAIL,)
    assert "/reset-password?token=" in message.text


async def test_unknown_email_gets_the_same_answer_and_no_email(client, admin, outbox):
    known = await request_reset(client)
    unknown = await request_reset(client, "nobody@example.com")

    assert unknown.status_code == known.status_code == 202
    assert unknown.json() == known.json()
    assert len(outbox.sent) == 1


async def test_request_rejects_a_bad_email(client):
    response = await request_reset(client, "not-an-email")

    assert response.status_code == 422


# --- Confirm ---


async def test_full_reset_flow(client, admin, outbox):
    """New password works, old password and old sessions do not."""

    user_id = decode_access_token(admin["Authorization"].removeprefix("Bearer "))["sub"]
    # An older session, issued well before the reset.
    old_session = {
        "Authorization": "Bearer "
        + token_issued_at(user_id, datetime.now(timezone.utc) - timedelta(seconds=5))
    }
    await request_reset(client)

    response = await confirm(client, token_in(outbox.sent[0]))

    assert response.status_code == 204
    assert response.content == b""

    new_login = await client.post(
        "/api/v1/auth/login", json={"email": EMAIL, "password": NEW_PASSWORD}
    )
    old_login = await client.post(
        "/api/v1/auth/login", json={"email": EMAIL, "password": api.PASSWORD}
    )
    assert new_login.status_code == 200
    assert old_login.status_code == 401
    assert (await client.get("/api/v1/auth/me", headers=old_session)).status_code == 401


async def test_link_works_only_once(client, admin, outbox):
    await request_reset(client)
    token = token_in(outbox.sent[0])

    assert (await confirm(client, token)).status_code == 204

    response = await confirm(client, token, "Another-password-2")

    assert response.status_code == 400
    assert response.json() == {"detail": "This reset link is invalid or has expired"}


async def test_unknown_token_is_400(client):
    response = await confirm(client, "not-a-real-token")

    assert response.status_code == 400


@pytest.mark.parametrize(
    "body",
    [
        {"token": "has/slash", "new_password": NEW_PASSWORD},
        {"token": "x" * 129, "new_password": NEW_PASSWORD},
        {"token": "abc", "new_password": "   "},
        {"token": "abc"},
    ],
)
async def test_confirm_rejects_bad_input(client, body):
    response = await client.post(CONFIRM_URL, json=body)

    assert response.status_code == 422


# --- Rate limits ---


async def test_request_limited_per_email(client):
    """Unknown emails are limited too, so 429 reveals nothing."""

    for _ in range(PASSWORD_RESET_EMAIL_LIMIT):
        assert (await request_reset(client, "nobody@example.com")).status_code == 202

    response = await request_reset(client, "nobody@example.com")

    assert response.status_code == 429
    assert int(response.headers["Retry-After"]) > 0


async def test_request_limited_per_ip(client):
    for number in range(PASSWORD_RESET_IP_LIMIT):
        assert (await request_reset(client, f"person{number}@example.com")).status_code == 202

    assert (await request_reset(client, "one-more@example.com")).status_code == 429


async def test_confirm_limited_per_ip(client):
    for _ in range(PASSWORD_RESET_CONFIRM_IP_LIMIT):
        assert (await confirm(client, "guess")).status_code == 400

    assert (await confirm(client, "guess")).status_code == 429

    transport = httpx.ASGITransport(app=app, client=("203.0.113.7", 50000))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as other:
        assert (await confirm(other, "guess")).status_code == 400


# --- Logs ---


async def test_logs_hold_no_email_or_token(client, admin, outbox, caplog):
    with caplog.at_level(logging.DEBUG):
        await request_reset(client)
        token = token_in(outbox.sent[0])
        await confirm(client, "wrong-token")
        await confirm(client, token)

    assert EMAIL not in caplog.text
    assert token not in caplog.text
