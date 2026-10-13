from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_role
from app.db.session import get_session
from app.models.user import User, UserRole
from app.schemas.pickup import (
    PickupCodeRequest,
    PickupCodeResponse,
    PickupVerifyRequest,
    PickupVerifyResponse,
)
from app.schemas.release import PickupReleaseResponse
from app.services.alert_service import notify_security_alerts
from app.services.pickup_service import AlertNotifier, issue_pickup_code, verify_pickup
from app.services.release_service import release_pupil

router = APIRouter(prefix="/pickup", tags=["Pickup"])


def _email_admins_later(background_tasks: BackgroundTasks) -> AlertNotifier:
    """Email school admins about new alerts after the response is sent (SRS 20)."""

    def notify(school_id: int, alert_ids: list[int]) -> None:
        background_tasks.add_task(notify_security_alerts, school_id, alert_ids)

    return notify


@router.post(
    "/codes",
    response_model=PickupCodeResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(UserRole.PARENT))],
)

async def issue_pickup_code_endpoint(
    data: PickupCodeRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """Issue today's pickup code for the authenticated parent's authorisation."""

    try:
        issued = await issue_pickup_code(
            session=session,
            school_id=current_user.school_id,
            parent_id=current_user.id,
            authorisation_id=data.authorisation_id,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    if issued is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pickup authorisation not found",
        )

    return issued


@router.post(
    "/verify",
    response_model=PickupVerifyResponse,
    dependencies=[Depends(require_role(UserRole.GATE_STAFF))],
)

async def verify_pickup_endpoint(
    data: PickupVerifyRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """Verify a pickup code at the gate of the staff member's school.

    Always returns 200 with the outcome; verified is false for any failure.
    """

    return await verify_pickup(
        session=session,
        school_id=current_user.school_id,
        staff_id=current_user.id,
        data=data,
        notify=_email_admins_later(background_tasks),
    )


@router.post(
    "/release",
    response_model=PickupReleaseResponse,
    status_code=status.HTTP_200_OK,
    responses={
        status.HTTP_201_CREATED: {
            "model": PickupReleaseResponse,
            "description": "Pupil released and release record created",
        },
    },
    dependencies=[Depends(require_role(UserRole.GATE_STAFF))],
)

async def release_pupil_endpoint(
    data: PickupVerifyRequest,
    response: Response,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """Release a pupil after gate staff confirm the pickup person.

    Returns 201 when the pupil is released and a release record is created,
    or 200 with released false when any check fails.
    """

    result = await release_pupil(
        session=session,
        school_id=current_user.school_id,
        staff_id=current_user.id,
        data=data,
        notify=_email_admins_later(background_tasks),
    )

    if result.released:
        response.status_code = status.HTTP_201_CREATED

    return result
