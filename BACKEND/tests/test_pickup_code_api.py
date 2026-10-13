"""API tests for pickup codes, gate verification, release and history (SRS 11-13, 17, 18.8, 21.2, 23.2, 23.5-23.7)."""

import json
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

from app.core.security import hash_pickup_code
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


# --- Release and history: POST /pickup/release, GET /releases (SRS 12, 18.8, 23.6) ---

RELEASE_URL = "/api/v1/pickup/release"
RELEASES_URL = "/api/v1/releases"


async def release(client, school, body: dict, expected_status: int) -> dict:
    """Release as the school's gate staff and return the response body."""

    response = await client.post(RELEASE_URL, headers=school["headers"]["gate_staff"], json=body)
    assert response.status_code == expected_status

    return response.json()


async def history(client, headers: dict, **params) -> list[dict]:
    """Return release history visible to the given user."""

    response = await client.get(RELEASES_URL, headers=headers, params=params)
    assert response.status_code == 200

    return response.json()


async def add_parent(client, school, tag: str) -> dict[str, str]:
    """Create another parent in the school and return their auth header."""

    response = await client.post(
        "/api/v1/schools/users",
        headers=school["headers"]["admin"],
        json={
            "name": f"{tag} Parent",
            "email": f"{tag}-parent@example.com",
            "phone": "0744444444",
            "password": PASSWORD,
            "role": "parent",
        },
    )
    assert response.status_code == 201

    return await login(client, f"{tag}-parent@example.com")


async def code_used_at(code: str):
    """Return used_at for the stored code matching a plaintext code."""

    async with async_session() as session:
        return await session.scalar(
            text("SELECT used_at FROM daily_pickup_codes WHERE code_hash = :h"),
            {"h": hash_pickup_code(code)},
        )


async def test_gate_releases_pupil_after_verification(client, school):
    """Verify then release creates one accountable release record."""

    issued = await issue(client, school)
    body = {"method": "qr", "qr_data": issued["qr_data"]}
    assert (await verify(client, school, body))["verified"] is True

    released = await release(client, school, body, 201)

    assert released["released"] is True
    assert released["result"] == "valid"
    assert released["pupil"]["id"] == issued["pupil_id"]
    assert await code_used_at(issued["code"]) is not None

    [item] = await history(client, school["headers"]["admin"])
    assert item["id"] == released["release_id"]
    assert item["released_at"] == released["released_at"]
    assert item["pupil"]["id"] == issued["pupil_id"]
    assert item["authorisation"]["id"] == school["authorisation_id"]
    assert item["verified_by"]["name"] == "alpha gate_staff"
    assert item["verification_method"] == "qr"
    assert item["result"] == "released"

    async with async_session() as session:
        audit = (
            await session.execute(
                text(
                    "SELECT action, entity_id, metadata::text FROM audit_logs "
                    "WHERE action = 'pupil.released'"
                )
            )
        ).one()
    assert audit[:2] == ("pupil.released", released["release_id"])
    assert issued["code"] not in audit[2]


async def test_reused_code_cannot_release_again(client, school):
    """A second release with the same code fails and is alerted."""

    issued = await issue(client, school)
    body = {"method": "manual", "code": issued["code"]}
    await release(client, school, body, 201)

    second = await release(client, school, body, 200)

    assert second["released"] is False
    assert second["result"] == "used_code"
    assert second["release_id"] is None and second["pupil"] is None
    assert len(await history(client, school["headers"]["admin"])) == 1
    assert [a[0] for a in await alerts(school["school_id"])] == ["used_code"]


async def test_failed_release_creates_no_record(client, school):
    """A release refused for an inactive authorisation leaves no trace but an alert."""

    issued = await issue(client, school)
    response = await client.post(
        f"/api/v1/pickers/{school['authorisation_id']}/deactivate",
        headers=school["headers"]["parent"],
    )
    assert response.status_code == 200

    result = await release(client, school, {"method": "manual", "code": issued["code"]}, 200)

    assert result["released"] is False
    assert result["result"] == "authorisation_inactive"
    assert await history(client, school["headers"]["admin"]) == []
    assert await code_used_at(issued["code"]) is None
    assert [a[0] for a in await alerts(school["school_id"])] == ["authorisation_inactive"]


@pytest.mark.parametrize("role", ["parent", "admin"])
async def test_only_gate_staff_can_release(client, school, role):
    """Parents and admins cannot release pupils."""

    issued = await issue(client, school)

    response = await client.post(
        RELEASE_URL,
        headers=school["headers"][role],
        json={"method": "manual", "code": issued["code"]},
    )

    assert response.status_code == 403
    assert await code_used_at(issued["code"]) is None


async def test_gate_staff_cannot_view_history(client, school):
    """Release history is for admins and parents only."""

    response = await client.get(RELEASES_URL, headers=school["headers"]["gate_staff"])

    assert response.status_code == 403


@pytest.mark.parametrize(("method", "url"), [("post", RELEASE_URL), ("get", RELEASES_URL)])
async def test_release_endpoints_require_token(client, method, url):
    """Unauthenticated release and history requests are rejected."""

    kwargs = {"json": {"method": "manual", "code": "ZZZZ9999"}} if method == "post" else {}

    response = await getattr(client, method)(url, **kwargs)

    assert response.status_code == 401


async def test_parent_history_shows_only_own_pupils(client, school):
    """Another parent in the same school cannot see this family's releases."""

    issued = await issue(client, school)
    await release(client, school, {"method": "manual", "code": issued["code"]}, 201)

    other_parent = await add_parent(client, school, "other")
    other_authorisation = await create_authorisation(client, other_parent)

    assert len(await history(client, school["headers"]["parent"])) == 1
    assert await history(client, other_parent) == []
    assert await history(client, other_parent, pupil_id=issued["pupil_id"]) == []
    assert other_authorisation != school["authorisation_id"]


async def test_history_is_limited_to_school(client, school):
    """Another school's admin sees none of this school's releases."""

    issued = await issue(client, school)
    await release(client, school, {"method": "manual", "code": issued["code"]}, 201)
    other = await create_school(client, "bravo")

    assert await history(client, other["headers"]["admin"]) == []


@pytest.mark.parametrize("params", [{"limit": 0}, {"limit": 201}, {"offset": -1}])
async def test_history_rejects_bad_paging(client, school, params):
    """Paging values outside the allowed range are rejected."""

    response = await client.get(RELEASES_URL, headers=school["headers"]["admin"], params=params)

    assert response.status_code == 422


# --- Audit coverage for SRS 14 actions (Rule 9) ---


async def user_ids(school_id: int) -> dict[str, int]:
    """Map each user's role to their ID within a school."""

    async with async_session() as session:
        rows = await session.execute(
            text("SELECT role::text, id FROM users WHERE school_id = :s"), {"s": school_id}
        )

    return {role.lower(): user_id for role, user_id in rows}


async def test_security_sensitive_actions_are_audited_with_actor(client, school):
    """Every SRS 14 action writes one audit entry naming who did it."""

    headers = school["headers"]
    authorisation_id = school["authorisation_id"]

    async with async_session() as session:
        pupil_id = await session.scalar(
            text("SELECT pupil_id FROM pickup_authorisations WHERE id = :a"),
            {"a": authorisation_id},
        )

    steps = [
        ("patch", f"/api/v1/pupils/{pupil_id}", "parent", {"first_name": "Adaeze"}),
        ("patch", f"/api/v1/pickers/{authorisation_id}", "admin", {"relationship": "aunty"}),
        ("post", f"/api/v1/pickers/{authorisation_id}/deactivate", "admin", None),
        ("post", f"/api/v1/pickers/{authorisation_id}/activate", "parent", None),
        ("post", CODES_URL, "parent", {"authorisation_id": authorisation_id}),
    ]
    for method, url, role, body in steps:
        response = await client.request(method, url, headers=headers[role], json=body)
        assert response.status_code in (200, 201), (url, response.text)
    code = response.json()["code"]

    ids = await user_ids(school["school_id"])
    admin, parent, gate = ids["school_admin"], ids["parent"], ids["gate_staff"]

    async with async_session() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT action, user_id, entity_type, entity_id, metadata::text "
                    "FROM audit_logs WHERE school_id = :s ORDER BY id"
                ),
                {"s": school["school_id"]},
            )
        ).all()

    assert [(action, user, entity, entity_id) for action, user, entity, entity_id, _ in rows] == [
        ("user.created", admin, "user", admin),
        ("user.created", admin, "user", parent),
        ("user.created", admin, "user", gate),
        ("pupil.created", parent, "pupil", pupil_id),
        ("pickup_authorisation.created", parent, "pickup_authorisation", authorisation_id),
        ("pupil.updated", parent, "pupil", pupil_id),
        ("pickup_authorisation.updated", admin, "pickup_authorisation", authorisation_id),
        ("pickup_authorisation.deactivated", admin, "pickup_authorisation", authorisation_id),
        ("pickup_authorisation.activated", parent, "pickup_authorisation", authorisation_id),
        ("pickup_code.generated", parent, "daily_pickup_code", rows[-1][3]),
    ]

    metadata = [row[4] for row in rows]
    assert '"via": "registration"' in metadata[0]
    assert '"fields": ["first_name"]' in metadata[5]
    assert "Adaeze" not in metadata[5]
    assert all(PASSWORD not in m and code not in m for m in metadata)
