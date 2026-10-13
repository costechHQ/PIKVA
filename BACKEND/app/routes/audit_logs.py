from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_role
from app.db.session import get_session
from app.models.user import User, UserRole
from app.schemas.audit_log import AuditLogResponse
from app.services.audit_service import list_audit_logs

router = APIRouter(
    prefix="/audit-logs",
    tags=["Audit log"],
    dependencies=[Depends(require_role(UserRole.SCHOOL_ADMIN))],
)


@router.get("", response_model=list[AuditLogResponse])

async def list_audit_logs_endpoint(
    action: str | None = Query(default=None, max_length=100),
    entity_type: str | None = Query(default=None, max_length=100),
    entity_id: int | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """List the school's audit records, newest first."""

    return await list_audit_logs(
        session=session,
        school_id=current_user.school_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        limit=limit,
        offset=offset,
    )
