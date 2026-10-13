"""Service tests for security alerts: recording, listing and resolving (SRS 11.3, 13, 23.7)."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.db.session import async_session
from app.models.audit_log import AuditLog
from app.models.pickup_code import PickupCodeCheckResult
from app.models.school import School
from app.models.security_alert import SecurityAlert
from app.models.user import User, UserRole
from app.schemas.alert import AlertStatus
from app.services.alert_service import (
    REPEATED_FAILED_ATTEMPTS,
    REPEATED_FAILURE_LIMIT,
    REPEATED_FAILURE_WINDOW,
    get_alert,
    list_alerts,
    notify_security_alerts,
    record_failed_verification,
    resolve_alert,
)


@pytest.fixture
async def session():
    """Provide a database session on the test database."""

    async with async_session() as session:
        yield session


async def make_staff(session, name: str) -> User:
    """Create a school with one gate staff member."""

    school = School(name=f"{name} School", address="1 Test Road")
    session.add(school)
    await session.flush()

    staff = User(
        school_id=school.id,
        name=f"{name} Gate",
        email=f"gate-{name.lower()}@example.com",
        phone="0700000000",
        password_hash="not-used",
        role=UserRole.GATE_STAFF,
    )
    session.add(staff)
    await session.commit()

    return staff


async def fail(session, staff: User, result=PickupCodeCheckResult.INVALID_CODE):
    """Record one failed verification and commit it."""

    alerts = await record_failed_verification(
        session=session,
        school_id=staff.school_id,
        staff_id=staff.id,
        result=result,
        method="manual",
    )
    await session.commit()

    return alerts


async def alert_types(session, staff: User) -> list[str]:
    """Return the staff member's alert types, oldest first."""

    result = await session.scalars(
        select(SecurityAlert.alert_type)
        .where(SecurityAlert.attempted_by == staff.id)
        .order_by(SecurityAlert.id)
    )

    return list(result.all())


async def test_failure_creates_one_typed_alert(session):
    """A failure is recorded against the school, staff, pupil and authorisation."""

    staff = await make_staff(session, "Alpha")

    [alert] = await record_failed_verification(
        session=session,
        school_id=staff.school_id,
        staff_id=staff.id,
        result=PickupCodeCheckResult.USED_CODE,
        method="qr",
    )
    await session.commit()

    assert alert.id is not None
    assert alert.school_id == staff.school_id
    assert alert.attempted_by == staff.id
    assert alert.alert_type == "used_code"
    assert alert.message == "Pickup code has already been used (qr verification)"
    assert alert.resolved_at is None


async def test_valid_result_is_not_recorded_as_failure(session):
    """Recording a valid result as a failure is a programming error."""

    staff = await make_staff(session, "Bravo")

    with pytest.raises(ValueError):
        await fail(session, staff, PickupCodeCheckResult.VALID)


async def test_repeated_failures_raise_one_extra_alert(session):
    """The limit-th failure in the window adds exactly one repeated-attempts alert."""

    staff = await make_staff(session, "Charlie")

    for _ in range(REPEATED_FAILURE_LIMIT - 1):
        assert len(await fail(session, staff)) == 1

    assert [a.alert_type for a in await fail(session, staff)] == [
        "invalid_code",
        REPEATED_FAILED_ATTEMPTS,
    ]
    assert len(await fail(session, staff)) == 1

    types = await alert_types(session, staff)
    assert types.count(REPEATED_FAILED_ATTEMPTS) == 1
    assert len(types) == REPEATED_FAILURE_LIMIT + 2


async def test_failures_outside_window_do_not_count(session):
    """Old failures are ignored by the repeated-attempts rule."""

    staff = await make_staff(session, "Delta")
    old = datetime.now(timezone.utc) - REPEATED_FAILURE_WINDOW - timedelta(minutes=1)

    for _ in range(REPEATED_FAILURE_LIMIT):
        session.add(
            SecurityAlert(
                school_id=staff.school_id,
                attempted_by=staff.id,
                alert_type="invalid_code",
                message="old failure",
                created_at=old,
            )
        )
    await session.commit()

    assert len(await fail(session, staff)) == 1


async def test_other_staff_failures_do_not_count(session):
    """Each staff member's failures are counted separately."""

    first = await make_staff(session, "Echo")
    second = await make_staff(session, "Foxtrot")

    for _ in range(REPEATED_FAILURE_LIMIT - 1):
        await fail(session, first)

    assert len(await fail(session, second)) == 1


# --- Alert management (SRS 13, 18.7, 23.7) ---


async def test_list_alerts_newest_first_with_status_filter(session):
    """Alerts list newest first and filter by open or resolved."""

    staff = await make_staff(session, "Golf")
    await fail(session, staff, PickupCodeCheckResult.INVALID_CODE)
    await fail(session, staff, PickupCodeCheckResult.USED_CODE)
    newest, oldest = await list_alerts(session, staff.school_id)

    await resolve_alert(session, staff.school_id, oldest.id, actor_id=staff.id)

    assert (newest.alert_type, oldest.alert_type) == ("used_code", "invalid_code")
    assert [a.id for a in await list_alerts(session, staff.school_id, AlertStatus.OPEN)] == [newest.id]
    assert [a.id for a in await list_alerts(session, staff.school_id, AlertStatus.RESOLVED)] == [oldest.id]
    assert [a.id for a in await list_alerts(session, staff.school_id, limit=1, offset=1)] == [oldest.id]


async def test_alerts_are_limited_to_the_school(session):
    """Another school's admin cannot list, view or resolve these alerts."""

    staff = await make_staff(session, "Hotel")
    other = await make_staff(session, "India")
    [alert] = await fail(session, staff)

    assert await list_alerts(session, other.school_id) == []
    assert await get_alert(session, other.school_id, alert.id) is None
    assert await resolve_alert(session, other.school_id, alert.id, actor_id=other.id) is None
    assert (await get_alert(session, staff.school_id, alert.id)).resolved_at is None


async def test_resolve_alert_sets_time_and_audits_resolver(session):
    """Resolving records when, and the audit log records who."""

    staff = await make_staff(session, "Juliet")
    [alert] = await fail(session, staff)

    resolved = await resolve_alert(session, staff.school_id, alert.id, actor_id=staff.id)

    assert resolved.resolved_at is not None
    [audit] = (
        await session.scalars(select(AuditLog).where(AuditLog.action == "alert.resolved"))
    ).all()
    assert audit.user_id == staff.id
    assert (audit.entity_type, audit.entity_id) == ("security_alert", alert.id)
    assert audit.metadata_ == {"alert_type": "invalid_code"}


async def test_resolving_twice_is_rejected(session):
    """An alert can only be resolved once."""

    staff = await make_staff(session, "Kilo")
    [alert] = await fail(session, staff)
    await resolve_alert(session, staff.school_id, alert.id, actor_id=staff.id)

    with pytest.raises(ValueError, match="already resolved"):
        await resolve_alert(session, staff.school_id, alert.id, actor_id=staff.id)


# --- Security alert emails to admins (SRS 3.1, 20) ---


class FakeSender:
    """Capture emails instead of sending them."""

    def __init__(self, fail: bool = False):
        self.sent = []
        self.fail = fail

    async def send(self, message):
        if self.fail:
            raise RuntimeError("provider down")
        self.sent.append(message)


async def make_admin(session, school_id: int, name: str) -> User:
    """Create a school admin."""

    admin = User(
        school_id=school_id,
        name=f"{name} Admin",
        email=f"admin-{name.lower()}@example.com",
        phone="0700000000",
        password_hash="not-used",
        role=UserRole.SCHOOL_ADMIN,
    )
    session.add(admin)
    await session.commit()

    return admin


async def test_alert_email_goes_to_school_admins_only(session):
    """Admins of the alert's school are emailed; gate staff and other schools are not."""

    staff = await make_staff(session, "Lima")
    await make_admin(session, staff.school_id, "Lima1")
    await make_admin(session, staff.school_id, "Lima2")
    other = await make_staff(session, "Mike")
    await make_admin(session, other.school_id, "Mike")
    [alert] = await fail(session, staff, PickupCodeCheckResult.USED_CODE)
    sender = FakeSender()

    assert await notify_security_alerts(staff.school_id, [alert.id], sender) is True

    [message] = sender.sent
    assert message.to == ("admin-lima1@example.com", "admin-lima2@example.com")
    assert message.subject == "Pikva security alert: used_code"
    assert "Lima School" in message.text
    assert "Pickup code has already been used (manual verification)" in message.text
    assert f"Alert #{alert.id}" in message.text
    assert f"Staff #{staff.id}" in message.text
    assert " UTC: " in message.text


async def test_failure_and_repeated_alert_arrive_in_one_email(session):
    """The fifth failure's two alerts are sent together."""

    staff = await make_staff(session, "November")
    await make_admin(session, staff.school_id, "November")
    for _ in range(REPEATED_FAILURE_LIMIT - 1):
        await fail(session, staff)
    alerts = await fail(session, staff)
    sender = FakeSender()

    await notify_security_alerts(staff.school_id, [a.id for a in alerts], sender)

    [message] = sender.sent
    assert message.subject == "Pikva security alerts: invalid_code, repeated_failed_attempts"
    assert "2 security alert(s)" in message.text


async def test_other_school_alert_ids_send_nothing(session):
    """Alert IDs from another school are ignored."""

    staff = await make_staff(session, "Oscar")
    other = await make_staff(session, "Papa")
    await make_admin(session, other.school_id, "Papa")
    [alert] = await fail(session, staff)
    sender = FakeSender()

    assert await notify_security_alerts(other.school_id, [alert.id], sender) is False
    assert sender.sent == []


async def test_school_without_admin_email_sends_nothing(session):
    """With no admins to tell, nothing is sent."""

    staff = await make_staff(session, "Quebec")
    [alert] = await fail(session, staff)
    sender = FakeSender()

    assert await notify_security_alerts(staff.school_id, [alert.id], sender) is False
    assert sender.sent == []


async def test_provider_failure_never_raises(session):
    """A failing email provider returns False instead of raising."""

    staff = await make_staff(session, "Romeo")
    await make_admin(session, staff.school_id, "Romeo")
    [alert] = await fail(session, staff)

    assert await notify_security_alerts(staff.school_id, [alert.id], FakeSender(fail=True)) is False
