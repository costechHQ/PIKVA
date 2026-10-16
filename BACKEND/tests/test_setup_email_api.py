"""API tests for "Send set-password link" (SRS 6.7)."""

import pytest
from sqlalchemy import select

import test_pickup_code_api as api
from app.core.constants import SETUP_EMAIL_ADMIN_LIMIT, SETUP_EMAIL_USER_LIMIT
from app.db.session import async_session
from app.models.audit_log import AuditLog
from app.services import notification_service
from test_password_reset_api import confirm, token_in
from test_security_api import Outbox

USERS_URL = "/api/v1/schools/users"


@pytest.fixture
def outbox(monkeypatch):
    """Capture emails instead of sending them."""

    box = Outbox()
    monkeypatch.setattr(notification_service, "get_email_sender", lambda: box)
    return box


@pytest.fixture
async def school(client):
    """One school with an admin, a parent, gate staff and an approved pickup person."""

    return await api.create_school(client, "setup")


async def add_gate(client, school, number: int = 1) -> int:
    """Create a gate staff member through the API and return their id."""

    response = await client.post(
        USERS_URL,
        headers=school["headers"]["admin"],
        json={"name": f"Gate {number}", "email": f"gate{number}-setup@example.com", "phone": "0700000000", "role": "gate_staff"},
    )
    assert response.status_code == 201
    return response.json()["id"]


async def role_id(client, school, role: str) -> int:
    [user] = (await client.get(USERS_URL, headers=school["headers"]["admin"], params={"role": role})).json()
    return user["id"]


async def send(client, school, user_id: int, role: str = "admin"):
    return await client.post(f"{USERS_URL}/{user_id}/setup-email", headers=school["headers"][role])


async def setup_audits(user_id: int) -> list[dict | None]:
    async with async_session() as session:
        rows = await session.scalars(
            select(AuditLog.metadata_)
            .where(AuditLog.entity_id == user_id, AuditLog.action == "user.setup_email_sent")
            .order_by(AuditLog.id)
        )
        return list(rows)


async def test_admin_sends_a_new_link_that_replaces_the_old_one(client, school, outbox):
    """The new link works; the one from account creation no longer does."""

    gate_id = await add_gate(client, school)
    first = token_in(outbox.sent[0])

    response = await send(client, school, gate_id)

    assert response.status_code == 200
    assert response.json() == {"email_sent": True}
    second_email = outbox.sent[1]
    assert second_email.to == ("gate1-setup@example.com",)
    assert second_email.subject == "Set up your Pikva account"

    assert (await confirm(client, first, "Gate-chose-this-1")).status_code == 400
    assert (await confirm(client, token_in(second_email), "Gate-chose-this-1")).status_code == 204


async def test_works_for_someone_who_already_has_a_password(client, school, outbox):
    """A parent who forgot their password can be sent a link too."""

    parent_id = await role_id(client, school, "parent")

    response = await send(client, school, parent_id)

    assert response.json() == {"email_sent": True}
    assert (await confirm(client, token_in(outbox.sent[-1]), "New-parent-pass-1")).status_code == 204


async def test_is_audited_with_the_result_and_never_the_token(client, school, outbox):
    parent_id = await role_id(client, school, "parent")

    await send(client, school, parent_id)
    token = token_in(outbox.sent[-1])

    assert await setup_audits(parent_id) == [{"sent": True}]

    async with async_session() as session:
        logged = await session.scalars(select(AuditLog.metadata_))
        assert token not in str(list(logged))


async def test_failed_or_unconfigured_email_is_reported_and_audited(client, school, outbox):
    parent_id = await role_id(client, school, "parent")
    outbox.fail = True

    assert (await send(client, school, parent_id)).json() == {"email_sent": False}
    assert await setup_audits(parent_id) == [{"sent": False}]


async def test_without_email_configured_it_reports_not_sent(client, school):
    parent_id = await role_id(client, school, "parent")

    assert (await send(client, school, parent_id)).json() == {"email_sent": False}


async def test_deactivated_account_gets_nothing(client, school, outbox):
    gate_id = await role_id(client, school, "gate_staff")
    await client.post(f"{USERS_URL}/{gate_id}/deactivate", headers=school["headers"]["admin"])
    sent_before = len(outbox.sent)

    response = await send(client, school, gate_id)

    assert response.status_code == 409
    assert "deactivated" in response.json()["detail"]
    assert len(outbox.sent) == sent_before
    assert await setup_audits(gate_id) == []


async def test_admins_other_schools_and_unknown_users_look_absent(client, school, outbox):
    other = await api.create_school(client, "othersetup")
    admin_id = (await client.get("/api/v1/auth/me", headers=school["headers"]["admin"])).json()["id"]
    other_parent = await role_id(client, other, "parent")
    sent_before = len(outbox.sent)

    for user_id in (admin_id, other_parent, 999999):
        assert (await send(client, school, user_id)).status_code == 404

    assert len(outbox.sent) == sent_before


async def test_limited_per_target_user(client, school, outbox):
    parent_id = await role_id(client, school, "parent")

    for _ in range(SETUP_EMAIL_USER_LIMIT):
        assert (await send(client, school, parent_id)).status_code == 200

    response = await send(client, school, parent_id)

    assert response.status_code == 429
    assert "retry-after" in response.headers


async def test_limited_per_admin(client, school, outbox):
    """Spread over several people, the admin's own budget still runs out."""

    people = [await add_gate(client, school, number) for number in range(1, 5)]
    targets = [people[i // SETUP_EMAIL_USER_LIMIT] for i in range(SETUP_EMAIL_ADMIN_LIMIT)]

    for user_id in targets:
        assert (await send(client, school, user_id)).status_code == 200

    response = await send(client, school, people[-1])

    assert response.status_code == 429
