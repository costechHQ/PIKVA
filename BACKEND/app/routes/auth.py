from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.core.dependencies import get_current_user
from app.models.school import School
from app.models.user import User
from app.schemas.auth import (
    CurrentUserResponse,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
)
from app.services.auth_service import register_school_admin, login_user

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post(
        "/register", 
        response_model=UserResponse,
        status_code=status.HTTP_201_CREATED
        )
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



@router.get("/me", response_model=CurrentUserResponse)
async def read_current_user(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """Return the signed-in user, their role and their school's name."""

    school = await session.get(School, current_user.school_id)

    return CurrentUserResponse(
        id=current_user.id,
        school_id=current_user.school_id,
        name=current_user.name,
        email=current_user.email,
        phone=current_user.phone,
        role=current_user.role.value,
        school_name=school.name,
    )
