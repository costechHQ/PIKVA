from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.schemas.auth import UserRegister, UserResponse, UserLogin, TokenResponse
from app.services.auth_service import register_school_admin, login_user

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", response_model=UserResponse)
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


@router.post("/login", response_model=TokenResponse)
async def login(
    data: UserLogin,
    session: AsyncSession = Depends(get_session)
):

    """Authenticate a user and return an access token."""

    try:
        return await login_user(session, data)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        )

    