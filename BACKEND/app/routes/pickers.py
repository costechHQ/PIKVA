from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_role
from app.db.session import get_session
from app.models.user import User, UserRole
from app.schemas.pickup_authorisation import (
    PickupAuthorisationCreate,
    PickupAuthorisationResponse,
)
from app.services.pickup_authorisation_service import (
    create_pickup_authorisation,
)

router = APIRouter(prefix="/pickers", tags=["Pickup authorisations"])


@router.post(
    "",
    response_model=PickupAuthorisationResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(UserRole.PARENT))],
)

async def create_pickup_authorisation_endpoint(
    data: PickupAuthorisationCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """"Create a pickup authorisation for the authenticated parent's pupil."""

    try:
        authorisation = await create_pickup_authorisation(
            session=session,
            school_id=current_user.school_id,
            parent_id=current_user.id,
            data=data,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pupil not found"
        )

    return authorisation