"""Tests for the Redis rate limiter: counting, 429 with Retry-After, and failing open."""

import json
import logging

import pytest
from redis.asyncio import Redis
from starlette.requests import Request

from app.core import rate_limit
from app.core.rate_limit import RateLimitExceeded
from app.db.redis import redis_client
from app.main import app

KEY = "pikva:rl:test:subject"


def dead_redis() -> Redis:
    """Return a client for a port nothing listens on, so every call fails."""

    return Redis.from_url(
        "redis://127.0.0.1:1/15",
        socket_connect_timeout=0.5,
        socket_timeout=0.5,
    )


async def test_hit_allows_up_to_the_limit():
    """Attempts up to the limit pass; the next one is blocked."""

    for _ in range(3):
        await rate_limit.hit(redis_client, KEY, limit=3, window_seconds=60)

    with pytest.raises(RateLimitExceeded) as caught:
        await rate_limit.hit(redis_client, KEY, limit=3, window_seconds=60)

    assert 0 < caught.value.retry_after <= 60


async def test_window_starts_on_first_hit_only():
    """Later hits do not push the window's expiry further out."""

    await rate_limit.hit(redis_client, KEY, limit=5, window_seconds=60)
    await redis_client.expire(KEY, 10)

    await rate_limit.hit(redis_client, KEY, limit=5, window_seconds=60)

    assert 0 < await redis_client.ttl(KEY) <= 10


async def test_counter_resets_when_window_expires():
    """Once the counter key expires, attempts are allowed again."""

    await rate_limit.hit(redis_client, KEY, limit=1, window_seconds=60)
    await redis_client.delete(KEY)  # what Redis does when the window ends

    await rate_limit.hit(redis_client, KEY, limit=1, window_seconds=60)


async def test_check_blocks_without_counting():
    """check() never increments; it blocks once record() reaches the limit."""

    await rate_limit.check(redis_client, KEY, limit=2)
    await rate_limit.check(redis_client, KEY, limit=2)
    assert await redis_client.get(KEY) is None

    await rate_limit.record(redis_client, KEY, window_seconds=60)
    await rate_limit.check(redis_client, KEY, limit=2)

    await rate_limit.record(redis_client, KEY, window_seconds=60)
    with pytest.raises(RateLimitExceeded) as caught:
        await rate_limit.check(redis_client, KEY, limit=2)

    assert 0 < caught.value.retry_after <= 60


async def test_keys_are_independent():
    """One subject's attempts do not count against another's."""

    await rate_limit.hit(redis_client, KEY, limit=1, window_seconds=60)

    await rate_limit.hit(redis_client, KEY + ":other", limit=1, window_seconds=60)


@pytest.mark.parametrize("call", ["hit", "check", "record"])
async def test_redis_outage_fails_open_and_logs(caplog, call):
    """With Redis down, requests are allowed and a warning is logged without the key."""

    dead = dead_redis()
    caplog.set_level(logging.WARNING, logger="app.core.rate_limit")

    try:
        if call == "hit":
            await rate_limit.hit(dead, KEY, limit=1, window_seconds=60)
        elif call == "check":
            await rate_limit.check(dead, KEY, limit=1)
        else:
            await rate_limit.record(dead, KEY, window_seconds=60)
    finally:
        await dead.aclose()

    assert "rate limiter unavailable" in caplog.text.lower()
    assert KEY not in caplog.text


async def test_exceeded_maps_to_429_with_retry_after():
    """The app turns RateLimitExceeded into 429 with a Retry-After header."""

    handler = app.exception_handlers[RateLimitExceeded]
    request = Request({"type": "http", "method": "GET", "path": "/", "headers": []})

    response = await handler(request, RateLimitExceeded(retry_after=42))

    assert response.status_code == 429
    assert response.headers["Retry-After"] == "42"
    assert json.loads(response.body) == {"detail": "Too many requests. Try again later."}
