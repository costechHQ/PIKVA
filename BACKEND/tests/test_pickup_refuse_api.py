"""API tests for refusing a pickup at the gate (SRS 11.4)."""

import pytest
from sqlalchemy import select

import test_pickup_code_api as api
from app.db.session import async_session
from app.models.audit_log import AuditLog
from app.models.user import User, UserRole
from app.services import notification_service
from app.services.alert_service import REPEATED_FAILED_ATTEMPTS, REPEATED_FAILURE_LIMIT, refused_pickup_alert
from test_security_api import Outbox

REFUSE_URL = "/api/v1/pickup/refuse"


@pytest.fixture
async def school(client):
    """One school with an admin, a parent, gate staff and an approved pickup person."""

    return await api.create_school(client, "refuse")


@pytest.fixture
def outbox(monkeypatch):
    box = Outbox()
    monkeypatch.setattr(notification_service, "get_email_sender", lambda: box)
    return box


async def refuse(client, school, body: dict, headers: dict | None = None) -> dict:
    response = await client.post(REFUSE_URL, headers=headers or school["headers"]["gate_staff"], json=body)
    assert response.status_code == 200
    return response.json()


async def test_refusal_cancels_the_code_and_alerts_the_school(client, school, outbox):
    issued = await api.issue(client, school)
    body = {"method": "manual", "code": issued["code"]}
    assert (await api.verify(client, school, body))["verified"] is True

    refused = await refuse(client, school, body)

    assert refused == {"result": "valid", "method": "manual", "refused": True}
    assert ("pickup_refused", issued["pupil_id"], school["authorisation_id"]) in await api.alerts(school["school_id"])
    # The code is dead everywhere: checking or releasing it now fails.
    assert (await api.verify(client, school, body))["result"] == "expired_code"
    assert (await api.release(client, school, body, 200))["released"] is False
    # Admins hear about it straight away.
    assert [message.subject for message in outbox.sent][0] == "Pikva security alert: pickup_refused"

    async with async_session() as session:
        entry = await session.scalar(select(AuditLog).where(AuditLog.action == "pickup.refused"))
    assert entry.metadata_["pupil_id"] == issued["pupil_id"]
    assert issued["code"] not in str(entry.metadata_)


async def test_qr_refusal_works_the_same_way(client, school):
    issued = await api.issue(client, school)

    refused = await refuse(client, school, {"method": "qr", "qr_data": issued["qr_data"]})

    assert refused["refused"] is True


async def test_code_used_elsewhere_is_not_refused(client, school):
    issued = await api.issue(client, school)
    body = {"method": "manual", "code": issued["code"]}
    await api.release(client, school, body, 201)

    refused = await refuse(client, school, body)

    assert refused == {"result": "used_code", "method": "manual", "refused": False}
    types = [alert[0] for alert in await api.alerts(school["school_id"])]
    assert "pickup_refused" not in types and "used_code" in types


async def test_unknown_or_other_school_code_is_not_refused(client, school):
    issued = await api.issue(client, school)
    other = await api.create_school(client, "elsewhere")

    unknown = await refuse(client, school, {"method": "manual", "code": "ZZZZ9999"})
    foreign = await refuse(client, school, {"method": "manual", "code": issued["code"]}, other["headers"]["gate_staff"])

    assert unknown["result"] == foreign["result"] == "invalid_code"
    assert (await api.verify(client, school, {"method": "manual", "code": issued["code"]}))["verified"] is True


async def test_refusals_never_count_as_staff_failures(client, school):
    """A staff member who refuses many people is doing the job, not guessing codes."""

    async with async_session() as session:
        gate_id = await session.scalar(
            select(User.id).where(User.school_id == school["school_id"], User.role == UserRole.GATE_STAFF)
        )
        # As many refusals as the repeated-attempts limit, then one real failure.
        for _ in range(REPEATED_FAILURE_LIMIT):
            session.add(refused_pickup_alert(school["school_id"], gate_id, "manual", 1, 1))
        await session.commit()

    await api.verify(client, school, {"method": "manual", "code": "ZZZZ9999"})

    assert REPEATED_FAILED_ATTEMPTS not in [alert[0] for alert in await api.alerts(school["school_id"])]


async def test_refusal_email_skips_the_cooldown(client, school, outbox):
    """Another alert was just emailed; a refusal is still sent at once."""

    await api.verify(client, school, {"method": "manual", "code": "ZZZZ9999"})
    issued = await api.issue(client, school)

    await refuse(client, school, {"method": "manual", "code": issued["code"]})

    assert [message.subject for message in outbox.sent] == [
        "Pikva security alert: invalid_code",
        "Pikva security alert: pickup_refused",
    ]
