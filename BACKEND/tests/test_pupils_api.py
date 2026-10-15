"""API tests for the parent summary in pupil responses (SRS 8)."""

import pytest

import test_pickup_code_api as api

PUPILS_URL = "/api/v1/pupils"


@pytest.fixture
async def school(client):
    """Provide one school with an admin, a parent (with one pupil) and gate staff."""

    return await api.create_school(client, "alpha")


def expected_parent(pupil: dict, tag: str = "alpha") -> dict:
    """The parent summary create_school's parent should have."""

    return {
        "id": pupil["parent_id"],
        "name": f"{tag} parent",
        "email": f"parent-{tag}@example.com",
        "phone": "0711111111",
    }


async def test_parent_sees_only_their_own_summary(client, school):
    """A parent's pupils carry the parent's own contact details and nothing else."""

    [pupil] = (await client.get(PUPILS_URL, headers=school["headers"]["parent"])).json()

    assert pupil["parent"] == expected_parent(pupil)


async def test_admin_sees_each_pupils_parent(client, school):
    """An admin listing the school sees who each pupil's parent is."""

    other = await api.add_parent(client, school, "bravo")
    await client.post(
        PUPILS_URL,
        headers=other,
        json={"first_name": "Bayo", "last_name": "Pupil", "date_of_birth": "2017-02-02"},
    )

    pupils = (await client.get(PUPILS_URL, headers=school["headers"]["admin"])).json()

    assert sorted(pupil["parent"]["name"] for pupil in pupils) == ["alpha parent", "bravo Parent"]
    assert all(pupil["parent"]["id"] == pupil["parent_id"] for pupil in pupils)


async def test_one_pupil_create_and_update_include_the_parent(client, school):
    """GET one, POST and PATCH all answer with the parent summary."""

    admin = school["headers"]["admin"]
    [pupil] = (await client.get(PUPILS_URL, headers=admin)).json()

    one = await client.get(f"{PUPILS_URL}/{pupil['id']}", headers=admin)
    created = await client.post(
        PUPILS_URL,
        headers=admin,
        json={
            "first_name": "Chika",
            "last_name": "Pupil",
            "date_of_birth": "2019-03-03",
            "parent_id": pupil["parent_id"],
        },
    )
    updated = await client.patch(f"{PUPILS_URL}/{pupil['id']}", headers=admin, json={"first_name": "Adaeze"})

    assert created.status_code == 201
    assert updated.status_code == 200
    for response in (one, created, updated):
        assert response.json()["parent"] == expected_parent(pupil)
    assert updated.json()["first_name"] == "Adaeze"


async def test_parent_summary_has_no_account_secrets(client, school):
    """Only the contact fields are shown; never the password hash or role."""

    [pupil] = (await client.get(PUPILS_URL, headers=school["headers"]["admin"])).json()

    assert set(pupil["parent"]) == {"id", "name", "email", "phone"}
