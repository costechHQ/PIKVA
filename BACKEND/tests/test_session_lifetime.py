"""Tests for session lifetime in access tokens (SRS 6.4, 6.10)."""

from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

import test_pickup_code_api as api
from app.core.config import Settings, settings
from app.core.security import create_access_token, decode_access_token, session_limits
from app.models.user import UserRole

NOW = datetime(2026, 10, 22, 9, 0, 0, tzinfo=timezone.utc)

STAFF_ROLES = (UserRole.SCHOOL_ADMIN, UserRole.GATE_STAFF)


def seconds(token: str, claim: str) -> int:
    return decode_access_token(token)[claim]


def test_default_limits_match_the_srs():
    """The defaults are the SRS 6.10 table."""

    for role in STAFF_ROLES:
        limits = session_limits(role)
        assert limits.idle == timedelta(minutes=30)
        assert limits.max_age == timedelta(hours=12)

    parent = session_limits(UserRole.PARENT)

    assert parent.idle == timedelta(hours=24)
    assert parent.max_age == timedelta(days=30)


def test_every_role_has_limits():
    """A role added later never crashes token creation; it gets the short staff limits."""

    class FutureRole:
        pass

    assert session_limits(FutureRole()) == session_limits(UserRole.GATE_STAFF)


def test_limits_follow_the_settings(monkeypatch):
    monkeypatch.setattr(settings, "access_token_expire_minutes", 10)
    monkeypatch.setattr(settings, "session_max_hours_staff", 3)
    monkeypatch.setattr(settings, "session_idle_minutes_parent", 90)
    monkeypatch.setattr(settings, "session_max_days_parent", 7)

    assert session_limits(UserRole.SCHOOL_ADMIN).idle == timedelta(minutes=10)
    assert session_limits(UserRole.SCHOOL_ADMIN).max_age == timedelta(hours=3)
    assert session_limits(UserRole.PARENT).idle == timedelta(minutes=90)
    assert session_limits(UserRole.PARENT).max_age == timedelta(days=7)


@pytest.mark.parametrize("name", [
    "access_token_expire_minutes",
    "session_max_hours_staff",
    "session_idle_minutes_parent",
    "session_max_days_parent",
])
@pytest.mark.parametrize("value", [0, -5])
def test_limits_must_be_positive(name, value):
    """A zero or negative limit would make every token expire at once."""

    with pytest.raises(ValidationError):
        Settings(database_url="postgresql+asyncpg://x/y", secret_key="k" * 40, **{name: value})


def test_new_token_records_sign_in_time():
    """A sign-in token has auth_time equal to its issue time."""

    token = create_access_token("7", UserRole.SCHOOL_ADMIN, now=NOW)
    payload = decode_access_token_unchecked(token)

    assert payload["auth_time"] == payload["iat"] == int(NOW.timestamp())


def test_staff_token_expires_after_the_idle_limit():
    token = create_access_token("7", UserRole.GATE_STAFF, now=NOW)

    assert decode_access_token_unchecked(token)["exp"] == int((NOW + timedelta(minutes=30)).timestamp())


def test_parent_token_expires_after_the_parent_idle_limit():
    token = create_access_token("7", UserRole.PARENT, now=NOW)

    assert decode_access_token_unchecked(token)["exp"] == int((NOW + timedelta(hours=24)).timestamp())


def test_renewal_keeps_the_original_sign_in_time():
    """auth_time passed in is copied unchanged; only iat and exp move."""

    signed_in = NOW - timedelta(hours=2)
    token = create_access_token("7", UserRole.SCHOOL_ADMIN, auth_time=signed_in, now=NOW)
    payload = decode_access_token_unchecked(token)

    assert payload["auth_time"] == int(signed_in.timestamp())
    assert payload["iat"] == int(NOW.timestamp())
    assert payload["exp"] == int((NOW + timedelta(minutes=30)).timestamp())


@pytest.mark.parametrize("role, signed_in_ago, max_age", [
    (UserRole.SCHOOL_ADMIN, timedelta(hours=11, minutes=50), timedelta(hours=12)),
    (UserRole.GATE_STAFF, timedelta(hours=11, minutes=59), timedelta(hours=12)),
    (UserRole.PARENT, timedelta(days=29, hours=23), timedelta(days=30)),
])
def test_token_never_outlives_the_maximum_age(role, signed_in_ago, max_age):
    """Near the end of the maximum age, exp is capped at it, not at now + idle."""

    signed_in = NOW - signed_in_ago
    token = create_access_token("7", role, auth_time=signed_in, now=NOW)

    assert decode_access_token_unchecked(token)["exp"] == int((signed_in + max_age).timestamp())


def test_token_far_from_the_cap_is_not_shortened():
    signed_in = NOW - timedelta(hours=1)
    token = create_access_token("7", UserRole.SCHOOL_ADMIN, auth_time=signed_in, now=NOW)

    assert decode_access_token_unchecked(token)["exp"] == int((NOW + timedelta(minutes=30)).timestamp())


async def test_login_issues_a_role_limited_token(client):
    """A real sign-in gives staff the staff limit and a parent the parent limit."""

    headers = (await api.create_school(client, "life"))["headers"]

    def claims(role: str) -> dict:
        return decode_access_token(headers[role]["Authorization"].removeprefix("Bearer "))

    for role in ("admin", "gate_staff"):
        assert claims(role)["auth_time"] == claims(role)["iat"]
        assert claims(role)["exp"] - claims(role)["iat"] == 30 * 60

    assert claims("parent")["auth_time"] == claims("parent")["iat"]
    assert claims("parent")["exp"] - claims("parent")["iat"] == 24 * 60 * 60


def decode_access_token_unchecked(token: str) -> dict:
    """Read a token's claims without checking its expiry (test times are fixed in the past)."""

    import jwt

    return jwt.decode(token, settings.secret_key, algorithms=["HS256"], options={"verify_exp": False})
