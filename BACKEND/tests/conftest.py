"""Shared pytest fixtures for Pikva API tests against PostgreSQL."""

from sqlalchemy import text
from sqlalchemy.engine import make_url

from app.core.config import settings

TEST_DATABASE = "pikva_test"
TEST_REDIS_DB = 15

# Point the app at the test databases before the clients are created on import.
settings.database_url = make_url(settings.database_url).set(
    database=TEST_DATABASE
).render_as_string(hide_password=False)
settings.redis_url = make_url(settings.redis_url).set(
    database=str(TEST_REDIS_DB)
).render_as_string(hide_password=False)

# Never send real email from tests, even when .env holds a Resend key.
settings.resend_api_key = None

from pwdlib import PasswordHash  # noqa: E402
from pwdlib.hashers.argon2 import Argon2Hasher  # noqa: E402

from app.core import security  # noqa: E402

# Cheapest Argon2 settings, for speed in tests only; production keeps
# PasswordHash.recommended(). Argon2 stores its settings in each hash, so
# strong hashes still verify.
security.password_hash = PasswordHash(
    (Argon2Hasher(time_cost=1, memory_cost=8, parallelism=1),)
)

import httpx  # noqa: E402
import pytest  # noqa: E402

from redis.exceptions import RedisError  # noqa: E402

from app.db.base import Base  # noqa: E402
from app.db.redis import redis_client  # noqa: E402
from app.db.session import engine  # noqa: E402
from app.main import app  # noqa: E402


def assert_test_redis():
    """Fail unless the shared Redis client points at the test database."""

    redis_db = redis_client.connection_pool.connection_kwargs.get("db")
    assert redis_db == TEST_REDIS_DB, (
        f"Tests must use Redis db {TEST_REDIS_DB}, not {redis_db!r}"
    )


@pytest.fixture(scope="session", autouse=True)
async def test_database():
    """Refuse to run unless connected to the migrated test database and test Redis."""

    assert engine.url.database == TEST_DATABASE, (
        f"Tests must use {TEST_DATABASE!r}, not {engine.url.database!r}"
    )

    async with engine.connect() as connection:
        version = await connection.scalar(text("SELECT version_num FROM alembic_version"))

    assert version is not None, f"Run Alembic migrations against {TEST_DATABASE!r} first"

    assert_test_redis()

    try:
        await redis_client.ping()
    except RedisError:
        pytest.exit("Redis is not reachable: run `docker compose up -d redis`", returncode=1)

    yield

    await redis_client.aclose()
    await engine.dispose()


@pytest.fixture(autouse=True)
async def clean_tables():
    """Empty every application table after each test."""

    yield

    assert engine.url.database == TEST_DATABASE
    tables = ", ".join(table.name for table in Base.metadata.sorted_tables)

    async with engine.begin() as connection:
        await connection.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


@pytest.fixture(autouse=True)
async def clean_redis():
    """Empty the test Redis database after each test."""

    yield

    assert_test_redis()
    await redis_client.flushdb()


@pytest.fixture
async def client():
    """Provide an HTTP client that calls the app in-process."""

    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
