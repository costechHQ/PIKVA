from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.audit_log import AuditActor, AuditLogResponse

# Audit actions (SRS 14).
USER_CREATED = "user.created"
PUPIL_CREATED = "pupil.created"
PUPIL_UPDATED = "pupil.updated"
AUTHORISATION_CREATED = "pickup_authorisation.created"
AUTHORISATION_UPDATED = "pickup_authorisation.updated"
AUTHORISATION_ACTIVATED = "pickup_authorisation.activated"
AUTHORISATION_DEACTIVATED = "pickup_authorisation.deactivated"
PICKUP_CODE_GENERATED = "pickup_code.generated"
PUPIL_RELEASED = "pupil.released"
PICKUP_VERIFICATION_FAILED = "pickup.verification_failed"
ALERT_RESOLVED = "alert.resolved"
PASSWORD_RESET_REQUESTED = "user.password_reset_requested"
PASSWORD_RESET = "user.password_reset"

# Metadata keys that could carry secrets; audit records must never hold them
# (SRS 14, 28).
FORBIDDEN_METADATA_KEYS = frozenset(
    {
        "access_token",
        "code",
        "password",
        "password_hash",
        "qr_data",
        "secret_key",
        "token",
    }
)


def _find_forbidden_key(metadata: Any) -> str | None:
    """Return the first secret-looking key anywhere in the metadata."""

    if isinstance(metadata, dict):
        for key, value in metadata.items():
            if str(key).lower() in FORBIDDEN_METADATA_KEYS:
                return str(key)

            found = _find_forbidden_key(value)
            if found is not None:
                return found

    elif isinstance(metadata, (list, tuple)):
        for item in metadata:
            found = _find_forbidden_key(item)
            if found is not None:
                return found

    return None


async def record_audit(
        session: AsyncSession,
        school_id: int,
        user_id: int | None,
        action: str,
        entity_type: str,
        entity_id: int | None = None,
        metadata: dict[str, Any] | None = None,
) -> AuditLog:
    """Add an audit record to the current transaction. Does not commit.

    Raises ValueError if the metadata contains a key that could hold a
    secret, so plaintext codes, passwords and tokens are never audited.
    """

    forbidden = _find_forbidden_key(metadata)

    if forbidden is not None:
        raise ValueError(f"Audit metadata must not include {forbidden!r}")

    audit = AuditLog(
        school_id=school_id,
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        metadata_=metadata,
    )
    session.add(audit)
    await session.flush()

    return audit


async def list_audit_logs(
        session: AsyncSession,
        school_id: int,
        action: str | None = None,
        entity_type: str | None = None,
        entity_id: int | None = None,
        limit: int = 50,
        offset: int = 0,
) -> list[AuditLogResponse]:
    """List a school's audit records, newest first, with optional filters."""

    query = (
        select(AuditLog, User)
        .outerjoin(User, AuditLog.user_id == User.id)
        .where(AuditLog.school_id == school_id)
    )

    if action is not None:
        query = query.where(AuditLog.action == action)

    if entity_type is not None:
        query = query.where(AuditLog.entity_type == entity_type)

    if entity_id is not None:
        query = query.where(AuditLog.entity_id == entity_id)

    rows = await session.execute(
        query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(limit)
        .offset(offset)
    )

    return [
        AuditLogResponse(
            id=audit.id,
            user=AuditActor.model_validate(user) if user is not None else None,
            action=audit.action,
            entity_type=audit.entity_type,
            entity_id=audit.entity_id,
            metadata=audit.metadata_,
            created_at=audit.created_at,
        )
        for audit, user in rows
    ]
