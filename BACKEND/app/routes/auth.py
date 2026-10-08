from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.schemas.auth import UserRegister
from app.services.auth_service import register_school_admin

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register")
async def register(
    data: UserRegister,
    session: AsyncSession = Depends(get_session),
):

    """Register a school and its first admin user."""

    try:
        return await register_school_admin(session, data)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc)
        )