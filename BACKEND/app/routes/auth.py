import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.redis import get_redis
from app.db.session import get_session
from app.core import rate_limit
from app.core.constants import (
    LOGIN_FAILURE_LIMIT,
    LOGIN_IP_LIMIT,
    LOGIN_WINDOW_SECONDS,
    PASSWORD_RESET_CONFIRM_IP_LIMIT,
    PASSWORD_RESET_CONFIRM_WINDOW_SECONDS,
    PASSWORD_RESET_EMAIL_LIMIT,
    PASSWORD_RESET_IP_LIMIT,
    PASSWORD_RESET_WINDOW_SECONDS,
    REGISTER_IP_LIMIT,
    REGISTER_WINDOW_SECONDS,
)
from app.core.dependencies import get_current_user
from app.models.school import School
from app.models.user import User
from app.schemas.auth import (
    CurrentUserResponse,
    MessageResponse,
    PasswordResetConfirm,
    PasswordResetEmail,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
)
from app.services.auth_service import register_school_admin, login_user
from app.services.notification_service import send_email_safely
from app.services.password_reset_service import (
    password_reset_email,
    request_password_reset,
    reset_password,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

logger = logging.getLogger(__name__)


def _client_ip(request: Request) -> str:
    """Return the caller's IP address for rate limiting."""

    return request.client.host if request.client else "unknown"


@router.post(
        "/register", 
        response_model=UserResponse,
        status_code=status.HTTP_201_CREATED,
        responses=rate_limit.RATE_LIMITED_RESPONSE,
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


@router.post(
    "/login",
    response_model=TokenResponse,
    responses=rate_limit.RATE_LIMITED_RESPONSE,
)
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
        # The IP only: never the email or password (SRS 28).
        logger.info("Login failed from %s", ip)
        await rate_limit.record(redis, email_key, LOGIN_WINDOW_SECONDS)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        )



PASSWORD_RESET_SENT = (
    "If an account exists for that email, we have sent a link to reset its password."
)


@router.post(
    "/password-reset/request",
    response_model=MessageResponse,
    status_code=status.HTTP_202_ACCEPTED,
    responses=rate_limit.RATE_LIMITED_RESPONSE,
)
async def request_reset(
    data: PasswordResetEmail,
    request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    redis: Redis = Depends(get_redis),
):

    """Email a password reset link if the account exists (SRS 6.6).

    Always the same 202 answer, so the endpoint never reveals which emails
    are registered; the email is sent after the response. Every request
    counts against the client IP and against the email.
    """

    await rate_limit.hit(
        redis,
        f"pikva:rl:reset:ip:{_client_ip(request)}",
        PASSWORD_RESET_IP_LIMIT,
        PASSWORD_RESET_WINDOW_SECONDS,
    )
    await rate_limit.hit(
        redis,
        f"pikva:rl:reset:email:{rate_limit.hashed(data.email)}",
        PASSWORD_RESET_EMAIL_LIMIT,
        PASSWORD_RESET_WINDOW_SECONDS,
    )

    reset = await request_password_reset(session, data.email)

    if reset is not None:
        background_tasks.add_task(send_email_safely, password_reset_email(reset))

    return MessageResponse(detail=PASSWORD_RESET_SENT)


@router.post(
    "/password-reset/confirm",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        400: {"description": "The reset link is invalid, used or expired"},
        **rate_limit.RATE_LIMITED_RESPONSE,
    },
)
async def confirm_reset(
    data: PasswordResetConfirm,
    request: Request,
    session: AsyncSession = Depends(get_session),
    redis: Redis = Depends(get_redis),
):

    """Set a new password with an emailed reset token (SRS 6.6).

    Signs the user out of every older session. Rate limited per client IP.
    """

    ip = _client_ip(request)

    await rate_limit.hit(
        redis,
        f"pikva:rl:reset-confirm:ip:{ip}",
        PASSWORD_RESET_CONFIRM_IP_LIMIT,
        PASSWORD_RESET_CONFIRM_WINDOW_SECONDS,
    )

    if not await reset_password(session, data.token, data.new_password):
        # The IP only: never the token (SRS 28).
        logger.info("Password reset failed from %s", ip)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link is invalid or has expired",
        )

    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
