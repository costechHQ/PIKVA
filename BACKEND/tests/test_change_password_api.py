"""API tests for changing a password while signed in (SRS 6.8)."""

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from sqlalchemy import select

import test_pickup_code_api as api
from app.core.config import settings
from app.core.constants import LOGIN_FAILURE_LIMIT
from app.db.session import async_session
from app.models.audit_log import AuditLog
from app.services import notification_service
from test_password_reset_api import token_in
from test_security_api import Outbox

CHANGE_URL = "/api/v1/auth/change-password"
NEW_PASSWORD = "A-brand-new-password-2"


@pytest.fixture
def outbox(monkeypatch):
    box = Outbox()
    monkeypatch.setattr(notification_service, "get_email_sender", lambda: box)
    return box


@pytest.fixture
async def school(client):
    return await api.create_school(client, "change")


async def change(client, headers, current=api.PASSWORD, new=NEW_PASSWORD):
    return await client.post(CHANGE_URL, headers=headers, json={"current_password": current, "new_password": new})


def token_from_a_minute_ago(user_id: int) -> dict[str, str]:
    """A session started on another device a minute before the change.

    Tokens carry whole-second issue times, so one made in the same second
    as the change would still pass; real other sessions are older.
    """

    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {"sub": str(user_id), "iat": now - timedelta(minutes=1), "exp": now + timedelta(minutes=30)},
        settings.secret_key,
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


async def test_change_keeps_this_device_and_signs_out_the_others(client, school, outbox):
    old_session = school["headers"]["parent"]
    me = (await client.get("/api/v1/auth/me", headers=old_session)).json()
    other_device = token_from_a_minute_ago(me["id"])
    assert (await client.get("/api/v1/auth/me", headers=other_device)).status_code == 200

    response = await change(client, old_session)

    assert response.status_code == 200
    new_session = {"Authorization": f"Bearer {response.json()['access_token']}"}
    assert (await client.get("/api/v1/auth/me", headers=new_session)).status_code == 200
    assert (await client.get("/api/v1/auth/me", headers=other_device)).status_code == 401
    # Old password out, new one in.
    old = await client.post("/api/v1/auth/login", json={"email": "parent-change@example.com", "password": api.PASSWORD})
    new = await client.post("/api/v1/auth/login", json={"email": "parent-change@example.com", "password": NEW_PASSWORD})
    assert (old.status_code, new.status_code) == (401, 200)


async def test_notice_is_emailed_and_the_change_audited(client, school, outbox):
    await change(client, school["headers"]["gate_staff"])

    [notice] = outbox.sent
    assert notice.to == ("gate_staff-change@example.com",)
    assert notice.subject == "Your Pikva password was changed"
    assert NEW_PASSWORD not in notice.text and "token" not in notice.text.lower()

    async with async_session() as session:
        actions = (await session.scalars(select(AuditLog.action).where(AuditLog.action == "user.password_changed"))).all()
    assert actions == ["user.password_changed"]


async def test_open_reset_links_stop_working(client, school, outbox):
    await client.post("/api/v1/auth/password-reset/request", json={"email": "parent-change@example.com"})
    link_token = token_in(outbox.sent[0])

    await change(client, school["headers"]["parent"])
    confirm = await client.post(
        "/api/v1/auth/password-reset/confirm", json={"token": link_token, "new_password": "Something-else-3"}
    )

    assert confirm.status_code == 400


async def test_wrong_current_password_is_refused_and_limited(client, school, outbox):
    headers = school["headers"]["admin"]

    for _ in range(LOGIN_FAILURE_LIMIT):
        wrong = await change(client, headers, current="not-my-password-1")
        assert wrong.status_code == 400
        assert wrong.json()["detail"] == "Your current password is not correct"

    # Locked now, even with the right password, and nothing changed.
    locked = await change(client, headers)
    assert locked.status_code == 429
    assert outbox.sent == []
    assert (await client.get("/api/v1/auth/me", headers=headers)).status_code == 200


@pytest.mark.parametrize(
    "body",
    [
        {"current_password": api.PASSWORD, "new_password": api.PASSWORD},
        {"current_password": api.PASSWORD, "new_password": "   "},
        {"current_password": api.PASSWORD},
        {"new_password": NEW_PASSWORD},
    ],
)
async def test_same_blank_or_missing_passwords_are_rejected(client, school, body):
    response = await client.post(CHANGE_URL, headers=school["headers"]["parent"], json=body)

    assert response.status_code == 422
