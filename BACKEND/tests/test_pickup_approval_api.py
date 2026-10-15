"""API tests for school approval of pickup people (SRS 9.2, 23.2, 23.4)."""

from datetime import datetime, timedelta, timezone

import pytest

import test_pickup_code_api as api


@pytest.fixture
async def school(client):
    """Provide one school with an admin, a parent, gate staff and an approved authorisation."""

    return await api.create_school(client, "alpha")


async def add_pending(client, school) -> dict:
    """Add a pickup person as the parent; it starts pending. Returns the response body."""

    parent = school["headers"]["parent"]
    [pupil] = (await client.get("/api/v1/pupils", headers=parent)).json()
    now = datetime.now(timezone.utc)

    response = await client.post(
        "/api/v1/pickers",
        headers=parent,
        json={
            "pupil_id": pupil["id"],
            "picker_name": "Uncle Obi",
            "picker_phone": "0733333333",
            "relationship": "uncle",
            "type": "regular",
            "starts_at": (now - timedelta(hours=1)).isoformat(),
            "expires_at": (now + timedelta(days=7)).isoformat(),
        },
    )
    assert response.status_code == 201

    return response.json()


async def approve(client, school, authorisation: dict, headers: dict | None = None):
    """Approve as the school's admin, sending the updated_at the admin saw."""

    return await client.post(
        f"/api/v1/pickers/{authorisation['id']}/approve",
        headers=headers or school["headers"]["admin"],
        json={"updated_at": authorisation["updated_at"]},
    )


async def request_code(client, school, authorisation_id: int):
    """Ask for a pickup code as the school's parent."""

    return await client.post(
        api.CODES_URL,
        headers=school["headers"]["parent"],
        json={"authorisation_id": authorisation_id},
    )


async def test_parent_added_person_is_pending_and_gets_no_code(client, school):
    """A new pickup person waits for approval and cannot be given a code."""

    pending = await add_pending(client, school)

    assert pending["status"] == "pending_approval"
    assert pending["approved_at"] is None
    response = await request_code(client, school, pending["id"])
    assert response.status_code == 422
    assert response.json()["detail"] == "Pickup authorisation is pending_approval"


async def test_admin_approval_lets_the_person_collect(client, school):
    """After approval the person is active and the parent can get a code."""

    pending = await add_pending(client, school)

    response = await approve(client, school, pending)

    assert response.status_code == 200
    assert response.json()["status"] == "active"
    assert response.json()["approved_at"] is not None
    assert (await request_code(client, school, pending["id"])).status_code == 201


async def test_second_approval_is_a_conflict(client, school):
    """Approving twice returns 409."""

    pending = await add_pending(client, school)
    approved = (await approve(client, school, pending)).json()

    response = await approve(client, school, approved)

    assert response.status_code == 409
    assert response.json()["detail"] == "Pickup authorisation is already approved"


async def test_change_after_admin_looked_is_a_conflict(client, school):
    """If the parent changes the person after the admin loaded it, approval is refused."""

    pending = await add_pending(client, school)
    await client.patch(
        f"/api/v1/pickers/{pending['id']}",
        headers=school["headers"]["parent"],
        json={"picker_name": "Someone Else"},
    )

    response = await approve(client, school, pending)

    assert response.status_code == 409
    assert "changed" in response.json()["detail"]
    current = await client.get(f"/api/v1/pickers/{pending['id']}", headers=school["headers"]["admin"])
    assert current.json()["status"] == "pending_approval"


async def test_other_school_admin_cannot_approve(client, school):
    """An admin from another school gets 404, as if the person did not exist."""

    pending = await add_pending(client, school)
    other = await api.create_school(client, "bravo")

    response = await approve(client, school, pending, headers=other["headers"]["admin"])

    assert response.status_code == 404


@pytest.mark.parametrize("body", [{}, {"updated_at": "2026-10-15T10:00:00"}, {"updated_at": "soon"}])
async def test_approval_needs_a_timezone_aware_updated_at(client, school, body):
    """The body must carry the updated_at the admin saw, with a time zone."""

    pending = await add_pending(client, school)

    response = await client.post(
        f"/api/v1/pickers/{pending['id']}/approve",
        headers=school["headers"]["admin"],
        json=body,
    )

    assert response.status_code == 422


async def test_code_for_person_changed_by_parent_fails_at_the_gate(client, school):
    """A code issued before a parent's edit fails as authorisation_pending and raises an alert."""

    issued = await api.issue(client, school)
    await client.patch(
        f"/api/v1/pickers/{school['authorisation_id']}",
        headers=school["headers"]["parent"],
        json={"picker_phone": "0799999999"},
    )

    body = await api.verify(client, school, {"method": "manual", "code": issued["code"]})

    assert body["verified"] is False
    assert body["result"] == "authorisation_pending"
    assert body["pupil"] is None
    assert ("authorisation_pending", issued["pupil_id"], school["authorisation_id"]) in await api.alerts(
        school["school_id"]
    )
