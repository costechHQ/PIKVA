"""API tests for pickup codes and gate verification (SRS 11, 13, 17, 21.2, 23.2, 23.5, 23.7)."""

import json
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

from app.db.session import async_session
from app.services.pickup_service import PickupCodeCheckResult, check_pickup_code

CODES_URL = "/api/v1/pickup/codes"
PASSWORD = "TestPassword123!"


async def login(client, email: str) -> dict[str, str]:
    """Log in and return a Bearer authorization header."""

    response = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 200

    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def create_school(client, tag: str) -> dict:
    """Register a school and create its parent, gate staff and authorisation."""

    response = await client.post(
        "/api/v1/auth/register",
        json={
            "name": f"{tag} Admin",
            "email": f"admin-{tag}@example.com",
            "phone": "0700000000",
            "password": PASSWORD,
            "school_name": f"{tag} School",
            "school_address": "1 Test Road",
        },
    )
    assert response.status_code == 201
    school_id = response.json()["school_id"]
    admin = await login(client, f"admin-{tag}@example.com")

    headers = {"admin": admin}
    for role in ("parent", "gate_staff"):
        response = await client.post(
            "/api/v1/schools/users",
            headers=admin,
            json={
                "name": f"{tag} {role}",
                "email": f"{role}-{tag}@example.com",
                "phone": "0711111111",
                "password": PASSWORD,
                "role": role,
            },
        )
        assert response.status_code == 201
        headers[role] = await login(client, f"{role}-{tag}@example.com")

    authorisation_id = await create_authorisation(client, headers["parent"])

    return {"school_id": school_id, "headers": headers, "authorisation_id": authorisation_id}


async def create_authorisation(client, parent: dict[str, str]) -> int:
    """Create a pupil and an active pickup authorisation for a parent."""

    response = await client.post(
        "/api/v1/pupils",
        headers=parent,
        json={"first_name": "Ada", "last_name": "Pupil", "date_of_birth": "2018-01-01"},
    )
    assert response.status_code == 201

    now = datetime.now(timezone.utc)
    response = await client.post(
        "/api/v1/pickers",
        headers=parent,
        json={
            "pupil_id": response.json()["id"],
            "picker_name": "Aunt Ada",
            "picker_phone": "0722222222",
            "relationship": "aunt",
            "type": "regular",
            "starts_at": (now - timedelta(hours=1)).isoformat(),
            "expires_at": (now + timedelta(days=30)).isoformat(),
        },
    )
    assert response.status_code == 201

    return response.json()["id"]


@pytest.fixture
async def school(client):
    """Provide one school with an admin, a parent, gate staff and an authorisation."""

    return await create_school(client, "alpha")


async def check(school_id: int, code: str) -> PickupCodeCheckResult:
    """Check a code at the gate of the given school."""

    async with async_session() as session:
        return (await check_pickup_code(session, school_id, code)).result


async def test_parent_receives_code_once_and_only_hash_is_stored(client, school):
    """A parent gets a usable code; the database never holds the plaintext."""

    response = await client.post(
        CODES_URL,
        headers=school["headers"]["parent"],
        json={"authorisation_id": school["authorisation_id"]},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["authorisation_id"] == school["authorisation_id"]
    assert len(body["code"]) == 8
    assert json.loads(body["qr_data"]) == {
        "code": body["code"],
        "code_date": body["code_date"],
        "expires_at": body["expires_at"],
    }
    assert await check(school["school_id"], body["code"]) == PickupCodeCheckResult.VALID

    async with async_session() as session:
        rows = (await session.execute(text("SELECT * FROM daily_pickup_codes"))).all()

    assert len(rows) == 1
    assert all(body["code"] not in str(value).upper() for value in rows[0])


async def test_reissued_code_replaces_previous_code(client, school):
    """Requesting a new code over the API expires the previous one."""

    request = {"authorisation_id": school["authorisation_id"]}
    parent = school["headers"]["parent"]

    first = (await client.post(CODES_URL, headers=parent, json=request)).json()
    second = (await client.post(CODES_URL, headers=parent, json=request)).json()

    assert await check(school["school_id"], first["code"]) == PickupCodeCheckResult.EXPIRED_CODE
    assert await check(school["school_id"], second["code"]) == PickupCodeCheckResult.VALID


@pytest.mark.parametrize("role", ["admin", "gate_staff"])
async def test_staff_cannot_request_codes(client, school, role):
    """Only parents can request pickup codes."""

    response = await client.post(
        CODES_URL,
        headers=school["headers"][role],
        json={"authorisation_id": school["authorisation_id"]},
    )

    assert response.status_code == 403


async def test_request_without_token_is_unauthorised(client, school):
    """An unauthenticated request is rejected."""

    response = await client.post(
        CODES_URL, json={"authorisation_id": school["authorisation_id"]}
    )

    assert response.status_code == 401


async def test_parent_cannot_request_code_for_another_family(client, school):
    """Another parent in the same school gets 404, not the code."""

    response = await client.post(
        "/api/v1/schools/users",
        headers=school["headers"]["admin"],
        json={
            "name": "Other Parent",
            "email": "other-parent@example.com",
            "phone": "0733333333",
            "password": PASSWORD,
            "role": "parent",
        },
    )
    assert response.status_code == 201
    other_parent = await login(client, "other-parent@example.com")

    response = await client.post(
        CODES_URL,
        headers=other_parent,
        json={"authorisation_id": school["authorisation_id"]},
    )

    assert response.status_code == 404


async def test_parent_cannot_request_code_across_schools(client, school):
    """A parent from another school gets 404 and cannot use the code there."""

    other = await create_school(client, "bravo")

    response = await client.post(
        CODES_URL,
        headers=other["headers"]["parent"],
        json={"authorisation_id": school["authorisation_id"]},
    )
    assert response.status_code == 404

    response = await client.post(
        CODES_URL,
        headers=school["headers"]["parent"],
        json={"authorisation_id": school["authorisation_id"]},
    )
    code = response.json()["code"]

    assert await check(other["school_id"], code) == PickupCodeCheckResult.INVALID_CODE


async def test_unknown_authorisation_is_not_found(client, school):
    """A non-existent authorisation returns 404."""

    response = await client.post(
        CODES_URL,
        headers=school["headers"]["parent"],
        json={"authorisation_id": school["authorisation_id"] + 1000},
    )

    assert response.status_code == 404


async def test_deactivated_authorisation_cannot_get_code(client, school):
    """A deactivated authorisation is refused with 422 and no code."""

    authorisation_id = school["authorisation_id"]
    parent = school["headers"]["parent"]

    response = await client.post(
        f"/api/v1/pickers/{authorisation_id}/deactivate", headers=parent
    )
    assert response.status_code == 200

    response = await client.post(
        CODES_URL, headers=parent, json={"authorisation_id": authorisation_id}
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Pickup authorisation is inactive"
    assert "code" not in response.json()


async def test_missing_authorisation_id_is_rejected(client, school):
    """The request body must include an authorisation ID."""

    response = await client.post(CODES_URL, headers=school["headers"]["parent"], json={})

    assert response.status_code == 422


# --- Gate verification: POST /api/v1/pickup/verify (SRS 11, 13, 23.7) ---

VERIFY_URL = "/api/v1/pickup/verify"


async def issue(client, school) -> dict:
    """Issue a pickup code as the school's parent."""

    response = await client.post(
        CODES_URL,
        headers=school["headers"]["parent"],
        json={"authorisation_id": school["authorisation_id"]},
    )
    assert response.status_code == 201

    return response.json()


async def verify(client, school, body: dict) -> dict:
    """Verify a code as the school's gate staff and return the response body."""

    response = await client.post(VERIFY_URL, headers=school["headers"]["gate_staff"], json=body)
    assert response.status_code == 200

    return response.json()


async def alerts(school_id: int) -> list[tuple]:
    """Return (alert_type, pupil_id, authorisation_id) for a school, oldest first."""

    async with async_session() as session:
        rows = await session.execute(
            text(
                "SELECT alert_type, pupil_id, authorisation_id FROM security_alerts "
                "WHERE school_id = :school_id ORDER BY id"
            ),
            {"school_id": school_id},
        )

    return [tuple(row) for row in rows]


@pytest.mark.parametrize("method", ["manual", "qr"])
async def test_gate_verifies_valid_code(client, school, method):
    """A valid code shows only the minimal details and stays unused."""

    issued = await issue(client, school)
    body = {"method": "manual", "code": issued["code"]}
    if method == "qr":
        body = {"method": "qr", "qr_data": issued["qr_data"]}

    result = await verify(client, school, body)

    assert result["verified"] is True
    assert result["result"] == "valid"
    assert result["method"] == method
    assert result["code_expires_at"] == issued["expires_at"]
    assert result["pupil"]["id"] == issued["pupil_id"]
    assert set(result["pupil"]) == {"id", "first_name", "last_name", "photo_url"}
    assert result["authorisation"] == {
        "id": school["authorisation_id"],
        "picker_name": "Aunt Ada",
        "relationship": "aunt",
        "photo_url": None,
    }
    assert await alerts(school["school_id"]) == []
    assert await check(school["school_id"], issued["code"]) == PickupCodeCheckResult.VALID


async def failing_request(client, school, case: str) -> dict:
    """Prepare a verification request that fails in the given way."""

    issued = await issue(client, school)

    if case == "unknown_code":
        return {"method": "manual", "code": "ZZZZ9999"}
    if case == "malformed_qr":
        return {"method": "qr", "qr_data": "not a pikva code"}
    if case == "wrong_pupil":
        return {"method": "manual", "code": issued["code"], "pupil_id": issued["pupil_id"] + 1000}
    if case == "replaced_code":
        await issue(client, school)
        return {"method": "manual", "code": issued["code"]}
    if case == "deactivated":
        response = await client.post(
            f"/api/v1/pickers/{school['authorisation_id']}/deactivate",
            headers=school["headers"]["parent"],
        )
        assert response.status_code == 200
        return {"method": "manual", "code": issued["code"]}

    raise AssertionError(case)


@pytest.mark.parametrize(
    ("case", "result", "linked"),
    [
        ("unknown_code", "invalid_code", False),
        ("malformed_qr", "invalid_code", False),
        ("wrong_pupil", "wrong_pupil", True),
        ("replaced_code", "expired_code", True),
        ("deactivated", "authorisation_inactive", True),
    ],
)
async def test_failed_verification_reports_reason_and_records_alert(
    client, school, case, result, linked
):
    """Each failure returns its reason without details and records one alert."""

    body = await failing_request(client, school, case)

    response = await verify(client, school, body)

    assert response["verified"] is False
    assert response["result"] == result
    assert response["pupil"] is None and response["authorisation"] is None

    [(alert_type, pupil_id, authorisation_id)] = await alerts(school["school_id"])
    assert alert_type == result
    assert (pupil_id is not None, authorisation_id is not None) == (linked, linked)


async def test_fifth_failure_raises_repeated_attempts_alert(client, school):
    """Five failures within ten minutes add one repeated-attempts alert."""

    for _ in range(5):
        await verify(client, school, {"method": "manual", "code": "ZZZZ9999"})

    types = [alert_type for alert_type, _, _ in await alerts(school["school_id"])]

    assert types == ["invalid_code"] * 5 + ["repeated_failed_attempts"]


async def test_other_school_gate_cannot_verify_code(client, school):
    """A code from another school is invalid and reveals nothing."""

    issued = await issue(client, school)
    other = await create_school(client, "bravo")

    result = await verify(client, other, {"method": "manual", "code": issued["code"]})

    assert result["result"] == "invalid_code"
    assert result["pupil"] is None
    assert await alerts(other["school_id"]) == [("invalid_code", None, None)]
    assert await alerts(school["school_id"]) == []


@pytest.mark.parametrize("role", ["parent", "admin"])
async def test_only_gate_staff_can_verify(client, school, role):
    """Parents and admins cannot use the gate endpoint."""

    issued = await issue(client, school)

    response = await client.post(
        VERIFY_URL,
        headers=school["headers"][role],
        json={"method": "manual", "code": issued["code"]},
    )

    assert response.status_code == 403
    assert await alerts(school["school_id"]) == []


async def test_verify_without_token_is_unauthorised(client):
    """An unauthenticated gate request is rejected."""

    response = await client.post(VERIFY_URL, json={"method": "manual", "code": "ZZZZ9999"})

    assert response.status_code == 401


async def test_verify_with_mismatched_input_is_rejected(client, school):
    """A QR request without qr_data is a 422 and records no alert."""

    response = await client.post(
        VERIFY_URL,
        headers=school["headers"]["gate_staff"],
        json={"method": "qr", "code": "ZZZZ9999"},
    )

    assert response.status_code == 422
    assert await alerts(school["school_id"]) == []
