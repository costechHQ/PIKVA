from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session

router = APIRouter()


@router.get("/health/db")
async def database_health_check(
    session: AsyncSession = Depends(get_session),
):
    """Check whether the API can reach PostgreSQL."""

    await session.execute(text("SELECT 1"))

    return {"database": "ok"}
