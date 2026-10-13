from fastapi import APIRouter, Depends, HTTPException, status
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
from app.services.pickup_service import issue_pickup_code, verify_pickup

router = APIRouter(prefix="/pickup", tags=["Pickup"])


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
    )
