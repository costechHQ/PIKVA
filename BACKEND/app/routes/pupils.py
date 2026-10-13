from fastapi import APIRouter, Depends, HTTPException, status 
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_role
from app.db.session import get_session
from app.models.user import User, UserRole
from app.schemas.pupil import PupilCreate, PupilResponse, PupilUpdate
from app.services.pupil_service import (
    create_pupil,
    get_pupil,
    list_pupils,
    update_pupil,
)

router = APIRouter(prefix="/pupils", tags=["Pupils"])

MANAGER_ROLES = (UserRole.PARENT, UserRole.SCHOOL_ADMIN)


def _parent_scope(current_user: User) -> int | None:
    """Limit parents to their own pupils; admins see their whole school."""

    return current_user.id if current_user.role == UserRole.PARENT else None

@router.post(
    "",
    response_model=PupilResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(*MANAGER_ROLES))],
)

async def create_pupil_endpoint(
    data: PupilCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """Create a pupil: parents for themselves, admins for a parent in their school."""

    try:
        return await create_pupil(
            session = session,
            school_id = current_user.school_id,
            parent_id = _parent_scope(current_user),
            data = data,
            actor_id = current_user.id,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

@router.get(
    "",
    response_model=list[PupilResponse],
    dependencies=[Depends(require_role(*MANAGER_ROLES))],
)

async def list_pupils_endpoint(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """List pupils the user may view: a parent's own, or an admin's whole school."""

    return await list_pupils(
        session = session,
        school_id = current_user.school_id,
        parent_id = _parent_scope(current_user),
    )


@router.get(
    "/{pupil_id}",
    response_model=PupilResponse,
    dependencies=[Depends(require_role(*MANAGER_ROLES))],
)

async def get_pupil_endpoint(
    pupil_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """Retrieve one pupil the authenticated user may view."""

    pupil = await get_pupil(
        session = session,
        school_id = current_user.school_id,
        parent_id = _parent_scope(current_user),
        pupil_id = pupil_id,
    )

    if pupil is None:
        raise HTTPException(
            status_code = status.HTTP_404_NOT_FOUND,
            detail= "Pupil not found",
        )

    return pupil


@router.patch(
    "/{pupil_id}",
    response_model = PupilResponse,
    dependencies = [Depends(require_role(*MANAGER_ROLES))],
)

async def update_pupil_endpoint(
    pupil_id: int,
    data: PupilUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """Update a pupil: parents their own, admins any pupil in their school."""

    pupil = await update_pupil(
        session = session,
        school_id = current_user.school_id,
        parent_id = _parent_scope(current_user),
        pupil_id = pupil_id,
        data = data,
        actor_id = current_user.id,
    )

    if pupil is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail = "Pupil not found",
        )

    return pupil