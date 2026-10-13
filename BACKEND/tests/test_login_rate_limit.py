"""API tests for login rate limits: failures per email and attempts per IP (SRS 11.3, 23)."""

import httpx

import test_pickup_code_api as api
import test_rate_limit
from app.core.constants import LOGIN_FAILURE_LIMIT, LOGIN_IP_LIMIT, LOGIN_WINDOW_SECONDS
from app.db.redis import get_redis, redis_client
from app.main import app

LOGIN_URL = "/api/v1/auth/login"
ADMIN = "admin-alpha@example.com"


async def register(client) -> None:
    """Register a school whose admin can log in as ADMIN."""

    response = await client.post(
        "/api/v1/auth/register",
        json={
            "name": "alpha Admin",
            "email": ADMIN,
            "phone": "0700000000",
            "password": api.PASSWORD,
            "school_name": "alpha School",
            "school_address": "1 Test Road",
        },
    )
    assert response.status_code == 201


async def attempt(client, email: str, password: str = api.PASSWORD) -> httpx.Response:
    """Post one login attempt."""

    return await client.post(LOGIN_URL, json={"email": email, "password": password})


async def test_email_locked_after_failed_attempts(client):
    """After the failure limit, even the right password gets 429 with Retry-After."""

    await register(client)

    for _ in range(LOGIN_FAILURE_LIMIT):
        assert (await attempt(client, ADMIN, "WrongPassword123!")).status_code == 401

    response = await attempt(client, ADMIN)

    assert response.status_code == 429
    assert 0 < int(response.headers["Retry-After"]) <= LOGIN_WINDOW_SECONDS


async def test_failures_below_limit_still_allow_login(client):
    """One fewer failure than the limit leaves the account usable."""

    await register(client)

    for _ in range(LOGIN_FAILURE_LIMIT - 1):
        await attempt(client, ADMIN, "WrongPassword123!")

    assert (await attempt(client, ADMIN)).status_code == 200


async def test_successful_logins_do_not_count_as_failures(client):
    """Repeated good logins never lock the email."""

    await register(client)

    for _ in range(LOGIN_FAILURE_LIMIT + 1):
        assert (await attempt(client, ADMIN)).status_code == 200


async def test_email_lock_ignores_case(client):
    """Changing the email's letter case does not reset the failure count."""

    await register(client)

    for _ in range(LOGIN_FAILURE_LIMIT):
        await attempt(client, ADMIN.upper(), "WrongPassword123!")

    assert (await attempt(client, ADMIN)).status_code == 429


async def test_email_lock_is_per_email(client):
    """Failures for one email do not lock another."""

    await register(client)

    for _ in range(LOGIN_FAILURE_LIMIT):
        await attempt(client, "someone-else@example.com", "WrongPassword123!")

    assert (await attempt(client, ADMIN)).status_code == 200


async def test_ip_limited_across_emails(client):
    """Too many attempts from one IP get 429, whichever emails they use."""

    for number in range(LOGIN_IP_LIMIT):
        response = await attempt(client, f"nobody-{number}@example.com")
        assert response.status_code == 401

    response = await attempt(client, "nobody-last@example.com")

    assert response.status_code == 429
    assert 0 < int(response.headers["Retry-After"]) <= LOGIN_WINDOW_SECONDS


async def test_ip_limit_is_per_ip(client):
    """A blocked IP does not block logins from another IP."""

    await register(client)

    for number in range(LOGIN_IP_LIMIT + 1):
        await attempt(client, f"nobody-{number}@example.com")

    transport = httpx.ASGITransport(app=app, client=("203.0.113.7", 50000))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as other:
        assert (await attempt(other, ADMIN)).status_code == 200


async def test_redis_keys_do_not_contain_emails(client):
    """Login counters are keyed by a hash, so Redis never stores addresses."""

    await register(client)
    await attempt(client, ADMIN, "WrongPassword123!")

    keys = [key async for key in redis_client.scan_iter("pikva:rl:login:*")]

    assert any(key.startswith("pikva:rl:login:email:") for key in keys)
    assert not any("@" in key for key in keys)


async def test_login_works_when_redis_is_down(client):
    """With Redis unreachable the limiter fails open, so users can still log in."""

    await register(client)
    dead = test_rate_limit.dead_redis()
    app.dependency_overrides[get_redis] = lambda: dead

    try:
        response = await attempt(client, ADMIN)
    finally:
        app.dependency_overrides.pop(get_redis, None)
        await dead.aclose()

    assert response.status_code == 200
