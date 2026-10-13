"""Shared pytest fixtures for Pikva API tests against PostgreSQL."""

from sqlalchemy import text
from sqlalchemy.engine import make_url

from app.core.config import settings

TEST_DATABASE = "pikva_test"

# Point the app at the test database before the engine is created on import.
settings.database_url = make_url(settings.database_url).set(
    database=TEST_DATABASE
).render_as_string(hide_password=False)

import httpx  # noqa: E402
import pytest  # noqa: E402

from app.db.base import Base  # noqa: E402
from app.db.session import engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
async def test_database():
    """Refuse to run unless connected to the migrated test database."""

    assert engine.url.database == TEST_DATABASE, (
        f"Tests must use {TEST_DATABASE!r}, not {engine.url.database!r}"
    )

    async with engine.connect() as connection:
        version = await connection.scalar(text("SELECT version_num FROM alembic_version"))

    assert version is not None, f"Run Alembic migrations against {TEST_DATABASE!r} first"

    yield

    await engine.dispose()


@pytest.fixture(autouse=True)
async def clean_tables():
    """Empty every application table after each test."""

    yield

    assert engine.url.database == TEST_DATABASE
    tables = ", ".join(table.name for table in Base.metadata.sorted_tables)

    async with engine.begin() as connection:
        await connection.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


@pytest.fixture
async def client():
    """Provide an HTTP client that calls the app in-process."""

    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
