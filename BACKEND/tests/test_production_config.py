"""Tests for environment-dependent settings: API docs and SECRET_KEY strength (SRS 21, 24, 27)."""

import logging
import secrets

import httpx
import pytest
from pydantic import ValidationError

from app.core.config import Settings, secret_key_weakness, settings
from app.main import create_app

DOCS_URLS = ("/docs", "/redoc", "/openapi.json")
STRONG_KEY = secrets.token_urlsafe(48)


@pytest.fixture
def production(monkeypatch):
    """Run as production with a strong SECRET_KEY."""

    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "secret_key", STRONG_KEY)


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
async def test_production_hides_api_docs(production, url):
    """Swagger, ReDoc and the OpenAPI schema are not served in production."""

    assert (await get(create_app(), url)).status_code == 404


async def test_production_still_serves_api(production):
    """Hiding the docs leaves the API itself working."""

    assert (await get(create_app(), "/api/v1/health")).status_code == 200


@pytest.mark.parametrize("url", DOCS_URLS)
async def test_development_serves_api_docs(monkeypatch, url):
    """The docs stay available during development (SRS 24)."""

    monkeypatch.setattr(settings, "environment", "development")

    assert (await get(create_app(), url)).status_code == 200


# --- SECRET_KEY strength (SRS 21, 27) ---

WEAK_KEYS = {
    "too short": "Xy7#kq2!Lm9@",
    "placeholder": "please-change-me-before-going-live-in-production",
    "few distinct characters": "ab" * 40,
    "exact placeholder": "changeme",
}


@pytest.mark.parametrize("key", WEAK_KEYS.values(), ids=WEAK_KEYS.keys())
def test_weak_secret_keys_are_detected(key):
    """Short, placeholder and low-variety keys are reported as weak."""

    assert secret_key_weakness(key) is not None


def test_generated_secret_key_is_accepted():
    """A key from secrets.token_urlsafe(48) passes."""

    assert secret_key_weakness(STRONG_KEY) is None


@pytest.mark.parametrize("key", WEAK_KEYS.values(), ids=WEAK_KEYS.keys())
def test_production_refuses_weak_secret_key(production, monkeypatch, key):
    """Production will not start with a weak key, and the error hides the key."""

    monkeypatch.setattr(settings, "secret_key", key)

    with pytest.raises(RuntimeError) as caught:
        create_app()

    assert "SECRET_KEY" in str(caught.value)
    assert "secrets.token_urlsafe" in str(caught.value)
    assert key not in str(caught.value)


def test_development_warns_about_weak_secret_key(monkeypatch, caplog):
    """Development starts with a weak key but logs a warning without the key."""

    key = WEAK_KEYS["placeholder"]
    monkeypatch.setattr(settings, "environment", "development")
    monkeypatch.setattr(settings, "secret_key", key)
    caplog.set_level(logging.WARNING, logger="app.main")

    create_app()

    assert "SECRET_KEY" in caplog.text
    assert key not in caplog.text
