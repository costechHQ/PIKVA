"""API tests for role restrictions, alerts, alert emails and the audit log (SRS 6.5, 13, 14, 20, 23.2, 23.7)."""

import pytest

import test_pickup_code_api as api
from app.main import app
from app.services import notification_service

ROLES = ("admin", "parent", "gate_staff")
STAFF = ("admin",)
PARENT = ("parent",)
GATE = ("gate_staff",)
MANAGERS = ("parent", "admin")

PUBLIC_ROUTES = {
    ("GET", "/api/v1/health"),
    ("GET", "/api/v1/health/db"),
    ("GET", "/api/v1/health/redis"),
    ("POST", "/api/v1/auth/register"),
    ("POST", "/api/v1/auth/login"),
}

# Which roles may call each protected endpoint. Every route the app exposes
# must appear here or in PUBLIC_ROUTES, so new endpoints cannot skip review.
ACCESS = {
    ("GET", "/api/v1/auth/me"): ROLES,
    ("GET", "/api/v1/health/auth"): ROLES,
    ("GET", "/api/v1/health/admin"): STAFF,
    ("GET", "/api/v1/schools/me"): STAFF,
    ("GET", "/api/v1/schools/users"): STAFF,
    ("POST", "/api/v1/schools/users"): STAFF,
    ("GET", "/api/v1/pupils"): MANAGERS,
    ("POST", "/api/v1/pupils"): MANAGERS,
    ("GET", "/api/v1/pupils/{pupil_id}"): MANAGERS,
    ("PATCH", "/api/v1/pupils/{pupil_id}"): MANAGERS,
    ("POST", "/api/v1/pickers"): PARENT,
    ("GET", "/api/v1/pickers"): MANAGERS,
    ("GET", "/api/v1/pickers/{authorisation_id}"): MANAGERS,
    ("PATCH", "/api/v1/pickers/{authorisation_id}"): MANAGERS,
    ("POST", "/api/v1/pickers/{authorisation_id}/activate"): MANAGERS,
    ("POST", "/api/v1/pickers/{authorisation_id}/deactivate"): MANAGERS,
    ("POST", "/api/v1/pickup/codes"): PARENT,
    ("POST", "/api/v1/pickup/verify"): GATE,
    ("POST", "/api/v1/pickup/release"): GATE,
    ("GET", "/api/v1/releases"): MANAGERS,
    ("GET", "/api/v1/alerts"): STAFF,
    ("GET", "/api/v1/alerts/{alert_id}"): STAFF,
    ("POST", "/api/v1/alerts/{alert_id}/resolve"): STAFF,
    ("GET", "/api/v1/audit-logs"): STAFF,
}


@pytest.fixture
async def school(client):
    """Provide one school with an admin, a parent, gate staff and an authorisation."""

    return await api.create_school(client, "alpha")


def test_access_table_covers_every_route():
    """Every exposed route is either public or has an explicit role rule."""

    routes = {
        (method.upper(), path)
        for path, operations in app.openapi()["paths"].items()
        for method in operations
    }

    assert routes == set(ACCESS) | PUBLIC_ROUTES


@pytest.mark.parametrize(("method", "path"), sorted(ACCESS))
async def test_role_restrictions(client, school, method, path):
    """Wrong roles get 403, no token gets 401, allowed roles get past both."""

    # Unknown IDs and empty bodies keep allowed calls from changing any data.
    url = path.format(pupil_id=999999, authorisation_id=999999, alert_id=999999)
    body = {} if method in ("POST", "PATCH") else None

    response = await client.request(method, url, json=body)
    assert response.status_code == 401, "no token"

    for role in ROLES:
        response = await client.request(method, url, headers=school["headers"][role], json=body)

        if role in ACCESS[(method, path)]:
            assert response.status_code not in (401, 403), (role, response.text)
        else:
            assert response.status_code == 403, (role, response.text)


# --- Security alerts over HTTP (SRS 13, 18.7, 23.7) ---


async def failed_attempt_alert(client, school) -> dict:
    """Make the gate fail a verification and return the admin's view of the alert."""

    await api.verify(client, school, {"method": "manual", "code": "ZZZZ9999"})

    response = await client.get(
        "/api/v1/alerts", headers=school["headers"]["admin"], params={"status": "open"}
    )
    assert response.status_code == 200
    [alert] = response.json()

    return alert


async def test_admin_views_and_resolves_alert(client, school):
    """An admin can list, inspect and resolve an alert exactly once."""

    admin = school["headers"]["admin"]
    alert = await failed_attempt_alert(client, school)

    assert alert["alert_type"] == "invalid_code"
    assert alert["status"] == "open"
    assert alert["resolved_at"] is None
    assert alert["attempted_by"] is not None
    assert "ZZZZ9999" not in alert["message"]

    detail = await client.get(f"/api/v1/alerts/{alert['id']}", headers=admin)
    assert detail.json() == alert

    resolved = await client.post(f"/api/v1/alerts/{alert['id']}/resolve", headers=admin)
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "resolved"
    assert resolved.json()["resolved_at"] is not None

    again = await client.post(f"/api/v1/alerts/{alert['id']}/resolve", headers=admin)
    assert again.status_code == 409

    open_alerts = await client.get("/api/v1/alerts", headers=admin, params={"status": "open"})
    resolved_alerts = await client.get(
        "/api/v1/alerts", headers=admin, params={"status": "resolved"}
    )
    assert open_alerts.json() == []
    assert [a["id"] for a in resolved_alerts.json()] == [alert["id"]]


async def test_alert_status_filter_is_validated(client, school):
    """Unknown status filters are rejected."""

    response = await client.get(
        "/api/v1/alerts", headers=school["headers"]["admin"], params={"status": "closed"}
    )

    assert response.status_code == 422


async def test_other_school_admin_cannot_see_or_resolve_alert(client, school):
    """Alerts are invisible across schools."""

    alert = await failed_attempt_alert(client, school)
    other = (await api.create_school(client, "bravo"))["headers"]["admin"]

    listed = await client.get("/api/v1/alerts", headers=other)
    detail = await client.get(f"/api/v1/alerts/{alert['id']}", headers=other)
    resolve = await client.post(f"/api/v1/alerts/{alert['id']}/resolve", headers=other)

    assert listed.json() == []
    assert detail.status_code == 404
    assert resolve.status_code == 404


# --- Audit log over HTTP (SRS 5.1, 14) ---


async def test_admin_reads_audit_log_with_resolver(client, school):
    """The audit log shows who resolved an alert and filters by action."""

    admin = school["headers"]["admin"]
    alert = await failed_attempt_alert(client, school)
    await client.post(f"/api/v1/alerts/{alert['id']}/resolve", headers=admin)

    response = await client.get(
        "/api/v1/audit-logs", headers=admin, params={"action": "alert.resolved"}
    )

    assert response.status_code == 200
    [entry] = response.json()
    assert entry["user"]["name"] == "alpha Admin"
    assert set(entry["user"]) == {"id", "name"}
    assert (entry["entity_type"], entry["entity_id"]) == ("security_alert", alert["id"])

    by_entity = await client.get(
        "/api/v1/audit-logs",
        headers=admin,
        params={"entity_type": "pickup_authorisation", "entity_id": school["authorisation_id"]},
    )
    assert [e["action"] for e in by_entity.json()] == ["pickup_authorisation.created"]


async def test_audit_log_is_limited_to_school(client, school):
    """Another school's admin only sees their own school's records."""

    other = await api.create_school(client, "bravo")

    response = await client.get("/api/v1/audit-logs", headers=other["headers"]["admin"])

    names = {entry["user"]["name"] for entry in response.json()}
    assert names and all(name.startswith("bravo") for name in names)


@pytest.mark.parametrize("params", [{"limit": 0}, {"limit": 201}, {"offset": -1}])
async def test_audit_log_rejects_bad_paging(client, school, params):
    """Paging values outside the allowed range are rejected."""

    response = await client.get(
        "/api/v1/audit-logs", headers=school["headers"]["admin"], params=params
    )

    assert response.status_code == 422


# --- Security alert emails from the gate (SRS 3.1, 20) ---


class Outbox:
    """Capture emails the app sends, optionally failing like a provider outage."""

    def __init__(self):
        self.sent = []
        self.fail = False

    async def send(self, message):
        if self.fail:
            raise RuntimeError("provider down")
        self.sent.append(message)


@pytest.fixture
def outbox(monkeypatch):
    """Replace the real email sender with a capturing one."""

    box = Outbox()
    monkeypatch.setattr(notification_service, "get_email_sender", lambda: box)

    return box


async def test_failed_verify_emails_school_admin(client, school, outbox):
    """A failed gate check emails the admin, without the code."""

    issued = await api.issue(client, school)
    await api.release(client, school, {"method": "manual", "code": issued["code"]}, 201)

    await api.verify(client, school, {"method": "manual", "code": issued["code"]})

    [message] = outbox.sent
    assert message.to == ("admin-alpha@example.com",)
    assert message.subject == "Pikva security alert: used_code"
    assert "alpha School" in message.text
    assert issued["code"] not in message.text
    assert issued["code"] not in message.subject


async def test_failed_release_emails_school_admin(client, school, outbox):
    """A refused release emails the admin too."""

    issued = await api.issue(client, school)
    body = {"method": "manual", "code": issued["code"]}
    await api.release(client, school, body, 201)

    await api.release(client, school, body, 200)

    [message] = outbox.sent
    assert message.subject == "Pikva security alert: used_code"


async def test_successful_gate_flow_sends_no_email(client, school, outbox):
    """Verifying and releasing a valid code emails nobody."""

    issued = await api.issue(client, school)
    body = {"method": "qr", "qr_data": issued["qr_data"]}

    await api.verify(client, school, body)
    await api.release(client, school, body, 201)

    assert outbox.sent == []


async def test_repeated_attempts_email_includes_both_alerts(client, school, outbox):
    """Five failures send two emails: the first alert, then the repeated-attempts one.

    Failures two to four fall inside the per-school email cooldown, so they
    are recorded for the dashboard but not emailed.
    """

    for _ in range(5):
        await api.verify(client, school, {"method": "manual", "code": "ZZZZ9999"})

    assert [message.subject for message in outbox.sent] == [
        "Pikva security alert: invalid_code",
        "Pikva security alerts: invalid_code, repeated_failed_attempts",
    ]
    assert len(await api.alerts(school["school_id"])) == 6


async def test_email_outage_does_not_affect_gate(client, school, outbox):
    """If the provider is down, the gate still gets its answer and the alert is kept."""

    outbox.fail = True

    result = await api.verify(client, school, {"method": "manual", "code": "ZZZZ9999"})

    assert result["result"] == "invalid_code"
    assert [a[0] for a in await api.alerts(school["school_id"])] == ["invalid_code"]


# --- Admin pupil access (SRS 5.1, 18.3, 18.4) ---


async def test_admin_lists_and_views_all_school_pupils(client, school):
    """Admins see every pupil in their school; parents see only their own."""

    other_parent = await api.add_parent(client, school, "other")
    response = await client.post(
        "/api/v1/pupils",
        headers=other_parent,
        json={"first_name": "Bisi", "last_name": "Ade", "date_of_birth": "2019-02-02"},
    )
    other_pupil = response.json()

    admin_list = await client.get("/api/v1/pupils", headers=school["headers"]["admin"])
    parent_list = await client.get("/api/v1/pupils", headers=school["headers"]["parent"])
    admin_view = await client.get(
        f"/api/v1/pupils/{other_pupil['id']}", headers=school["headers"]["admin"]
    )
    parent_view = await client.get(
        f"/api/v1/pupils/{other_pupil['id']}", headers=school["headers"]["parent"]
    )

    assert [p["first_name"] for p in admin_list.json()] == ["Bisi", "Ada"]
    assert [p["first_name"] for p in parent_list.json()] == ["Ada"]
    assert admin_view.status_code == 200
    assert admin_view.json()["parent_id"] == other_pupil["parent_id"]
    assert parent_view.status_code == 404
    assert parent_view.json()["detail"] == "Pupil not found"


async def test_admin_cannot_see_other_school_pupils(client, school):
    """Another school's admin sees no pupils and gets 404 for this school's pupil."""

    [pupil] = (await client.get("/api/v1/pupils", headers=school["headers"]["parent"])).json()
    other = (await api.create_school(client, "bravo"))["headers"]["admin"]

    listed = await client.get("/api/v1/pupils", headers=other)
    viewed = await client.get(f"/api/v1/pupils/{pupil['id']}", headers=other)

    assert [p["first_name"] for p in listed.json()] == ["Ada"]
    assert all(p["school_id"] != pupil["school_id"] for p in listed.json())
    assert viewed.status_code == 404


PUPIL = {"first_name": "Chidi", "last_name": "Eze", "date_of_birth": "2018-05-05"}


async def pupil_audits(school_id: int) -> list[tuple]:
    """Return (action, user_id, parent_id metadata) for pupil audit entries."""

    async with api.async_session() as session:
        rows = await session.execute(
            api.text(
                "SELECT action, user_id, metadata->>'parent_id' FROM audit_logs "
                "WHERE school_id = :s AND entity_type = 'pupil' ORDER BY id"
            ),
            {"s": school_id},
        )

    return [tuple(row) for row in rows]


async def test_admin_creates_pupil_for_school_parent(client, school):
    """An admin creates a pupil for a parent; the audit names the admin."""

    ids = await api.user_ids(school["school_id"])

    response = await client.post(
        "/api/v1/pupils",
        headers=school["headers"]["admin"],
        json=PUPIL | {"parent_id": ids["parent"]},
    )

    assert response.status_code == 201
    assert response.json()["parent_id"] == ids["parent"]
    assert response.json()["school_id"] == school["school_id"]
    assert (await pupil_audits(school["school_id"]))[-1] == (
        "pupil.created", ids["school_admin"], str(ids["parent"]),
    )


async def test_admin_pupil_needs_a_parent_from_own_school(client, school):
    """Missing, non-parent and other-school parent IDs are refused."""

    ids = await api.user_ids(school["school_id"])
    other = await api.create_school(client, "bravo")
    other_parent = (await api.user_ids(other["school_id"]))["parent"]
    admin = school["headers"]["admin"]

    cases = [
        ({}, "parent_id is required"),
        ({"parent_id": ids["gate_staff"]}, "Parent not found in this school"),
        ({"parent_id": ids["school_admin"]}, "Parent not found in this school"),
        ({"parent_id": other_parent}, "Parent not found in this school"),
    ]
    for extra, detail in cases:
        response = await client.post("/api/v1/pupils", headers=admin, json=PUPIL | extra)
        assert (response.status_code, response.json()["detail"]) == (422, detail), extra


async def test_parent_cannot_choose_a_parent(client, school):
    """A parent cannot attach a new pupil to another account."""

    ids = await api.user_ids(school["school_id"])

    response = await client.post(
        "/api/v1/pupils",
        headers=school["headers"]["parent"],
        json=PUPIL | {"parent_id": ids["parent"]},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Parents cannot choose a parent for a pupil"


async def test_admin_updates_any_school_pupil(client, school):
    """Admins update any pupil in the school; other parents get 404."""

    ids = await api.user_ids(school["school_id"])
    [pupil] = (await client.get("/api/v1/pupils", headers=school["headers"]["parent"])).json()
    other_parent = await api.add_parent(client, school, "other")
    url = f"/api/v1/pupils/{pupil['id']}"

    by_admin = await client.patch(url, headers=school["headers"]["admin"], json={"first_name": "Adaora"})
    by_other = await client.patch(url, headers=other_parent, json={"first_name": "X"})

    assert by_admin.status_code == 200
    assert by_admin.json()["first_name"] == "Adaora"
    assert by_admin.json()["parent_id"] == ids["parent"]
    assert by_other.status_code == 404
    assert (await pupil_audits(school["school_id"]))[-1][:2] == ("pupil.updated", ids["school_admin"])


# --- Admin lists school users (SRS 5.1) ---


async def test_admin_lists_school_users_by_role(client, school):
    """Admins list their school's users, filtered by role, without secrets."""

    await api.add_parent(client, school, "zara")
    admin = school["headers"]["admin"]

    everyone = await client.get("/api/v1/schools/users", headers=admin)
    parents = await client.get("/api/v1/schools/users", headers=admin, params={"role": "parent"})

    assert [u["role"] for u in everyone.json()] == ["school_admin", "gate_staff", "parent", "parent"]
    assert [u["name"] for u in parents.json()] == ["alpha parent", "zara Parent"]
    assert set(parents.json()[0]) == {"id", "school_id", "name", "email", "phone", "role"}
    assert all(u["school_id"] == school["school_id"] for u in everyone.json())


async def test_school_users_are_limited_to_own_school(client, school):
    """Another school's admin never sees this school's users."""

    other = await api.create_school(client, "bravo")

    response = await client.get("/api/v1/schools/users", headers=other["headers"]["admin"])

    assert {u["school_id"] for u in response.json()} == {other["school_id"]}


@pytest.mark.parametrize("params", [{"role": "owner"}, {"limit": 0}, {"limit": 501}, {"offset": -1}])
async def test_school_users_rejects_bad_query(client, school, params):
    """Unknown roles and out-of-range paging are rejected."""

    response = await client.get(
        "/api/v1/schools/users", headers=school["headers"]["admin"], params=params
    )

    assert response.status_code == 422


# --- Who am I (SRS 18.2, 19.2) ---


@pytest.mark.parametrize("role", ROLES)
async def test_me_returns_signed_in_user_and_school(client, school, role):
    """Every role can read its own identity, role and school name."""

    response = await client.get("/api/v1/auth/me", headers=school["headers"][role])

    assert response.status_code == 200
    body = response.json()
    assert body["role"] == {"admin": "school_admin"}.get(role, role)
    assert body["school_id"] == school["school_id"]
    assert body["school_name"] == "alpha School"
    assert set(body) == {"id", "school_id", "name", "email", "phone", "role", "school_name"}


async def test_me_rejects_bad_token(client):
    """An invalid token is 401, not an error."""

    response = await client.get(
        "/api/v1/auth/me", headers={"Authorization": "Bearer not-a-real-token"}
    )

    assert response.status_code == 401
