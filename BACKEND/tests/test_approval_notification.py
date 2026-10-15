"""Tests for emailing admins about pickup people awaiting approval (SRS 9.2, 20)."""

import pytest

import test_pickup_code_api as api
from app.core.config import settings
from app.db.redis import redis_client
from app.db.session import async_session
from app.models.school import School
from app.models.user import User, UserRole
from app.routes import pickers as pickers_routes
from app.services.approval_notification_service import (
    APPROVAL_EMAIL_COOLDOWN_SECONDS,
    notify_approval_requested,
)


class FakeSender:
    """Capture emails instead of sending them."""

    def __init__(self, fail: bool = False):
        self.sent = []
        self.fail = fail

    async def send(self, message):
        if self.fail:
            raise RuntimeError("provider down")
        self.sent.append(message)


async def make_school(name: str, admins: int = 1) -> int:
    """Create a school with some admins and a parent; return its id."""

    async with async_session() as session:
        school = School(name=f"{name} School", address="1 Test Road")
        session.add(school)
        await session.flush()

        for number in range(1, admins + 1):
            session.add(User(
                school_id=school.id, name=f"{name} Admin {number}",
                email=f"admin{number}-{name.lower()}@example.com", phone="0700000000",
                password_hash="not-used", role=UserRole.SCHOOL_ADMIN,
            ))
        session.add(User(
            school_id=school.id, name=f"{name} Parent", email=f"parent-{name.lower()}@example.com",
            phone="0700000000", password_hash="not-used", role=UserRole.PARENT,
        ))
        await session.commit()

        return school.id


# --- The email --------------------------------------------------------------


async def test_email_goes_to_the_schools_admins_with_a_link():
    """Only this school's admins are emailed, with a link to the Approvals page."""

    school_id = await make_school("Alpha", admins=2)
    await make_school("Bravo")
    sender = FakeSender()

    assert await notify_approval_requested(school_id, sender) is True

    [message] = sender.sent
    assert message.to == ("admin1-alpha@example.com", "admin2-alpha@example.com")
    assert message.subject == "Pikva: a pickup person is waiting for approval"
    assert "Alpha School" in message.text
    assert f"{settings.web_app_url.rstrip('/')}/admin/approvals" in message.text


async def test_email_names_no_people():
    """No parent, pupil or pickup person is named in the email (SRS 20)."""

    school_id = await make_school("Charlie")
    sender = FakeSender()

    await notify_approval_requested(school_id, sender)

    assert "Charlie Parent" not in sender.sent[0].text
    assert "Charlie Admin" not in sender.sent[0].text


async def test_one_email_per_school_per_cooldown():
    """A second request within the cooldown is not emailed; another school still is."""

    school_id = await make_school("Delta")
    other_id = await make_school("Echo")
    sender = FakeSender()

    assert await notify_approval_requested(school_id, sender) is True
    assert await notify_approval_requested(school_id, sender) is False
    assert await notify_approval_requested(other_id, sender) is True

    assert len(sender.sent) == 2
    ttl = await redis_client.ttl(f"pikva:approval-email:school:{school_id}")
    assert 0 < ttl <= APPROVAL_EMAIL_COOLDOWN_SECONDS


async def test_failed_send_never_raises_and_allows_a_retry():
    """A provider failure returns False and does not start the cooldown."""

    school_id = await make_school("Foxtrot")
    sender = FakeSender()

    assert await notify_approval_requested(school_id, FakeSender(fail=True)) is False
    assert await notify_approval_requested(school_id, sender) is True


async def test_school_without_admins_or_unknown_school_sends_nothing():
    """With nobody to tell, nothing is sent."""

    school_id = await make_school("Golf", admins=0)
    sender = FakeSender()

    assert await notify_approval_requested(school_id, sender) is False
    assert await notify_approval_requested(999_999, sender) is False
    assert sender.sent == []


# --- When the routes ask for it ---------------------------------------------


@pytest.fixture
def notified(monkeypatch) -> list[int]:
    """Record the school ids the routes ask to notify, instead of emailing."""

    calls: list[int] = []

    async def record(school_id: int) -> bool:
        calls.append(school_id)
        return True

    monkeypatch.setattr(pickers_routes, "notify_approval_requested", record)
    return calls


@pytest.fixture
async def school(client):
    """Provide one school with an admin, a parent, gate staff and an approved authorisation."""

    return await api.create_school(client, "hotel")


def picker_url(school, action: str = "") -> str:
    return f"/api/v1/pickers/{school['authorisation_id']}{action}"


async def test_parent_create_notifies_admins(notified, client, school):
    """create_school's parent added a person: the admins are told once.

    notified comes first so it is recording before the school is set up.
    """

    assert notified == [school["school_id"]]


async def test_parent_edit_of_approved_person_notifies_admins(client, school, notified):
    """A parent's change puts the person back in the queue, so admins are told."""

    notified.clear()

    response = await client.patch(picker_url(school), headers=school["headers"]["parent"], json={"picker_phone": "0755555555"})

    assert response.json()["status"] == "pending_approval"
    assert notified == [school["school_id"]]


async def test_parent_reactivation_notifies_admins(client, school, notified):
    """A parent re-activating someone needs approval again, so admins are told."""

    parent = school["headers"]["parent"]
    await client.post(picker_url(school, "/deactivate"), headers=parent)
    notified.clear()

    response = await client.post(picker_url(school, "/activate"), headers=parent)

    assert response.json()["status"] == "pending_approval"
    assert notified == [school["school_id"]]


async def test_changes_that_need_no_approval_notify_nobody(client, school, notified):
    """Admin edits and activation, and a parent deactivating, leave admins alone."""

    admin = school["headers"]["admin"]
    notified.clear()

    await client.patch(picker_url(school), headers=admin, json={"picker_phone": "0766666666"})
    await client.post(picker_url(school, "/deactivate"), headers=school["headers"]["parent"])
    await client.post(picker_url(school, "/activate"), headers=admin)

    assert notified == []
