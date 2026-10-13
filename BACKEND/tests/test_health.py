"""Smoke tests proving the test setup reaches the app and the test database."""

from redis.asyncio import Redis

from app.db.redis import get_redis
from app.main import app


async def test_database_health(client):
    """The app can query the test database."""

    response = await client.get("/api/v1/health/db")

    assert response.status_code == 200
    assert response.json() == {"database": "ok"}


async def test_protected_endpoint_requires_token(client):
    """A protected endpoint rejects requests without a Bearer token."""

    response = await client.get("/api/v1/health/auth")

    assert response.status_code == 401


async def test_api_health(client):
    """The basic health check needs no token (SRS 17.2, 27)."""

    response = await client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_redis_health(client):
    """The Redis health check needs no token and reports a reachable Redis."""

    response = await client.get("/api/v1/health/redis")

    assert response.status_code == 200
    assert response.json() == {"redis": "ok"}


async def test_redis_health_reports_outage(client):
    """An unreachable Redis gives 503 instead of an unhandled error."""

    # Nothing listens on port 1, so every command fails to connect.
    dead = Redis.from_url(
        "redis://127.0.0.1:1/15",
        socket_connect_timeout=0.5,
        socket_timeout=0.5,
    )
    app.dependency_overrides[get_redis] = lambda: dead

    try:
        response = await client.get("/api/v1/health/redis")
    finally:
        app.dependency_overrides.pop(get_redis, None)
        await dead.aclose()

    assert response.status_code == 503
    assert response.json() == {"redis": "unavailable"}
