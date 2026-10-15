from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_role
from app.db.session import get_session
from app.models.pickup_authorisation import AuthorisationStatus, PickupAuthorisation
from app.models.user import User, UserRole
from app.schemas.pickup_authorisation import (
    PickupAuthorisationApprove,
    PickupAuthorisationCreate,
    PickupAuthorisationResponse,
    PickupAuthorisationUpdate,
)
from app.services.approval_notification_service import notify_approval_requested
from app.services.pickup_authorisation_service import (
    approve_pickup_authorisation,
    create_pickup_authorisation,
    get_pickup_authorisation,
    list_pickup_authorisations,
    set_pickup_authorisation_active,
    update_pickup_authorisation,
)

router = APIRouter(prefix="/pickers", tags=["Pickup authorisations"])

MANAGER_ROLES = (UserRole.PARENT, UserRole.SCHOOL_ADMIN)


def _parent_scope(current_user: User) -> int | None:
    """Limit parents to their own pupils; admins see their whole school."""

    return current_user.id if current_user.role == UserRole.PARENT else None


def _found(authorisation: PickupAuthorisation | None) -> PickupAuthorisation:
    """Return the authorisation or raise 404 when it is not accessible."""

    if authorisation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pickup authorisation not found",
        )

    return authorisation


def _tell_admins_if_pending(
    background_tasks: BackgroundTasks,
    current_user: User,
    authorisation: PickupAuthorisation | None,
) -> None:
    """Email the school's admins after the response when a parent's change awaits approval (SRS 9.2)."""

    if (
        authorisation is not None
        and current_user.role == UserRole.PARENT
        and authorisation.status == AuthorisationStatus.PENDING_APPROVAL
    ):
        background_tasks.add_task(notify_approval_requested, current_user.school_id)


@router.post(
    "",
    response_model=PickupAuthorisationResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(UserRole.PARENT))],
)

async def create_pickup_authorisation_endpoint(
    data: PickupAuthorisationCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """Create a pickup authorisation for the authenticated parent's pupil."""

    try:
        authorisation = await create_pickup_authorisation(
            session=session,
            school_id=current_user.school_id,
            parent_id=current_user.id,
            data=data,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    if authorisation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pupil not found",
        )

    _tell_admins_if_pending(background_tasks, current_user, authorisation)

    return authorisation


@router.get(
    "",
    response_model=list[PickupAuthorisationResponse],
    dependencies=[Depends(require_role(*MANAGER_ROLES))],
)

async def list_pickup_authorisations_endpoint(
    pupil_id: int | None = None,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """List pickup authorisations the authenticated user may manage."""

    return await list_pickup_authorisations(
        session=session,
        school_id=current_user.school_id,
        parent_id=_parent_scope(current_user),
        pupil_id=pupil_id,
    )


@router.get(
    "/{authorisation_id}",
    response_model=PickupAuthorisationResponse,
    dependencies=[Depends(require_role(*MANAGER_ROLES))],
)

async def get_pickup_authorisation_endpoint(
    authorisation_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """Retrieve one pickup authorisation the authenticated user may manage."""

    return _found(
        await get_pickup_authorisation(
            session=session,
            school_id=current_user.school_id,
            parent_id=_parent_scope(current_user),
            authorisation_id=authorisation_id,
        )
    )


@router.patch(
    "/{authorisation_id}",
    response_model=PickupAuthorisationResponse,
    dependencies=[Depends(require_role(*MANAGER_ROLES))],
)

async def update_pickup_authorisation_endpoint(
    authorisation_id: int,
    data: PickupAuthorisationUpdate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """Update the details or validity period of a pickup authorisation."""

    try:
        authorisation = await update_pickup_authorisation(
            session=session,
            school_id=current_user.school_id,
            parent_id=_parent_scope(current_user),
            authorisation_id=authorisation_id,
            data=data,
            actor_id=current_user.id,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    _tell_admins_if_pending(background_tasks, current_user, authorisation)

    return _found(authorisation)


@router.post(
    "/{authorisation_id}/activate",
    response_model=PickupAuthorisationResponse,
    dependencies=[Depends(require_role(*MANAGER_ROLES))],
)

async def activate_pickup_authorisation_endpoint(
    authorisation_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """Activate a pickup authorisation."""

    authorisation = await set_pickup_authorisation_active(
        session=session,
        school_id=current_user.school_id,
        parent_id=_parent_scope(current_user),
        authorisation_id=authorisation_id,
        is_active=True,
        actor_id=current_user.id,
    )

    _tell_admins_if_pending(background_tasks, current_user, authorisation)

    return _found(authorisation)


@router.post(
    "/{authorisation_id}/deactivate",
    response_model=PickupAuthorisationResponse,
    dependencies=[Depends(require_role(*MANAGER_ROLES))],
)

async def deactivate_pickup_authorisation_endpoint(
    authorisation_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """Deactivate a pickup authorisation so it can no longer release a pupil."""

    return _found(
        await set_pickup_authorisation_active(
            session=session,
            school_id=current_user.school_id,
            parent_id=_parent_scope(current_user),
            authorisation_id=authorisation_id,
            is_active=False,
            actor_id=current_user.id,
        )
    )


@router.post(
    "/{authorisation_id}/approve",
    response_model=PickupAuthorisationResponse,
    dependencies=[Depends(require_role(UserRole.SCHOOL_ADMIN))],
)

async def approve_pickup_authorisation_endpoint(
    authorisation_id: int,
    data: PickupAuthorisationApprove,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """Approve a parent-added pickup person so they can collect the pupil (SRS 9.2).

    Send the authorisation's updated_at as shown to the admin; 409 if it is
    already approved or the parent has changed it since.
    """

    try:
        authorisation = await approve_pickup_authorisation(
            session=session,
            school_id=current_user.school_id,
            authorisation_id=authorisation_id,
            seen_updated_at=data.updated_at,
            actor_id=current_user.id,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    return _found(authorisation)
