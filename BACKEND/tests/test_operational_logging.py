"""Tests that operational events are logged without sensitive values (SRS 28)."""

import logging

import test_pickup_code_api as api
from app.core.config import settings
from app.core.constants import CODE_REQUEST_LIMIT

WRONG_PASSWORD = "WrongPassword123!"


async def run_gate_day(client) -> dict:
    """Exercise login, codes, verification, release and a rate limit; return the secrets used."""

    school = await api.create_school(client, "alpha")

    await client.post(
        "/api/v1/auth/login",
        json={"email": "admin-alpha@example.com", "password": WRONG_PASSWORD},
    )

    issued = await api.issue(client, school)
    body = {"method": "manual", "code": issued["code"]}
    await api.verify(client, school, {"method": "manual", "code": "ZZZZ9999"})
    await api.verify(client, school, body)
    released = await api.release(client, school, body, 201)
    await api.release(client, school, body, 200)  # reused code

    for _ in range(CODE_REQUEST_LIMIT - 1):  # one code was already issued above
        await api.issue(client, school)
    limited = await client.post(
        api.CODES_URL,
        headers=school["headers"]["parent"],
        json={"authorisation_id": school["authorisation_id"]},
    )
    assert limited.status_code == 429

    tokens = [h["Authorization"].removeprefix("Bearer ") for h in school["headers"].values()]

    return {"school": school, "code": issued["code"], "tokens": tokens, "release": released}


async def test_operational_events_are_logged(client, caplog):
    """Failed logins, failed checks, alerts, releases and rate limits leave log lines."""

    caplog.set_level(logging.DEBUG, logger="app")

    day = await run_gate_day(client)

    school_id = day["school"]["school_id"]
    text = caplog.text
    assert "Login failed from 127.0.0.1" in text
    assert f"result=invalid_code stage=verify method=manual school={school_id}" in text
    assert f"result=used_code stage=release method=manual school={school_id}" in text
    assert "Security alerts raised: ids=[" in text
    assert "types=[used_code]" in text
    assert f"Pupil released: release={day['release']['release_id']} school={school_id}" in text
    assert "Rate limit exceeded: codes:parent" in text


async def test_logs_never_contain_secrets_or_personal_details(client, caplog):
    """Passwords, tokens, codes, SECRET_KEY, names and emails stay out of every log line."""

    caplog.set_level(logging.DEBUG)

    day = await run_gate_day(client)

    text = caplog.text
    secrets = [
        api.PASSWORD,
        WRONG_PASSWORD,
        settings.secret_key,
        day["code"],
        *day["tokens"],
        "admin-alpha@example.com",
        "alpha Admin",
        "Ada",
    ]
    leaked = [index for index, value in enumerate(secrets) if value in text]

    assert leaked == [], f"sensitive values at positions {leaked} appeared in logs"
