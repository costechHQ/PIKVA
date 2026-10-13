from fastapi import APIRouter

from app.routes.health import router as health_router
from app.routes.auth import router as auth_router
from app.routes.school import router as school_router

from app.routes.pupils import router as pupil_router
from app.routes.pickers import router as picker_router
from app.routes.pickup import router as pickup_router
from app.routes.releases import router as release_router
from app.routes.alerts import router as alert_router
from app.routes.audit_logs import router as audit_log_router

router = APIRouter(prefix="/api/v1")


router.include_router(health_router)
router.include_router(auth_router)
router.include_router(school_router)
router.include_router(pupil_router)
router.include_router(picker_router)
router.include_router(pickup_router)
router.include_router(release_router)
router.include_router(alert_router)
router.include_router(audit_log_router)
