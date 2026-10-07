from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.core.dependencies import get_current_user
from app.models.user import User

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
