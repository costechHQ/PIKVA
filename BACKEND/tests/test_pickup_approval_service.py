"""Service tests for school approval of pickup authorisations (SRS 9.2, 23.4)."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

import test_pickup_code_service as codes
from app.db.session import async_session
from app.models.audit_log import AuditLog
from app.models.pickup_authorisation import AuthorisationStatus, PickupAuthorisation
from app.models.pickup_code import PickupCodeCheckResult
from app.models.pupil import Pupil
from app.models.user import User, UserRole
from app.schemas.pickup_authorisation import PickupAuthorisationCreate, PickupAuthorisationUpdate
from app.services import alert_service, pickup_service
from app.services.pickup_authorisation_service import (
    approve_pickup_authorisation,
    create_pickup_authorisation,
    set_pickup_authorisation_active,
    update_pickup_authorisation,
)
from app.services.pickup_service import check_pickup_code


@pytest.fixture
async def session():
    """Provide a database session on the test database."""

    async with async_session() as session:
        yield session


async def school_of(session, authorisation: PickupAuthorisation) -> tuple[int, int]:
    """Return the (school_id, parent_id) that own an authorisation."""

    pupil = await session.get(Pupil, authorisation.pupil_id)
    return pupil.school_id, pupil.parent_id


async def add_admin(session, school_id: int) -> User:
    """Add a school admin to a school."""

    admin = User(
        school_id=school_id,
        name="Admin Ama",
        email=f"admin{school_id}@example.com",
        phone="0700000001",
        password_hash="not-used",
        role=UserRole.SCHOOL_ADMIN,
    )
    session.add(admin)
    await session.commit()
    return admin


async def reload(session, authorisation_id: int) -> PickupAuthorisation:
    """Read an authorisation fresh from the database."""

    return await session.scalar(
        select(PickupAuthorisation)
        .where(PickupAuthorisation.id == authorisation_id)
        .execution_options(populate_existing=True)
    )


async def audit_actions(session, authorisation_id: int) -> list[tuple[str, int, dict]]:
    """Return (action, user_id, metadata) of an authorisation's audit entries, oldest first."""

    result = await session.scalars(
        select(AuditLog)
        .where(AuditLog.entity_type == "pickup_authorisation", AuditLog.entity_id == authorisation_id)
        .order_by(AuditLog.id)
    )
    return [(entry.action, entry.user_id, entry.metadata_) for entry in result.all()]


# --- Status ----------------------------------------------------------------


def test_every_status_except_active_fails_at_the_gate():
    """An unlisted status would be treated as valid, so all must be mapped."""

    assert set(pickup_service._AUTHORISATION_FAILURES) == set(AuthorisationStatus) - {AuthorisationStatus.ACTIVE}


def test_every_failure_has_an_alert_message():
    """Every failed check result can be recorded as an alert."""

    assert set(alert_service._FAILURE_MESSAGES) == set(PickupCodeCheckResult) - {PickupCodeCheckResult.VALID}


def test_status_order():
    """inactive, then pending_approval, then scheduled/expired, else active."""

    now = datetime.now(timezone.utc)

    def status(**fields) -> AuthorisationStatus:
        values = {
            "is_active": True,
            "approved_at": now,
            "starts_at": now - timedelta(days=1),
            "expires_at": now + timedelta(days=1),
        } | fields
        return PickupAuthorisation(**values).status_at(now)

    assert status() == AuthorisationStatus.ACTIVE
    assert status(approved_at=None) == AuthorisationStatus.PENDING_APPROVAL
    assert status(approved_at=None, is_active=False) == AuthorisationStatus.INACTIVE
    assert status(approved_at=None, starts_at=now + timedelta(hours=1)) == AuthorisationStatus.PENDING_APPROVAL
    assert status(approved_at=None, expires_at=now - timedelta(hours=1)) == AuthorisationStatus.PENDING_APPROVAL
    assert status(starts_at=now + timedelta(hours=1)) == AuthorisationStatus.SCHEDULED


# --- Parent changes --------------------------------------------------------


async def test_parent_created_authorisation_is_pending(session):
    """A pickup person a parent adds waits for the school's approval."""

    existing = await codes.make_family(session, "Alpha")
    school_id, parent_id = await school_of(session, existing)
    now = datetime.now(timezone.utc)

    created = await create_pickup_authorisation(
        session=session,
        school_id=school_id,
        parent_id=parent_id,
        data=PickupAuthorisationCreate(
            pupil_id=existing.pupil_id,
            picker_name="Uncle Obi",
            picker_phone="0733333333",
            relationship="uncle",
            type="regular",
            starts_at=now - timedelta(hours=1),
            expires_at=now + timedelta(days=7),
        ),
    )

    assert created.approved_at is None
    assert created.status == AuthorisationStatus.PENDING_APPROVAL


async def test_pending_authorisation_cannot_get_a_code(session):
    """No pickup code is issued until the school approves."""

    authorisation = await codes.make_family(session, "Bravo", approved_at=None)

    with pytest.raises(ValueError, match="pending_approval"):
        await codes.issue_for(session, authorisation)


async def test_parent_edit_needs_approval_again_and_blocks_issued_code(session):
    """Changing an approved person's details makes them pending; an earlier code fails at the gate."""

    authorisation = await codes.make_family(session, "Charlie")
    school_id, parent_id = await school_of(session, authorisation)
    issued = await codes.issue_for(session, authorisation)

    await update_pickup_authorisation(
        session=session,
        school_id=school_id,
        parent_id=parent_id,
        authorisation_id=authorisation.id,
        data=PickupAuthorisationUpdate(picker_name="Someone Else"),
        actor_id=parent_id,
    )

    assert (await reload(session, authorisation.id)).status == AuthorisationStatus.PENDING_APPROVAL
    check = await check_pickup_code(session, school_id, issued.code)
    assert check.result == PickupCodeCheckResult.AUTHORISATION_PENDING
    [*_, (action, _, metadata)] = await audit_actions(session, authorisation.id)
    assert action == "pickup_authorisation.updated"
    assert metadata["approval_reset"] is True


async def test_admin_edit_and_empty_parent_edit_keep_approval(session):
    """Staff changes, and a parent PATCH that changes nothing, keep the approval."""

    authorisation = await codes.make_family(session, "Delta")
    school_id, parent_id = await school_of(session, authorisation)
    admin = await add_admin(session, school_id)

    await update_pickup_authorisation(
        session=session, school_id=school_id, parent_id=None, authorisation_id=authorisation.id,
        data=PickupAuthorisationUpdate(picker_phone="0744444444"), actor_id=admin.id,
    )
    await update_pickup_authorisation(
        session=session, school_id=school_id, parent_id=parent_id, authorisation_id=authorisation.id,
        data=PickupAuthorisationUpdate(), actor_id=parent_id,
    )

    assert (await reload(session, authorisation.id)).status == AuthorisationStatus.ACTIVE


async def test_parent_reactivation_needs_approval_again(session):
    """A parent cannot undo an admin's deactivation without a new approval."""

    authorisation = await codes.make_family(session, "Echo", is_active=False)
    school_id, parent_id = await school_of(session, authorisation)

    await set_pickup_authorisation_active(
        session=session, school_id=school_id, parent_id=parent_id,
        authorisation_id=authorisation.id, is_active=True, actor_id=parent_id,
    )

    assert (await reload(session, authorisation.id)).status == AuthorisationStatus.PENDING_APPROVAL


async def test_deactivation_and_admin_activation_keep_approval(session):
    """Only a parent's activation clears the approval."""

    authorisation = await codes.make_family(session, "Foxtrot")
    school_id, parent_id = await school_of(session, authorisation)
    admin = await add_admin(session, school_id)

    # Parent activating an already active person changes nothing.
    await set_pickup_authorisation_active(
        session=session, school_id=school_id, parent_id=parent_id,
        authorisation_id=authorisation.id, is_active=True, actor_id=parent_id,
    )
    await set_pickup_authorisation_active(
        session=session, school_id=school_id, parent_id=parent_id,
        authorisation_id=authorisation.id, is_active=False, actor_id=parent_id,
    )
    await set_pickup_authorisation_active(
        session=session, school_id=school_id, parent_id=None,
        authorisation_id=authorisation.id, is_active=True, actor_id=admin.id,
    )

    assert (await reload(session, authorisation.id)).status == AuthorisationStatus.ACTIVE


# --- Approval --------------------------------------------------------------


async def test_admin_approves_pending_authorisation(session):
    """Approval makes the person able to collect and is audited with the admin as actor."""

    authorisation = await codes.make_family(session, "Golf", approved_at=None)
    school_id, _ = await school_of(session, authorisation)
    admin = await add_admin(session, school_id)

    approved = await approve_pickup_authorisation(
        session=session, school_id=school_id, authorisation_id=authorisation.id,
        seen_updated_at=authorisation.updated_at, actor_id=admin.id,
    )

    assert approved.approved_at is not None
    assert approved.status == AuthorisationStatus.ACTIVE
    assert await codes.issue_for(session, approved)
    assert ("pickup_authorisation.approved", admin.id, {"pupil_id": authorisation.pupil_id}) in await audit_actions(
        session, authorisation.id
    )


async def test_approving_twice_is_refused(session):
    """An approved authorisation cannot be approved again."""

    authorisation = await codes.make_family(session, "Hotel")
    school_id, _ = await school_of(session, authorisation)
    admin = await add_admin(session, school_id)

    with pytest.raises(ValueError, match="already approved"):
        await approve_pickup_authorisation(
            session=session, school_id=school_id, authorisation_id=authorisation.id,
            seen_updated_at=authorisation.updated_at, actor_id=admin.id,
        )


async def test_change_after_admin_looked_is_not_approved(session):
    """If the parent changed the person after the admin looked, nothing is approved."""

    authorisation = await codes.make_family(session, "India", approved_at=None)
    school_id, parent_id = await school_of(session, authorisation)
    admin = await add_admin(session, school_id)
    seen = authorisation.updated_at

    await update_pickup_authorisation(
        session=session, school_id=school_id, parent_id=parent_id, authorisation_id=authorisation.id,
        data=PickupAuthorisationUpdate(picker_name="Stranger"), actor_id=parent_id,
    )

    with pytest.raises(ValueError, match="changed"):
        await approve_pickup_authorisation(
            session=session, school_id=school_id, authorisation_id=authorisation.id,
            seen_updated_at=seen, actor_id=admin.id,
        )

    assert (await reload(session, authorisation.id)).status == AuthorisationStatus.PENDING_APPROVAL


async def test_admin_cannot_approve_another_schools_authorisation(session):
    """Approval is limited to the admin's own school."""

    authorisation = await codes.make_family(session, "Juliet", approved_at=None)
    other = await codes.make_family(session, "Kilo")
    other_school_id, _ = await school_of(session, other)
    admin = await add_admin(session, other_school_id)

    result = await approve_pickup_authorisation(
        session=session, school_id=other_school_id, authorisation_id=authorisation.id,
        seen_updated_at=authorisation.updated_at, actor_id=admin.id,
    )

    assert result is None
    assert (await reload(session, authorisation.id)).approved_at is None

