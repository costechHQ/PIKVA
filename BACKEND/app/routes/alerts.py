from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_role
from app.db.session import get_session
from app.models.security_alert import SecurityAlert
from app.models.user import User, UserRole
from app.schemas.alert import AlertStatus, SecurityAlertResponse
from app.services.alert_service import get_alert, list_alerts, resolve_alert

router = APIRouter(
    prefix="/alerts",
    tags=["Security alerts"],
    dependencies=[Depends(require_role(UserRole.SCHOOL_ADMIN))],
)


def _found(alert: SecurityAlert | None) -> SecurityAlert:
    """Return the alert or raise 404 when it is not in the admin's school."""

    if alert is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Security alert not found",
        )

    return alert


@router.get("", response_model=list[SecurityAlertResponse])

async def list_alerts_endpoint(
    alert_status: AlertStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """List the school's security alerts, newest first."""

    return await list_alerts(
        session=session,
        school_id=current_user.school_id,
        status=alert_status,
        limit=limit,
        offset=offset,
    )


@router.get("/{alert_id}", response_model=SecurityAlertResponse)

async def get_alert_endpoint(
    alert_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """Retrieve one of the school's security alerts."""

    return _found(await get_alert(session, current_user.school_id, alert_id))


@router.post("/{alert_id}/resolve", response_model=SecurityAlertResponse)

async def resolve_alert_endpoint(
    alert_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """Resolve one of the school's open security alerts."""

    try:
        alert = await resolve_alert(
            session=session,
            school_id=current_user.school_id,
            alert_id=alert_id,
            actor_id=current_user.id,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    return _found(alert)
