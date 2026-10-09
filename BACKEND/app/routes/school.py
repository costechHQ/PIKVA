from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_role
from app.db.session import get_session
from app.models.user import User, UserRole
from app.schemas.school import SchoolResponse
from app.services.school_service import get_school_by_id

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
