"""API tests for editing your own name and phone (SRS 6.9)."""

import pytest
from sqlalchemy import select

import test_pickup_code_api as api
from app.db.session import async_session
from app.models.audit_log import AuditLog

ME_URL = "/api/v1/auth/me"


@pytest.fixture
async def school(client):
    return await api.create_school(client, "self")


async def own_updates() -> list[tuple[int, dict]]:
    async with async_session() as session:
        rows = await session.scalars(select(AuditLog).where(AuditLog.action == "user.updated").order_by(AuditLog.id))
        return [(row.user_id, row.metadata_) for row in rows]


@pytest.mark.parametrize("role", ["parent", "gate_staff", "admin"])
async def test_every_role_edits_their_own_name_and_phone(client, school, role):
    headers = school["headers"][role]

    response = await client.patch(ME_URL, headers=headers, json={"name": "New Name", "phone": "0798765432"})

    assert response.status_code == 200
    body = response.json()
    assert (body["name"], body["phone"]) == ("New Name", "0798765432")
    assert body["school_name"] == "self School"
    assert (await client.get(ME_URL, headers=headers)).json()["name"] == "New Name"
    [(actor, metadata)] = await own_updates()
    assert actor == body["id"] and metadata == {"fields": ["name", "phone"]}


async def test_unchanged_details_are_not_audited(client, school):
    me = (await client.get(ME_URL, headers=school["headers"]["parent"])).json()

    response = await client.patch(ME_URL, headers=school["headers"]["parent"], json={"name": me["name"]})

    assert response.status_code == 200
    assert await own_updates() == []


@pytest.mark.parametrize(
    "body",
    [{"email": "new@example.com"}, {"role": "school_admin"}, {"name": None}, {"name": ""}, {"phone": "x" * 31}],
)
async def test_email_role_nulls_and_bad_values_are_rejected(client, school, body):
    response = await client.patch(ME_URL, headers=school["headers"]["parent"], json=body)

    assert response.status_code == 422


async def test_signed_out_users_cannot_edit(client):
    assert (await client.patch(ME_URL, json={"name": "X"})).status_code == 401
