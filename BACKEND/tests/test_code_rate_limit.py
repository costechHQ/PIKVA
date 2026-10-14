"""API tests for the rate limit on parent pickup code requests (SRS 11.3, 23)."""

import test_pickup_code_api as api
import test_rate_limit
from app.core.constants import CODE_REQUEST_LIMIT, CODE_REQUEST_WINDOW_SECONDS
from app.db.redis import get_redis
from app.main import app
from test_pickup_code_api import CODES_URL, school  # noqa: F401


async def request_code(client, school, authorisation_id: int | None = None):
    """Request a pickup code as the school's parent."""

    return await client.post(
        CODES_URL,
        headers=school["headers"]["parent"],
        json={"authorisation_id": authorisation_id or school["authorisation_id"]},
    )


async def test_parent_limited_after_too_many_requests(client, school):
    """Requests past the hourly limit get 429 with Retry-After."""

    for _ in range(CODE_REQUEST_LIMIT):
        assert (await request_code(client, school)).status_code == 201

    response = await request_code(client, school)

    assert response.status_code == 429
    assert 0 < int(response.headers["Retry-After"]) <= CODE_REQUEST_WINDOW_SECONDS


async def test_failed_requests_count_too(client, school):
    """Probing unknown authorisations uses up the same budget."""

    for _ in range(CODE_REQUEST_LIMIT):
        assert (await request_code(client, school, 999999)).status_code == 404

    assert (await request_code(client, school)).status_code == 429


async def test_limit_is_per_parent(client, school):
    """One parent hitting the limit does not block another."""

    for _ in range(CODE_REQUEST_LIMIT + 1):
        await request_code(client, school)

    other = await api.create_school(client, "beta")

    assert (await request_code(client, other)).status_code == 201


async def test_codes_issue_when_redis_is_down(client, school):
    """With Redis unreachable the limiter fails open, so parents still get codes."""

    dead = test_rate_limit.dead_redis()
    app.dependency_overrides[get_redis] = lambda: dead

    try:
        response = await request_code(client, school)
    finally:
        app.dependency_overrides.pop(get_redis, None)
        await dead.aclose()

    assert response.status_code == 201
