from redis.asyncio import Redis

from app.core.config import settings

# One shared client; it connects lazily, so importing the app never needs
# Redis to be up. Short timeouts make a dead Redis fail fast instead of
# stalling requests at the gate.
redis_client = Redis.from_url(
    settings.redis_url,
    decode_responses=True,
    socket_connect_timeout=0.5,
    socket_timeout=0.5,
)


async def get_redis() -> Redis:
    """Provide the shared Redis client for a request."""

    return redis_client


async def close_redis() -> None:
    """Close the shared Redis client's connections on shutdown."""

    await redis_client.aclose()
