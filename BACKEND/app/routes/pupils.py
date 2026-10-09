import logging
from fastapi import APIRouter, Depends, HTTPException, status 
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_role
from app.db.session import get_session
from app.models.user import User, UserRole
from app.schemas.pupil import PupilCreate, PupilResponse, PupilUpdate
from app.services.pupil_service import create_pupil
from app.services.pupil_service import (
    create_pupil, 
    get_parent_pupils,
    get_parent_pupil_by_id,
    update_parent_pupil
)

router = APIRouter(prefix="/pupils", tags=["Pupils"])

@router.post(
    "",
    response_model=PupilResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(UserRole.PARENT))],
)

async def create_pupil_endpoint(
    data: PupilCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """Create a pupil for the authenticated parent."""

    try:
        return await create_pupil(
            session = session,
            school_id = current_user.school_id,
            parent_id = current_user.id,
            data = data,
        )

    except Exception as exc:
        logging.exception("Failed to create pupil")
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create pupil",
        ) from exc

@router.get(
    "",
    response_model=list[PupilResponse],
    dependencies=[Depends(require_role(UserRole.PARENT))],
)

async def list_parent_pupils(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """List pupils belonging to ther authenticated parent."""

    return await get_parent_pupils(
        session = session,
        school_id = current_user.school_id,
        parent_id = current_user.id,
    )


@router.get(
    "/{pupil_id}",
    response_model=PupilResponse,
    dependencies=[Depends(require_role(UserRole.PARENT))],
)

async def get_parent_pupil(
    pupil_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """Retrieve one pupil belonging to ther authenticated parent."""

    pupil = await get_parent_pupil_by_id(
        session = session,
        school_id = current_user.school_id,
        parent_id = current_user.id,
        pupil_id = pupil_id,  
    )

    if pupil is None:
        raise HTTPException(
            status_code = status.HTTP_404_NOT_FOUND,
            detail= "Pupil nont found",
        )

    return pupil


@router.patch(
    "/{pupil_id}",
    response_model = PupilResponse,
    dependencies = [Depends(require_role(UserRole.PARENT))],
)

async def update_parent_endpoint(
    pupil_id: int,
    data: PupilUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """Update details of a pupil owned by the authenticated pparent."""

    try:
        pupil = await update_parent_pupil(
            session = session,
            school_id = current_user.school_id,
            parent_id = current_user.id,
            pupil_id = pupil_id,
            data = data,
        )
    except Exception as exc:
        await session.rollbacl()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to update pupil",
        ) from exc

    if pupil is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail = "Pupil not found",
        )

    return pupil