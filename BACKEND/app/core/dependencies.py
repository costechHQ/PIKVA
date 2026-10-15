import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import get_session
from app.models.user import User, UserRole

bearer_scheme = HTTPBearer()

async def get_current_user(
        credentials = Depends(bearer_scheme),
        session: AsyncSession = Depends(get_session),
):

    """Return the authentication user from a valid JWT."""

    token = credentials.credentials

    try:
        payload = decode_access_token(token)
        
    except jwt.PyJWTError:
        raise HTTPException(
            status_code = status.HTTP_401_UNAUTHORIZED,
            detail = "Invalid or expired token",
        )
    
    try:
        user_id = int(payload.get("sub"))

    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )

    result = await session.execute(
        select(User).where(User.id == user_id)
    )

    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    if issued_before_password_change(payload, user):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    # A deactivated account's sessions stop working at once (SRS 6.7).
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    return user


def issued_before_password_change(payload: dict, user: User) -> bool:
    """Return whether the token predates the user's last password reset.

    iat is whole seconds, so the change time is compared in whole seconds
    too; otherwise a login made just after a reset could be rejected. A
    token without iat (issued before iat existed) counts as older.
    """

    if user.password_changed_at is None:
        return False

    issued_at = payload.get("iat")

    if not isinstance(issued_at, int):
        return True

    return issued_at < int(user.password_changed_at.timestamp())


def require_role(*allowed_roles: UserRole):
    """Restrict an endpoint to users with approved roles."""

    async def role_checker(
            current_user: User = Depends(get_current_user),
    ):

        """Verify that the current user has an allowed role."""

        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return current_user
    return role_checker
