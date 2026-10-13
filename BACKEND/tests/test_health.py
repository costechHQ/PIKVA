"""Smoke tests proving the test setup reaches the app and the test database."""


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
