"""API tests for admin-created school users and their set-password email (SRS 6.7)."""

import pytest
from sqlalchemy import func, select, text

import test_pickup_code_api as api
from app.core.security import hash_password_reset_token
from app.db.session import async_session
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User
from app.services import notification_service
from test_password_reset_api import confirm, token_in
from test_security_api import Outbox

USERS_URL = "/api/v1/schools/users"
NEW_GATE = {"name": "Gina Gate", "email": "gina-gate@example.com", "phone": "0766666666", "role": "gate_staff"}
CHOSEN_PASSWORD = "Gina-chose-this-1"


@pytest.fixture
def outbox(monkeypatch):
    """Capture emails instead of sending them."""

    box = Outbox()
    monkeypatch.setattr(notification_service, "get_email_sender", lambda: box)

    return box


@pytest.fixture
async def school(client):
    """Provide one school with an admin, a parent, gate staff and an authorisation."""

    return await api.create_school(client, "users")


async def create(client, school, body=NEW_GATE):
    return await client.post(USERS_URL, headers=school["headers"]["admin"], json=body)


async def user_count(email: str) -> int:
    async with async_session() as session:
        return await session.scalar(select(func.count()).select_from(User).where(User.email == email))


async def test_new_user_is_emailed_a_set_password_link(client, school, outbox):
    response = await create(client, school)

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == NEW_GATE["email"]
    assert body["role"] == "gate_staff"
    assert body["setup_email_sent"] is True
    assert "password" not in str(body).lower()

    [message] = outbox.sent
    assert message.to == (NEW_GATE["email"],)
    assert message.subject == "Set up your Pikva account"
    assert "users School" in message.text
    assert "/reset-password?token=" in message.text


async def test_new_user_cannot_sign_in_until_they_set_a_password(client, school, outbox):
    await create(client, school)

    for guess in (api.PASSWORD, CHOSEN_PASSWORD, ""):
        response = await client.post("/api/v1/auth/login", json={"email": NEW_GATE["email"], "password": guess})
        assert response.status_code in (401, 422)

    assert (await confirm(client, token_in(outbox.sent[0]), CHOSEN_PASSWORD)).status_code == 204

    response = await client.post(
        "/api/v1/auth/login", json={"email": NEW_GATE["email"], "password": CHOSEN_PASSWORD}
    )
    assert response.status_code == 200


async def test_set_password_link_works_once(client, school, outbox):
    await create(client, school)
    token = token_in(outbox.sent[0])

    assert (await confirm(client, token, CHOSEN_PASSWORD)).status_code == 204
    assert (await confirm(client, token, "Another-password-2")).status_code == 400


async def test_only_the_token_hash_is_stored(client, school, outbox):
    await create(client, school)
    token = token_in(outbox.sent[0])

    async with async_session() as session:
        stored = (await session.scalars(select(PasswordResetToken.token_hash))).all()

    assert hash_password_reset_token(token) in stored
    assert token not in stored


async def test_admin_cannot_set_the_password(client, school, outbox):
    """A client still sending a password gets 422, and nothing is created."""

    response = await create(client, school, NEW_GATE | {"password": "admin-knows-it"})

    assert response.status_code == 422
    assert await user_count(NEW_GATE["email"]) == 0
    assert outbox.sent == []


async def test_duplicate_email_sends_no_email(client, school, outbox):
    response = await create(client, school, NEW_GATE | {"email": "parent-users@example.com"})

    assert response.status_code == 409
    assert outbox.sent == []


async def test_email_failure_does_not_undo_the_account(client, school, outbox):
    outbox.fail = True

    response = await create(client, school)

    assert response.status_code == 201
    assert response.json()["setup_email_sent"] is False
    assert await user_count(NEW_GATE["email"]) == 1


async def test_without_email_configured_the_admin_is_told_it_was_not_sent(client, school):
    """No Resend settings: the email is only logged, which is not sending it."""

    response = await create(client, school)

    assert response.status_code == 201
    assert response.json()["setup_email_sent"] is False


async def test_creation_is_audited_without_the_token(client, school, outbox):
    await create(client, school)
    token = token_in(outbox.sent[0])

    async with async_session() as session:
        rows = (
            await session.execute(
                text("SELECT action, metadata::text FROM audit_logs WHERE action = 'user.created'")
            )
        ).all()

    assert any('"gate_staff"' in (metadata or "") for _, metadata in rows)
    assert all(token not in (metadata or "") for _, metadata in rows)
