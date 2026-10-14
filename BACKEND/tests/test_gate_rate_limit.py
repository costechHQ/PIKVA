"""API tests for the gate rate limit on verify and release (SRS 11.3, 23)."""

import test_pickup_code_api as api
import test_rate_limit
from app.core.constants import GATE_STAFF_LIMIT, GATE_WINDOW_SECONDS
from app.db.redis import get_redis
from app.main import app
from test_pickup_code_api import RELEASE_URL, VERIFY_URL, school  # noqa: F401

BAD_CODE = {"method": "manual", "code": "ZZZZ9999"}


async def gate_call(client, school, url: str):
    """Send one verify or release request as the school's gate staff."""

    return await client.post(url, headers=school["headers"]["gate_staff"], json=BAD_CODE)


async def use_up_budget(client, school) -> None:
    """Spend the whole per-minute budget, split between verify and release."""

    for number in range(GATE_STAFF_LIMIT):
        url = VERIFY_URL if number % 2 else RELEASE_URL
        assert (await gate_call(client, school, url)).status_code == 200


async def test_verify_and_release_share_one_budget(client, school):
    """Once the budget is spent, both endpoints answer 429 with Retry-After."""

    await use_up_budget(client, school)

    for url in (VERIFY_URL, RELEASE_URL):
        response = await gate_call(client, school, url)

        assert response.status_code == 429
        assert 0 < int(response.headers["Retry-After"]) <= GATE_WINDOW_SECONDS


async def test_blocked_request_records_nothing(client, school):
    """A rate-limited call never reaches verification, so it adds no alert."""

    await use_up_budget(client, school)
    before = await api.alerts(school["school_id"])

    assert (await gate_call(client, school, VERIFY_URL)).status_code == 429

    assert await api.alerts(school["school_id"]) == before


async def test_budget_is_per_staff_member(client, school):
    """One staff member hitting the limit does not block another."""

    await use_up_budget(client, school)
    other = await api.create_school(client, "beta")

    assert (await gate_call(client, other, VERIFY_URL)).status_code == 200


async def test_gate_works_when_redis_is_down(client, school):
    """With Redis unreachable the limiter fails open, so the gate keeps working."""

    issued = await api.issue(client, school)
    dead = test_rate_limit.dead_redis()
    app.dependency_overrides[get_redis] = lambda: dead

    try:
        result = await api.verify(client, school, {"method": "manual", "code": issued["code"]})
    finally:
        app.dependency_overrides.pop(get_redis, None)
        await dead.aclose()

    assert result["verified"] is True
