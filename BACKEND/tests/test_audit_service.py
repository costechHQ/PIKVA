"""Service tests for the audit trail (SRS 14, Rule 9)."""

import pytest
from sqlalchemy import func, select

from app.db.session import async_session
from app.models.audit_log import AuditLog
from app.models.school import School
from app.models.user import User, UserRole
from app.services.audit_service import PUPIL_RELEASED, record_audit


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
