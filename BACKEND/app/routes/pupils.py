import logging
from fastapi import APIRouter, Depends, HTTPException, status 
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_role
from app.db.session import get_session
from app.models.user import User, UserRole
from app.schemas.pupil import PupilCreate, PupilResponse
from app.services.pupil_service import create_pupil
from app.services.pupil_service import create_pupil, get_parent_pupils

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