"""Fixed-window rate limiting on Redis (SRS 11.3 suspicious repeated attempts).

Each key counts attempts in a window that starts on its first hit and ends
when the key expires. If Redis is unreachable the limiter fails open: the
request is allowed and a warning is logged, so the gate keeps working.
"""

import hashlib
import logging

from fastapi import Request
from fastapi.responses import JSONResponse
from redis.asyncio import Redis
from redis.exceptions import RedisError

logger = logging.getLogger(__name__)

# OpenAPI description of the 429 response, for every rate-limited route.
RATE_LIMITED_RESPONSE = {
    429: {
        "description": "Too many requests; try again after Retry-After seconds",
        "headers": {
            "Retry-After": {
                "description": "Seconds until the limit resets",
                "schema": {"type": "integer"},
            },
        },
        "content": {
            "application/json": {
                "example": {"detail": "Too many requests. Try again later."},
            },
        },
    },
}


class RateLimitExceeded(Exception):
    """Raised when a key is over its limit; retry_after is in seconds."""

    def __init__(self, retry_after: int):
        """Store how long the caller must wait before trying again."""

        super().__init__(f"Rate limit exceeded; retry after {retry_after}s")
        self.retry_after = retry_after


def hashed(value: str) -> str:
    """Hash a personal identifier (such as an email) for use in a Redis key."""

    return hashlib.sha256(value.strip().lower().encode()).hexdigest()


def _scope(key: str) -> str:
    """Return a key's limit name, such as "login:email", without its subject."""

    return ":".join(key.split(":")[2:-1])


def _blocked(key: str, retry_after: int) -> RateLimitExceeded:
    """Log a blocked request by limit name only, then build its exception."""

    logger.warning("Rate limit exceeded: %s", _scope(key))

    return RateLimitExceeded(retry_after=retry_after)


def _log_outage(exc: RedisError) -> None:
    """Log that limiting was skipped, without the key (it may hold an email)."""

    logger.warning("Rate limiter unavailable, allowing request: %s", type(exc).__name__)


async def _count(redis: Redis, key: str, window_seconds: int) -> tuple[int, int]:
    """Count one attempt and return (count, seconds left in the window)."""

    async with redis.pipeline(transaction=True) as pipe:
        pipe.incr(key)
        pipe.expire(key, window_seconds, nx=True)  # start the window on first hit only
        pipe.ttl(key)
        count, _, ttl = await pipe.execute()

    return count, ttl if ttl > 0 else window_seconds


async def hit(redis: Redis, key: str, limit: int, window_seconds: int) -> None:
    """Count this attempt and raise RateLimitExceeded once the count passes limit."""

    try:
        count, ttl = await _count(redis, key, window_seconds)
    except RedisError as exc:
        _log_outage(exc)
        return

    if count > limit:
        raise _blocked(key, ttl)


async def record(redis: Redis, key: str, window_seconds: int) -> None:
    """Count an attempt (such as a failed login) without blocking it."""

    try:
        await _count(redis, key, window_seconds)
    except RedisError as exc:
        _log_outage(exc)


async def check(redis: Redis, key: str, limit: int) -> None:
    """Raise RateLimitExceeded if recorded attempts have reached limit; never counts."""

    try:
        async with redis.pipeline(transaction=True) as pipe:
            pipe.get(key)
            pipe.ttl(key)
            count, ttl = await pipe.execute()
    except RedisError as exc:
        _log_outage(exc)
        return

    if count is not None and int(count) >= limit:
        raise _blocked(key, max(ttl, 1))


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Turn RateLimitExceeded into 429 with a Retry-After header."""

    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Try again later."},
        headers={"Retry-After": str(exc.retry_after)},
    )
