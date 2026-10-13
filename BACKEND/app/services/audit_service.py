from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog

# Audit actions (SRS 14). Phase 9 adds the remaining actions.
PUPIL_RELEASED = "pupil.released"

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
