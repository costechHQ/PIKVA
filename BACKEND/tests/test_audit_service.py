"""Service tests for writing and reading the audit trail (SRS 5.1, 14, Rule 9)."""

import pytest
from sqlalchemy import func, select

from app.db.session import async_session
from app.models.audit_log import AuditLog
from app.models.school import School
from app.models.user import User, UserRole
from app.services.audit_service import PUPIL_RELEASED, list_audit_logs, record_audit


@pytest.fixture
async def session():
    """Provide a database session on the test database."""

    async with async_session() as session:
        yield session


async def make_staff(session) -> User:
    """Create a school with one gate staff member."""

    school = School(name="Audit School", address="1 Test Road")
    session.add(school)
    await session.flush()

    staff = User(
        school_id=school.id,
        name="Audit Gate",
        email="gate-audit@example.com",
        phone="0700000000",
        password_hash="not-used",
        role=UserRole.GATE_STAFF,
    )
    session.add(staff)
    await session.commit()

    return staff


async def audit_count(session) -> int:
    """Return the number of stored audit records."""

    return await session.scalar(select(func.count()).select_from(AuditLog))


async def test_record_audit_stores_all_fields(session):
    """An audit record keeps school, actor, action, entity, metadata and time."""

    staff = await make_staff(session)

    audit = await record_audit(
        session,
        school_id=staff.school_id,
        user_id=staff.id,
        action=PUPIL_RELEASED,
        entity_type="release_record",
        entity_id=42,
        metadata={"pupil_id": 7, "method": "qr"},
    )
    await session.commit()

    stored = await session.get(AuditLog, audit.id, populate_existing=True)
    assert stored.school_id == staff.school_id
    assert stored.user_id == staff.id
    assert stored.action == "pupil.released"
    assert stored.entity_type == "release_record"
    assert stored.entity_id == 42
    assert stored.metadata_ == {"pupil_id": 7, "method": "qr"}
    assert stored.created_at is not None


@pytest.mark.parametrize(
    "metadata",
    [
        {"code": "ABCD2345"},
        {"Password": "secret"},
        {"request": {"qr_data": "{}"}},
        {"attempts": [{"token": "x"}]},
    ],
)
async def test_record_audit_rejects_secret_metadata(session, metadata):
    """Secret-looking keys are refused at any depth and nothing is stored."""

    staff = await make_staff(session)

    with pytest.raises(ValueError):
        await record_audit(
            session,
            school_id=staff.school_id,
            user_id=staff.id,
            action=PUPIL_RELEASED,
            entity_type="release_record",
            metadata=metadata,
        )

    assert await audit_count(session) == 0


async def test_record_audit_does_not_commit(session):
    """The caller owns the transaction; a rollback discards the audit record."""

    staff = await make_staff(session)

    await record_audit(
        session,
        school_id=staff.school_id,
        user_id=staff.id,
        action=PUPIL_RELEASED,
        entity_type="release_record",
    )
    await session.rollback()

    assert await audit_count(session) == 0


# --- Reading the audit log (SRS 5.1, 14) ---


async def add_audits(session, staff: User) -> None:
    """Add three staff audit records and one without an actor."""

    for action, entity_type, entity_id in [
        ("pupil.created", "pupil", 1),
        ("pupil.updated", "pupil", 1),
        ("pupil.released", "release_record", 9),
    ]:
        await record_audit(
            session, staff.school_id, staff.id, action, entity_type, entity_id,
            metadata={"note": action},
        )
    await record_audit(session, staff.school_id, None, "system.check", "school")
    await session.commit()


async def test_list_audit_logs_newest_first_with_actor(session):
    """Records list newest first, naming the actor without private details."""

    staff = await make_staff(session)
    await add_audits(session, staff)

    logs = await list_audit_logs(session, staff.school_id)

    assert [log.action for log in logs] == [
        "system.check", "pupil.released", "pupil.updated", "pupil.created",
    ]
    assert logs[0].user is None
    assert logs[1].user.model_dump() == {"id": staff.id, "name": "Audit Gate"}
    assert logs[1].metadata == {"note": "pupil.released"}


async def test_list_audit_logs_filters_and_paging(session):
    """Filters narrow by action and entity; paging walks the list."""

    staff = await make_staff(session)
    await add_audits(session, staff)

    by_action = await list_audit_logs(session, staff.school_id, action="pupil.updated")
    by_entity = await list_audit_logs(session, staff.school_id, entity_type="pupil", entity_id=1)
    page = await list_audit_logs(session, staff.school_id, limit=1, offset=1)

    assert [log.action for log in by_action] == ["pupil.updated"]
    assert [log.action for log in by_entity] == ["pupil.updated", "pupil.created"]
    assert [log.action for log in page] == ["pupil.released"]


async def test_list_audit_logs_is_limited_to_the_school(session):
    """Another school's admin sees none of these records."""

    staff = await make_staff(session)
    await add_audits(session, staff)
    other = School(name="Other School", address="2 Test Road")
    session.add(other)
    await session.commit()

    assert await list_audit_logs(session, other.id) == []
