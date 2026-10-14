from fastapi import APIRouter, Depends, HTTPException, Request, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.redis import get_redis
from app.db.session import get_session
from app.core import rate_limit
from app.core.constants import (
    LOGIN_FAILURE_LIMIT,
    LOGIN_IP_LIMIT,
    LOGIN_WINDOW_SECONDS,
    REGISTER_IP_LIMIT,
    REGISTER_WINDOW_SECONDS,
)
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


def _client_ip(request: Request) -> str:
    """Return the caller's IP address for rate limiting."""

    return request.client.host if request.client else "unknown"


@router.post(
        "/register", 
        response_model=UserResponse,
        status_code=status.HTTP_201_CREATED
        )
async def register(
    data: UserRegister,
    request: Request,
    session: AsyncSession = Depends(get_session),
    redis: Redis = Depends(get_redis),
):

    """Register a school and its first admin user.

    Rate limited per IP, every attempt counted, to stop mass sign-ups and
    probing for registered emails (SRS 11.3).
    """

    await rate_limit.hit(
        redis,
        f"pikva:rl:register:ip:{_client_ip(request)}",
        REGISTER_IP_LIMIT,
        REGISTER_WINDOW_SECONDS,
    )

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
    request: Request,
    session: AsyncSession = Depends(get_session),
    redis: Redis = Depends(get_redis),
):

    """Authenticate a user and return an access token.

    Rate limited (SRS 11.3): every attempt counts against the client IP, and
    an email is locked for the window once it has too many failed attempts.
    """

    ip = _client_ip(request)
    email_key = f"pikva:rl:login:email:{rate_limit.hashed(data.email)}"

    await rate_limit.hit(
        redis, f"pikva:rl:login:ip:{ip}", LOGIN_IP_LIMIT, LOGIN_WINDOW_SECONDS
    )
    await rate_limit.check(redis, email_key, LOGIN_FAILURE_LIMIT)

    try:
        return await login_user(session, data)
    except ValueError as exc:
        await rate_limit.record(redis, email_key, LOGIN_WINDOW_SECONDS)
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
