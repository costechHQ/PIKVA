from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.core.dependencies import get_current_user
from app.models.user import User

from app.core.dependencies import require_role
from app.models.user import UserRole

router = APIRouter()


@router.get("/health/db")
async def database_health_check(
    session: AsyncSession = Depends(get_session),
):
    """Check whether the API can reach PostgreSQL."""

    await session.execute(text("SELECT 1"))

    return {"database": "ok"}


@router.get("/health/auth")
async def authentication_health_check(
    current_user: User = Depends(get_current_user),
):
    """Verify that JWT authentication is working."""

    return {
        "authenticated": True,
        "user_id": current_user.id,
    }


@router.get(
    "/health/admin",
    dependencies=[Depends(require_role(UserRole.SCHOOL_ADMIN))],
)
async def admin_health_check():
    """Verify that school-admin authorization is working."""

    return {"authorized": True, "role": "school_admin"}
