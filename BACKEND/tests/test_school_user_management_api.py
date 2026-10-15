"""API tests for editing and deactivating school users (SRS 6.7)."""

import pytest
from sqlalchemy import select

import test_pickup_code_api as api
from app.db.session import async_session
from app.models.audit_log import AuditLog
from app.services import notification_service
from test_security_api import Outbox

USERS_URL = "/api/v1/schools/users"
LOGIN_URL = "/api/v1/auth/login"


@pytest.fixture
def outbox(monkeypatch):
    """Capture emails instead of sending them."""

    box = Outbox()
    monkeypatch.setattr(notification_service, "get_email_sender", lambda: box)
    return box


@pytest.fixture
async def school(client):
    """One school with an admin, a parent, gate staff and an approved pickup person."""

    return await api.create_school(client, "mgmt")


async def user_id(client, school, role: str) -> int:
    """The id of the school's only user with this role."""

    users = (await client.get(USERS_URL, headers=school["headers"]["admin"], params={"role": role})).json()
    [user] = users
    return user["id"]


async def audit(user_id: int) -> list[tuple[str, dict | None]]:
    async with async_session() as session:
        rows = await session.scalars(
            select(AuditLog)
            .where(AuditLog.entity_type == "user", AuditLog.entity_id == user_id, AuditLog.action != "user.created")
            .order_by(AuditLog.id)
        )
        return [(row.action, row.metadata_) for row in rows]


async def sign_in(client, email: str, password: str = api.PASSWORD):
    return await client.post(LOGIN_URL, json={"email": email, "password": password})


# --- Edit --------------------------------------------------------------------


async def test_admin_edits_a_parent_and_only_field_names_are_audited(client, school):
    parent_id = await user_id(client, school, "parent")

    response = await client.patch(
        f"{USERS_URL}/{parent_id}",
        headers=school["headers"]["admin"],
        json={"name": "Ngozi Okafor", "phone": "0799999999"},
    )

    assert response.status_code == 200
    body = response.json()
    assert (body["name"], body["phone"], body["is_active"]) == ("Ngozi Okafor", "0799999999", True)
    assert await audit(parent_id) == [("user.updated", {"fields": ["name", "phone"]})]


async def test_new_email_is_used_to_sign_in(client, school):
    gate_id = await user_id(client, school, "gate_staff")

    response = await client.patch(
        f"{USERS_URL}/{gate_id}", headers=school["headers"]["admin"], json={"email": "new-gate@example.com"}
    )

    assert response.status_code == 200
    assert (await sign_in(client, "new-gate@example.com")).status_code == 200
    assert (await sign_in(client, "gate_staff-mgmt@example.com")).status_code == 401


async def test_email_in_use_is_refused_and_unchanged_edit_is_not_audited(client, school):
    admin = school["headers"]["admin"]
    gate_id = await user_id(client, school, "gate_staff")

    taken = await client.patch(f"{USERS_URL}/{gate_id}", headers=admin, json={"email": "parent-mgmt@example.com"})
    same = await client.patch(f"{USERS_URL}/{gate_id}", headers=admin, json={"email": "gate_staff-mgmt@example.com"})

    assert taken.status_code == 409
    assert taken.json()["detail"] == "A user with this email already exists"
    assert same.status_code == 200
    assert await audit(gate_id) == []


@pytest.mark.parametrize(
    "body",
    [{"role": "school_admin"}, {"password": "new-password-1"}, {"name": None}, {"email": "not-an-email"}, {"name": ""}],
)
async def test_role_password_nulls_and_bad_values_are_rejected(client, school, body):
    parent_id = await user_id(client, school, "parent")

    response = await client.patch(f"{USERS_URL}/{parent_id}", headers=school["headers"]["admin"], json=body)

    assert response.status_code == 422


async def test_admins_and_other_schools_users_look_absent(client, school):
    other = await api.create_school(client, "other")
    admin = school["headers"]["admin"]
    own_admin_id = await user_id(client, school, "school_admin")
    other_parent_id = await user_id(client, other, "parent")

    for target in (own_admin_id, other_parent_id):
        assert (await client.patch(f"{USERS_URL}/{target}", headers=admin, json={"name": "X"})).status_code == 404
        assert (await client.post(f"{USERS_URL}/{target}/deactivate", headers=admin)).status_code == 404


# --- Deactivate and activate ------------------------------------------------------


async def test_deactivated_user_is_signed_out_and_cannot_sign_in(client, school, outbox):
    gate_id = await user_id(client, school, "gate_staff")
    gate = school["headers"]["gate_staff"]
    assert (await client.get("/api/v1/auth/me", headers=gate)).status_code == 200

    response = await client.post(f"{USERS_URL}/{gate_id}/deactivate", headers=school["headers"]["admin"])

    assert response.status_code == 200
    assert response.json()["is_active"] is False
    # The session they already had stops working at once.
    assert (await client.get("/api/v1/auth/me", headers=gate)).status_code == 401
    # The right password says why; a wrong one says nothing more than usual.
    right = await sign_in(client, "gate_staff-mgmt@example.com")
    wrong = await sign_in(client, "gate_staff-mgmt@example.com", "wrong-password-1")
    assert right.status_code == 401
    assert right.json()["detail"] == "This account has been deactivated. Contact your school."
    assert wrong.json()["detail"] == "Invalid email or password"
    # No reset link either, with the usual answer.
    reset = await client.post("/api/v1/auth/password-reset/request", json={"email": "gate_staff-mgmt@example.com"})
    assert reset.status_code == 202
    assert outbox.sent == []


async def test_listed_status_and_reactivation(client, school):
    admin = school["headers"]["admin"]
    gate_id = await user_id(client, school, "gate_staff")

    await client.post(f"{USERS_URL}/{gate_id}/deactivate", headers=admin)
    again = await client.post(f"{USERS_URL}/{gate_id}/deactivate", headers=admin)
    listed = (await client.get(USERS_URL, headers=admin, params={"role": "gate_staff"})).json()
    activated = await client.post(f"{USERS_URL}/{gate_id}/activate", headers=admin)

    assert again.status_code == 200
    assert listed[0]["is_active"] is False
    assert activated.json()["is_active"] is True
    assert (await sign_in(client, "gate_staff-mgmt@example.com")).status_code == 200
    # Deactivating twice is recorded once.
    assert [action for action, _ in await audit(gate_id)] == ["user.deactivated", "user.activated"]


async def test_deactivating_a_parent_leaves_pickup_people_and_codes(client, school):
    """SRS 6.7: the school deactivates pickup people separately."""

    issued = await api.issue(client, school)
    parent_id = await user_id(client, school, "parent")

    await client.post(f"{USERS_URL}/{parent_id}/deactivate", headers=school["headers"]["admin"])

    person = await client.get(f"/api/v1/pickers/{school['authorisation_id']}", headers=school["headers"]["admin"])
    assert person.json()["status"] == "active"
    body = await api.verify(client, school, {"method": "manual", "code": issued["code"]})
    assert body["verified"] is True
