from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_role
from app.db.session import get_session
from app.models.user import User, UserRole
from app.schemas.school import SchoolResponse
from app.services.school_service import (
    create_school_user,
    get_school_by_id,
    list_school_users,
)
from app.services.notification_service import send_email_safely

from app.schemas.auth import SchoolUserCreate, UserResponse

router = APIRouter(prefix="/schools", tags=["Schools"])

@router.get(
    "/me",
    response_model=SchoolResponse,
    dependencies=[Depends(require_role(UserRole.SCHOOL_ADMIN))],
)

async def get_my_school(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """Return the authenticated admin's school profile"""

    school = await get_school_by_id(session, current_user.school_id)

    if school is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="School not found",
        )
    return school


@router.post(
    "/users",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(UserRole.SCHOOL_ADMIN))],
)

async def create_user(
    data: SchoolUserCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """Create a parent or gate staff user in the admin's school (SRS 6.7).

    The new user is emailed a link to set their own password; the email is
    sent after the response.
    """

    try:
        created = await create_school_user(
            session,
            current_user.school_id,
            data,
            actor_id=current_user.id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )

    background_tasks.add_task(send_email_safely, created.setup_email)

    return created.user


@router.get(
    "/users",
    response_model=list[UserResponse],
    dependencies=[Depends(require_role(UserRole.SCHOOL_ADMIN))],
)

async def list_users(
    role: UserRole | None = None,
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """List users in the admin's school, optionally filtered by role."""

    return await list_school_users(
        session=session,
        school_id=current_user.school_id,
        role=role,
        limit=limit,
        offset=offset,
    )
