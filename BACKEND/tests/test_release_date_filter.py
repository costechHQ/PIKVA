"""Tests for narrowing release history to a time range (SRS 18.8)."""

from datetime import datetime, timezone

import pytest
from sqlalchemy import text

import test_pickup_code_api as api
from app.db.session import async_session

RELEASES_URL = "/api/v1/releases"


@pytest.fixture
async def school(client):
    """A school with two releases, at 09:30 UTC on 13 and 14 October."""

    school = await api.create_school(client, "dates")
    for _ in range(2):
        issued = await api.issue(client, school)
        await api.release(client, school, {"method": "manual", "code": issued["code"]}, 201)

    async with async_session() as session:
        ids = (await session.execute(text("SELECT id FROM release_records ORDER BY id"))).scalars().all()
        for release_id, day in zip(ids, (13, 14)):
            await session.execute(
                text("UPDATE release_records SET released_at = :at WHERE id = :id"),
                {"at": datetime(2026, 10, day, 9, 30, tzinfo=timezone.utc), "id": release_id},
            )
        await session.commit()

    return school


async def days(client, headers, **params) -> list[int]:
    response = await client.get(RELEASES_URL, headers=headers, params=params)
    assert response.status_code == 200
    return [int(item["released_at"][8:10]) for item in response.json()]


async def test_a_day_in_the_viewers_time_zone(client, school):
    """Lagos midnight to midnight (UTC+1) picks out one release."""

    admin = school["headers"]["admin"]

    assert await days(client, admin, since="2026-10-14T00:00:00+01:00", until="2026-10-15T00:00:00+01:00") == [14]
    assert await days(client, admin, since="2026-10-13T00:00:00+01:00", until="2026-10-14T00:00:00+01:00") == [13]
    assert await days(client, admin) == [14, 13]


async def test_until_is_exclusive_and_either_end_may_be_open(client, school):
    admin = school["headers"]["admin"]

    assert await days(client, admin, until="2026-10-14T09:30:00Z") == [13]
    assert await days(client, admin, since="2026-10-14T09:30:00Z") == [14]


async def test_parents_get_the_same_filter_on_their_own_pupils(client, school):
    assert await days(client, school["headers"]["parent"], since="2026-10-14T00:00:00Z") == [14]


@pytest.mark.parametrize(
    "params",
    [
        {"since": "2026-10-14T00:00:00Z", "until": "2026-10-14T00:00:00Z"},
        {"since": "2026-10-15T00:00:00Z", "until": "2026-10-14T00:00:00Z"},
        {"since": "2026-10-14T00:00:00"},
        {"until": "yesterday"},
    ],
)
async def test_empty_backwards_naive_or_bad_ranges_are_rejected(client, school, params):
    response = await client.get(RELEASES_URL, headers=school["headers"]["admin"], params=params)

    assert response.status_code == 422
