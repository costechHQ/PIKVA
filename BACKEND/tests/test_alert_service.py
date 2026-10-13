"""Service tests for security alerts on failed verification (SRS 11.3, 13, 23.7)."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.db.session import async_session
from app.models.pickup_code import PickupCodeCheckResult
from app.models.school import School
from app.models.security_alert import SecurityAlert
from app.models.user import User, UserRole
from app.services.alert_service import (
    REPEATED_FAILED_ATTEMPTS,
    REPEATED_FAILURE_LIMIT,
    REPEATED_FAILURE_WINDOW,
    record_failed_verification,
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
