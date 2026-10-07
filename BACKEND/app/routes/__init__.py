from fastapi import APIRouter

router = APIRouter(prefix="/api/v1")

from app.routes.health import router as health_router

router.include_router(health_router)
