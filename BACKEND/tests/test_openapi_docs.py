"""Tests that OpenAPI documents the rate-limit and health responses (SRS 24, 33 item 10)."""

import pytest

from app.main import app

RATE_LIMITED = [
    ("post", "/api/v1/auth/login"),
    ("post", "/api/v1/auth/register"),
    ("post", "/api/v1/pickup/codes"),
    ("post", "/api/v1/pickup/verify"),
    ("post", "/api/v1/pickup/release"),
]


def responses(method: str, path: str) -> dict:
    """Return the documented responses for one operation."""

    return app.openapi()["paths"][path][method]["responses"]


@pytest.mark.parametrize(("method", "path"), RATE_LIMITED)
def test_rate_limited_routes_document_429(method, path):
    """Every rate-limited route documents 429 and its Retry-After header."""

    documented = responses(method, path)

    assert "429" in documented
    assert "Retry-After" in documented["429"]["headers"]


def test_release_keeps_its_201_response():
    """Adding 429 does not drop release's documented 201."""

    assert {"200", "201", "429"} <= set(responses("post", "/api/v1/pickup/release"))


def test_unlimited_route_does_not_claim_429():
    """Routes without a limit do not advertise one."""

    assert "429" not in responses("get", "/api/v1/auth/me")


def test_redis_health_documents_503():
    """The Redis health check documents its outage response."""

    assert "503" in responses("get", "/api/v1/health/redis")
