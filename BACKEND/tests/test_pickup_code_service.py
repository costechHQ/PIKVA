"""Service tests for issuing, checking and verifying pickup codes (SRS 10, 11, 23.5)."""

from datetime import date, datetime, time, timedelta, timezone

import pytest
from sqlalchemy import select

from app.core.security import hash_pickup_code
from app.db.session import async_session
from app.models.pickup_authorisation import PickupAuthorisation
from app.models.pickup_code import DailyPickupCode
from app.models.pupil import Pupil
from app.models.school import School
from app.models.security_alert import SecurityAlert
from app.models.user import User, UserRole
from app.schemas.pickup import PickupVerifyRequest
from app.services import pickup_service
from app.services.pickup_service import (
    PickupCodeCheckResult,
    check_pickup_code,
    issue_pickup_code,
    mark_code_used,
    verify_pickup,
)


@pytest.fixture
async def session():
    """Provide a database session on the test database."""

    async with async_session() as session:
        yield session


async def make_family(session, name: str, **authorisation_fields) -> PickupAuthorisation:
    """Create a school, parent, pupil and pickup authorisation."""

    now = datetime.now(timezone.utc)
    school = School(name=f"{name} School", address="1 Test Road")
    session.add(school)
    await session.flush()

    parent = User(
        school_id=school.id,
        name=f"{name} Parent",
        email=f"{name.lower()}@example.com",
        phone="0700000000",
        password_hash="not-used",
        role=UserRole.PARENT,
    )
    session.add(parent)
    await session.flush()

    pupil = Pupil(
        school_id=school.id,
        parent_id=parent.id,
        first_name=name,
        last_name="Pupil",
        date_of_birth=date(2018, 1, 1),
    )
    session.add(pupil)
    await session.flush()

    fields = {
        "starts_at": now - timedelta(days=1),
        "expires_at": now + timedelta(days=30),
        "is_active": True,
    } | authorisation_fields

    authorisation = PickupAuthorisation(
        pupil_id=pupil.id,
        picker_name="Aunt Ada",
        picker_phone="0711111111",
        relationship="aunt",
        type="regular",
        **fields,
    )
    session.add(authorisation)
    await session.commit()

    return authorisation


async def issue_for(session, authorisation: PickupAuthorisation, parent_id=None):
    """Issue a code as the authorisation's own parent unless told otherwise."""

    pupil = await session.get(Pupil, authorisation.pupil_id)

    return await issue_pickup_code(
        session=session,
        school_id=pupil.school_id,
        parent_id=parent_id if parent_id is not None else pupil.parent_id,
        authorisation_id=authorisation.id,
    )


async def stored_codes(session, authorisation_id: int) -> list[DailyPickupCode]:
    """Return the stored codes for an authorisation, oldest first."""

    result = await session.scalars(
        select(DailyPickupCode)
        .where(DailyPickupCode.authorisation_id == authorisation_id)
        .order_by(DailyPickupCode.id)
        .execution_options(populate_existing=True)
    )

    return list(result.all())


async def test_issue_returns_code_and_stores_only_hash(session):
    """A code is returned once in plaintext; only its HMAC hash is stored."""

    authorisation = await make_family(session, "Alpha")

    issued = await issue_for(session, authorisation)

    [stored] = await stored_codes(session, authorisation.id)
    assert issued.pupil_id == authorisation.pupil_id
    assert stored.pupil_id == authorisation.pupil_id
    assert stored.code_hash == hash_pickup_code(issued.code)
    assert issued.code not in stored.code_hash
    assert stored.used_at is None


async def test_code_valid_for_today_until_next_utc_midnight(session):
    """Codes are dated today (UTC) and expire at the next UTC midnight."""

    authorisation = await make_family(session, "Bravo")

    issued = await issue_for(session, authorisation)

    today = datetime.now(timezone.utc).date()
    next_midnight = datetime.combine(today + timedelta(days=1), time.min, tzinfo=timezone.utc)
    assert issued.code_date == today
    assert issued.expires_at == next_midnight


async def test_code_expiry_capped_by_authorisation_expiry(session):
    """A code never outlives the authorisation it belongs to."""

    soon = datetime.now(timezone.utc) + timedelta(minutes=5)
    authorisation = await make_family(session, "Charlie", expires_at=soon)

    issued = await issue_for(session, authorisation)

    [stored] = await stored_codes(session, authorisation.id)
    assert issued.expires_at == stored.expires_at == soon


async def test_reissue_expires_previous_unused_code(session):
    """Requesting again today invalidates the earlier unused code."""

    authorisation = await make_family(session, "Delta")

    first = await issue_for(session, authorisation)
    second = await issue_for(session, authorisation)

    old, new = await stored_codes(session, authorisation.id)
    now = datetime.now(timezone.utc)
    assert first.code != second.code
    assert old.expires_at <= now
    assert new.expires_at > now


@pytest.mark.parametrize(
    ("fields", "status"),
    [
        ({"is_active": False}, "inactive"),
        ({"starts_at": datetime.now(timezone.utc) + timedelta(days=1)}, "scheduled"),
        (
            {
                "starts_at": datetime.now(timezone.utc) - timedelta(days=2),
                "expires_at": datetime.now(timezone.utc) - timedelta(days=1),
            },
            "expired",
        ),
    ],
)
async def test_non_active_authorisation_is_rejected(session, fields, status):
    """Only an active authorisation can receive a code."""

    authorisation = await make_family(session, f"Echo{status}", **fields)

    with pytest.raises(ValueError, match=status):
        await issue_for(session, authorisation)

    assert await stored_codes(session, authorisation.id) == []


async def test_other_parent_cannot_issue_code(session):
    """A parent cannot request a code for another family's authorisation."""

    own = await make_family(session, "Foxtrot")
    other = await make_family(session, "Golf")
    other_pupil = await session.get(Pupil, other.pupil_id)

    issued = await issue_for(session, own, parent_id=other_pupil.parent_id)

    assert issued is None
    assert await stored_codes(session, own.id) == []


async def test_hash_collision_retries_with_new_code(session, monkeypatch):
    """A colliding hash is retried without losing the transaction."""

    authorisation = await make_family(session, "Hotel")
    taken = await issue_for(session, authorisation)

    codes = iter([taken.code, "BBBBBBBB"])
    monkeypatch.setattr(pickup_service, "generate_pickup_code", lambda: next(codes))

    issued = await issue_for(session, authorisation)

    old, new = await stored_codes(session, authorisation.id)
    assert issued.code == "BBBBBBBB"
    assert new.code_hash == hash_pickup_code("BBBBBBBB")
    assert old.expires_at <= datetime.now(timezone.utc)


async def school_of(session, authorisation: PickupAuthorisation) -> int:
    """Return the school ID that owns an authorisation."""

    pupil = await session.get(Pupil, authorisation.pupil_id)

    return pupil.school_id


async def test_check_valid_code_accepts_lowercase_and_spaces(session):
    """A freshly issued code is valid, however the gate types it."""

    authorisation = await make_family(session, "India")
    issued = await issue_for(session, authorisation)
    typed = f" {issued.code[:4].lower()} {issued.code[4:].lower()} "

    check = await check_pickup_code(session, await school_of(session, authorisation), typed)

    assert check.result == PickupCodeCheckResult.VALID
    assert check.authorisation.id == authorisation.id
    assert check.code.pupil_id == authorisation.pupil_id


async def test_check_valid_code_for_expected_pupil_and_authorisation(session):
    """A code matching the expected pupil and authorisation is valid."""

    authorisation = await make_family(session, "Juliet")
    issued = await issue_for(session, authorisation)

    check = await check_pickup_code(
        session,
        await school_of(session, authorisation),
        issued.code,
        pupil_id=authorisation.pupil_id,
        authorisation_id=authorisation.id,
    )

    assert check.result == PickupCodeCheckResult.VALID


async def test_check_unknown_code_is_invalid(session):
    """A code that was never issued is invalid."""

    authorisation = await make_family(session, "Kilo")
    await issue_for(session, authorisation)

    check = await check_pickup_code(session, await school_of(session, authorisation), "ZZZZ9999")

    assert check.result == PickupCodeCheckResult.INVALID_CODE
    assert check.code is None


async def test_check_code_from_other_school_is_invalid(session):
    """Another school's code looks exactly like an unknown code."""

    own = await make_family(session, "Lima")
    other = await make_family(session, "Mike")
    issued = await issue_for(session, own)

    check = await check_pickup_code(session, await school_of(session, other), issued.code)

    assert check.result == PickupCodeCheckResult.INVALID_CODE
    assert check.code is None


async def test_check_code_for_wrong_pupil(session):
    """A code presented for a different pupil is rejected."""

    authorisation = await make_family(session, "November")
    issued = await issue_for(session, authorisation)

    check = await check_pickup_code(
        session,
        await school_of(session, authorisation),
        issued.code,
        pupil_id=authorisation.pupil_id + 1000,
    )

    assert check.result == PickupCodeCheckResult.WRONG_PUPIL


async def test_check_code_for_wrong_authorisation(session):
    """A code presented for a different authorisation is rejected."""

    authorisation = await make_family(session, "Oscar")
    issued = await issue_for(session, authorisation)

    check = await check_pickup_code(
        session,
        await school_of(session, authorisation),
        issued.code,
        authorisation_id=authorisation.id + 1000,
    )

    assert check.result == PickupCodeCheckResult.WRONG_AUTHORISATION


async def test_check_used_code_is_rejected(session):
    """A code cannot be reused after it has been marked used."""

    authorisation = await make_family(session, "Papa")
    issued = await issue_for(session, authorisation)
    school_id = await school_of(session, authorisation)
    first = await check_pickup_code(session, school_id, issued.code)

    assert await mark_code_used(session, school_id, first.code.id)
    await session.commit()

    check = await check_pickup_code(session, school_id, issued.code)

    assert check.result == PickupCodeCheckResult.USED_CODE


async def test_check_replaced_code_is_expired(session):
    """A code replaced by a newer one the same day is expired."""

    authorisation = await make_family(session, "Quebec")
    first = await issue_for(session, authorisation)
    await issue_for(session, authorisation)

    check = await check_pickup_code(session, await school_of(session, authorisation), first.code)

    assert check.result == PickupCodeCheckResult.EXPIRED_CODE


@pytest.mark.parametrize(
    ("changes", "result"),
    [
        ({"is_active": False}, PickupCodeCheckResult.AUTHORISATION_INACTIVE),
        (
            {"starts_at": datetime.now(timezone.utc) + timedelta(hours=1)},
            PickupCodeCheckResult.AUTHORISATION_SCHEDULED,
        ),
        (
            {"expires_at": datetime.now(timezone.utc) - timedelta(minutes=1)},
            PickupCodeCheckResult.AUTHORISATION_EXPIRED,
        ),
    ],
)
async def test_check_code_after_authorisation_stops_being_active(session, changes, result):
    """A valid code is rejected once its authorisation is no longer active."""

    authorisation = await make_family(session, f"Romeo{result.value}")
    issued = await issue_for(session, authorisation)

    for field, value in changes.items():
        setattr(authorisation, field, value)
    await session.commit()

    check = await check_pickup_code(session, await school_of(session, authorisation), issued.code)

    assert check.result == result


async def test_mark_code_used_succeeds_only_once(session):
    """Only the first attempt to mark a code used succeeds."""

    authorisation = await make_family(session, "Sierra")
    await issue_for(session, authorisation)
    school_id = await school_of(session, authorisation)
    [code] = await stored_codes(session, authorisation.id)

    assert await mark_code_used(session, school_id, code.id) is True
    assert await mark_code_used(session, school_id, code.id) is False
    await session.commit()

    [code] = await stored_codes(session, authorisation.id)
    assert code.used_at is not None


async def test_mark_code_used_rejects_expired_code(session):
    """An expired code cannot be marked used."""

    authorisation = await make_family(session, "Tango")
    await issue_for(session, authorisation)
    await issue_for(session, authorisation)
    [replaced, _] = await stored_codes(session, authorisation.id)

    assert await mark_code_used(session, await school_of(session, authorisation), replaced.id) is False


async def test_mark_code_used_rejects_other_school(session):
    """Staff cannot mark another school's code as used."""

    own = await make_family(session, "Uniform")
    other = await make_family(session, "Victor")
    await issue_for(session, own)
    [code] = await stored_codes(session, own.id)

    assert await mark_code_used(session, await school_of(session, other), code.id) is False


async def make_gate_staff(session, school_id: int, name: str) -> User:
    """Create a gate staff member in a school."""

    staff = User(
        school_id=school_id,
        name=f"{name} Gate",
        email=f"gate-{name.lower()}@example.com",
        phone="0700000000",
        password_hash="not-used",
        role=UserRole.GATE_STAFF,
    )
    session.add(staff)
    await session.commit()

    return staff


async def alerts_for(session, staff: User) -> list[SecurityAlert]:
    """Return the alerts caused by a staff member, oldest first."""

    result = await session.scalars(
        select(SecurityAlert)
        .where(SecurityAlert.attempted_by == staff.id)
        .order_by(SecurityAlert.id)
    )

    return list(result.all())


async def test_verify_valid_manual_code_shows_minimal_details(session):
    """A valid code returns pupil and picker details and changes nothing."""

    authorisation = await make_family(session, "Whiskey")
    issued = await issue_for(session, authorisation)
    staff = await make_gate_staff(session, await school_of(session, authorisation), "Whiskey")

    response = await verify_pickup(
        session, staff.school_id, staff.id,
        PickupVerifyRequest(method="manual", code=issued.code),
    )

    assert response.verified is True
    assert response.pupil.id == authorisation.pupil_id
    assert response.pupil.first_name == "Whiskey"
    assert response.authorisation.picker_name == "Aunt Ada"
    assert response.code_expires_at == issued.expires_at
    assert await alerts_for(session, staff) == []
    [code] = await stored_codes(session, authorisation.id)
    assert code.used_at is None


async def test_verify_valid_qr_code(session):
    """The QR payload issued to the parent verifies at the gate."""

    authorisation = await make_family(session, "Xray")
    issued = await issue_for(session, authorisation)
    staff = await make_gate_staff(session, await school_of(session, authorisation), "Xray")

    response = await verify_pickup(
        session, staff.school_id, staff.id,
        PickupVerifyRequest(method="qr", qr_data=issued.qr_data),
    )

    assert response.result == PickupCodeCheckResult.VALID
    assert response.method == "qr"


async def test_verify_malformed_qr_is_invalid_and_alerted(session):
    """Unreadable QR data fails as invalid_code and raises an alert."""

    authorisation = await make_family(session, "Yankee")
    staff = await make_gate_staff(session, await school_of(session, authorisation), "Yankee")

    response = await verify_pickup(
        session, staff.school_id, staff.id,
        PickupVerifyRequest(method="qr", qr_data="not a pikva code"),
    )

    assert response.result == PickupCodeCheckResult.INVALID_CODE
    assert response.verified is False
    [alert] = await alerts_for(session, staff)
    assert alert.alert_type == "invalid_code"
    assert alert.pupil_id is None and alert.authorisation_id is None


async def test_verify_used_code_alerts_with_code_records(session):
    """A reused code fails without details; the alert links pupil and authorisation."""

    authorisation = await make_family(session, "Zulu")
    issued = await issue_for(session, authorisation)
    school_id = await school_of(session, authorisation)
    staff = await make_gate_staff(session, school_id, "Zulu")
    [code] = await stored_codes(session, authorisation.id)
    await mark_code_used(session, school_id, code.id)
    await session.commit()

    response = await verify_pickup(
        session, school_id, staff.id,
        PickupVerifyRequest(method="manual", code=issued.code),
    )

    assert response.result == PickupCodeCheckResult.USED_CODE
    assert response.pupil is None and response.authorisation is None
    [alert] = await alerts_for(session, staff)
    assert alert.alert_type == "used_code"
    assert alert.pupil_id == authorisation.pupil_id
    assert alert.authorisation_id == authorisation.id


async def test_verify_wrong_pupil_alerts_against_code_pupil(session):
    """A code presented for another pupil links the alert to the code's pupil."""

    authorisation = await make_family(session, "Amber")
    issued = await issue_for(session, authorisation)
    staff = await make_gate_staff(session, await school_of(session, authorisation), "Amber")

    response = await verify_pickup(
        session, staff.school_id, staff.id,
        PickupVerifyRequest(method="manual", code=issued.code, pupil_id=999999),
    )

    assert response.result == PickupCodeCheckResult.WRONG_PUPIL
    [alert] = await alerts_for(session, staff)
    assert alert.pupil_id == authorisation.pupil_id


async def test_verify_other_school_code_is_invalid(session):
    """Another school's gate cannot verify the code or learn who it belongs to."""

    authorisation = await make_family(session, "Bronze")
    issued = await issue_for(session, authorisation)
    other = await make_family(session, "Copper")
    staff = await make_gate_staff(session, await school_of(session, other), "Copper")

    response = await verify_pickup(
        session, staff.school_id, staff.id,
        PickupVerifyRequest(method="manual", code=issued.code),
    )

    assert response.result == PickupCodeCheckResult.INVALID_CODE
    [alert] = await alerts_for(session, staff)
    assert alert.school_id == staff.school_id
    assert alert.pupil_id is None
