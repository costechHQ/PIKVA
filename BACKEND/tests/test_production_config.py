"""Tests for environment-dependent settings: API docs only outside production (SRS 24, 27)."""

import httpx
import pytest
from pydantic import ValidationError

from app.core.config import Settings, settings
from app.main import create_app

DOCS_URLS = ("/docs", "/redoc", "/openapi.json")


async def get(app, url: str) -> httpx.Response:
    """Call one URL on the given app in-process."""

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(url)


def test_environment_defaults_to_development():
    """Without ENVIRONMENT set, the app runs as development."""

    assert Settings.model_fields["environment"].default == "development"


def test_unknown_environment_is_rejected():
    """A typo such as 'prod' fails at startup instead of running as development."""

    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            database_url="postgresql+asyncpg://user@localhost/db",
            secret_key="x" * 64,
            environment="prod",
        )


@pytest.mark.parametrize("url", DOCS_URLS)
async def test_production_hides_api_docs(monkeypatch, url):
    """Swagger, ReDoc and the OpenAPI schema are not served in production."""

    monkeypatch.setattr(settings, "environment", "production")

    assert (await get(create_app(), url)).status_code == 404


async def test_production_still_serves_api(monkeypatch):
    """Hiding the docs leaves the API itself working."""

    monkeypatch.setattr(settings, "environment", "production")

    assert (await get(create_app(), "/api/v1/health")).status_code == 200


@pytest.mark.parametrize("url", DOCS_URLS)
async def test_development_serves_api_docs(monkeypatch, url):
    """The docs stay available during development (SRS 24)."""

    monkeypatch.setattr(settings, "environment", "development")

    assert (await get(create_app(), url)).status_code == 200
