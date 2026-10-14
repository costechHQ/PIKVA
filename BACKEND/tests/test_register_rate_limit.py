"""API tests for the per-IP rate limit on school registration (SRS 11.3, 23)."""

import httpx

import test_pickup_code_api as api
import test_rate_limit
from app.core.constants import REGISTER_IP_LIMIT, REGISTER_WINDOW_SECONDS
from app.db.redis import get_redis
from app.main import app

REGISTER_URL = "/api/v1/auth/register"


async def register(client, tag: str) -> httpx.Response:
    """Post one school registration."""

    return await client.post(
        REGISTER_URL,
        json={
            "name": f"{tag} Admin",
            "email": f"admin-{tag}@example.com",
            "phone": "0700000000",
            "password": api.PASSWORD,
            "school_name": f"{tag} School",
            "school_address": "1 Test Road",
        },
    )


async def test_ip_limited_after_too_many_registrations(client):
    """Registrations past the hourly limit get 429 with Retry-After."""

    for number in range(REGISTER_IP_LIMIT):
        assert (await register(client, f"school{number}")).status_code == 201

    response = await register(client, "one-too-many")

    assert response.status_code == 429
    assert 0 < int(response.headers["Retry-After"]) <= REGISTER_WINDOW_SECONDS


async def test_conflicts_count_too(client):
    """Probing for registered emails with 409s uses up the same budget."""

    assert (await register(client, "taken")).status_code == 201

    for _ in range(REGISTER_IP_LIMIT - 1):
        assert (await register(client, "taken")).status_code == 409

    assert (await register(client, "taken")).status_code == 429


async def test_limit_is_per_ip(client):
    """A blocked IP does not block registrations from another IP."""

    for number in range(REGISTER_IP_LIMIT + 1):
        await register(client, f"school{number}")

    transport = httpx.ASGITransport(app=app, client=("203.0.113.7", 50000))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as other:
        assert (await register(other, "elsewhere")).status_code == 201


async def test_registration_works_when_redis_is_down(client):
    """With Redis unreachable the limiter fails open."""

    dead = test_rate_limit.dead_redis()
    app.dependency_overrides[get_redis] = lambda: dead

    try:
        response = await register(client, "alpha")
    finally:
        app.dependency_overrides.pop(get_redis, None)
        await dead.aclose()

    assert response.status_code == 201
