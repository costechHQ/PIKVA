"""Over-long or blank text is a 422, never a database error (SRS 21.1, 22)."""

from datetime import datetime, timedelta, timezone

import pytest

import test_pickup_code_api as api

NOW = datetime.now(timezone.utc)

REGISTER = {
    "name": "Ada Obi",
    "email": "limits@example.com",
    "phone": "0700000000",
    "password": "a-strong-password",
    "school_name": "Limits School",
    "school_address": "1 Test Road",
}
NEW_USER = {
    "name": "Bayo Parent",
    "email": "bayo-limits@example.com",
    "phone": "0711111111",
    "role": "parent",
}
PUPIL = {"first_name": "Chidi", "last_name": "Eze", "date_of_birth": "2018-05-05"}
PICKER = {
    "picker_name": "Aunt Ada",
    "picker_phone": "0722222222",
    "relationship": "aunt",
    "type": "regular",
    "starts_at": (NOW - timedelta(hours=1)).isoformat(),
    "expires_at": (NOW + timedelta(days=30)).isoformat(),
}

TOO_LONG = [
    ("register", "name", "x" * 151),
    ("register", "phone", "1" * 31),
    ("register", "password", "p" * 129),
    ("register", "school_name", "x" * 151),
    ("register", "school_address", "x" * 256),
    ("user", "name", "x" * 151),
    ("user", "phone", "1" * 31),
    ("pupil", "first_name", "x" * 101),
    ("pupil", "last_name", "x" * 101),
    ("pupil", "photo_url", "https://e.com/" + "x" * 490),
    ("picker", "picker_name", "x" * 151),
    ("picker", "picker_phone", "1" * 31),
    ("picker", "relationship", "x" * 51),
    ("picker", "type", "x" * 51),
    ("picker", "photo_url", "https://e.com/" + "x" * 490),
    ("pupil_patch", "first_name", "x" * 101),
    ("picker_patch", "relationship", "x" * 51),
]

BLANK = [
    ("register", "name"),
    ("register", "password"),
    ("user", "name"),
    ("pupil", "first_name"),
    ("picker", "picker_name"),
    ("picker", "relationship"),
    ("pupil_patch", "last_name"),
]


@pytest.fixture
async def school(client):
    """Provide one school with an admin, a parent, gate staff and an authorisation."""

    return await api.create_school(client, "alpha")


async def send(client, school, target: str, field: str, value: str):
    """Send one request to the endpoint for target with field set to value."""

    parent = school["headers"]["parent"]

    if target == "register":
        return await client.post("/api/v1/auth/register", json=REGISTER | {field: value})

    if target == "user":
        return await client.post(
            "/api/v1/schools/users", headers=school["headers"]["admin"], json=NEW_USER | {field: value}
        )

    if target == "pupil":
        return await client.post("/api/v1/pupils", headers=parent, json=PUPIL | {field: value})

    [pupil] = (await client.get("/api/v1/pupils", headers=parent)).json()

    if target == "picker":
        body = PICKER | {"pupil_id": pupil["id"], field: value}
        return await client.post("/api/v1/pickers", headers=parent, json=body)

    if target == "pupil_patch":
        return await client.patch(f"/api/v1/pupils/{pupil['id']}", headers=parent, json={field: value})

    if target == "picker_patch":
        url = f"/api/v1/pickers/{school['authorisation_id']}"
        return await client.patch(url, headers=parent, json={field: value})

    raise AssertionError(target)


@pytest.mark.parametrize(("target", "field", "value"), TOO_LONG, ids=lambda v: str(v)[:20])
async def test_too_long_text_is_rejected(client, school, target, field, value):
    """A value longer than its database column is a 422."""

    response = await send(client, school, target, field, value)

    assert response.status_code == 422


@pytest.mark.parametrize(("target", "field"), BLANK)
async def test_blank_text_is_rejected(client, school, target, field):
    """Empty or whitespace-only required text is a 422."""

    response = await send(client, school, target, field, "   ")

    assert response.status_code == 422


async def test_text_at_the_limit_is_accepted_and_trimmed(client, school):
    """Exactly the column length is fine; surrounding spaces are removed."""

    response = await send(client, school, "picker", "picker_name", "  " + "x" * 150 + "  ")

    assert response.status_code == 201
    assert response.json()["picker_name"] == "x" * 150


@pytest.mark.parametrize("field", ["first_name", "last_name", "date_of_birth"])
async def test_pupil_update_rejects_null_required_field(client, school, field):
    """Setting a required pupil field to null is a 422, not a database error."""

    response = await send(client, school, "pupil_patch", field, None)

    assert response.status_code == 422


async def test_pupil_update_allows_clearing_photo(client, school):
    """The optional photo URL can be cleared with null."""

    response = await send(client, school, "pupil_patch", "photo_url", None)

    assert response.status_code == 200
    assert response.json()["photo_url"] is None
