from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import AwareDatetime
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_role
from app.db.session import get_session
from app.models.user import User, UserRole
from app.schemas.release import ReleaseHistoryItem
from app.services.release_service import list_release_history

router = APIRouter(prefix="/releases", tags=["Releases"])

HISTORY_ROLES = (UserRole.PARENT, UserRole.SCHOOL_ADMIN)


def _parent_scope(current_user: User) -> int | None:
    """Limit parents to their own pupils; admins see their whole school."""

    return current_user.id if current_user.role == UserRole.PARENT else None


@router.get(
    "",
    response_model=list[ReleaseHistoryItem],
    dependencies=[Depends(require_role(*HISTORY_ROLES))],
)

async def list_releases_endpoint(
    pupil_id: int | None = None,
    since: AwareDatetime | None = Query(default=None, description="Released at or after (with a time zone)"),
    until: AwareDatetime | None = Query(default=None, description="Released before (with a time zone)"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """List release history the authenticated user may view, newest first.

    since and until narrow it to a time range (SRS 18.8).
    """

    if since is not None and until is not None and until <= since:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="until must be after since",
        )

    return await list_release_history(
        session=session,
        school_id=current_user.school_id,
        parent_id=_parent_scope(current_user),
        pupil_id=pupil_id,
        since=since,
        until=until,
        limit=limit,
        offset=offset,
    )
