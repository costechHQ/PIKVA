import asyncio

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.datastructures import UploadFile

from app.core import rate_limit
from app.core.constants import PHOTO_CHANGE_LIMIT, PHOTO_CHANGE_WINDOW_SECONDS
from app.core.dependencies import get_current_user, require_role
from app.db.redis import get_redis
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
from app.services.photo_service import (
    PHOTO_CONTENT_TYPE,
    PHOTO_MAX_BYTES,
    InvalidPhoto,
    PhotoStorage,
    PhotoTooLarge,
    get_photo_storage,
    process_photo,
)
from app.services.pickup_authorisation_service import (
    approve_pickup_authorisation,
    create_pickup_authorisation,
    get_pickup_authorisation,
    get_pickup_authorisation_photo,
    list_pickup_authorisations,
    set_pickup_authorisation_active,
    set_pickup_authorisation_photo,
    update_pickup_authorisation,
)

router = APIRouter(prefix="/pickers", tags=["Pickup authorisations"])

MANAGER_ROLES = (UserRole.PARENT, UserRole.SCHOOL_ADMIN)
PHOTO_VIEWER_ROLES = (UserRole.PARENT, UserRole.SCHOOL_ADMIN, UserRole.GATE_STAFF)

# Room for the multipart boundary and headers around the photo itself.
MULTIPART_OVERHEAD_BYTES = 64 * 1024

PHOTO_TOO_LARGE = "The photo must be 5 MB or smaller"
PHOTO_NOT_ACCEPTED = "The photo must be a JPEG, PNG or WebP image"

PHOTO_UPLOAD_BODY = {
    "requestBody": {
        "required": True,
        "content": {
            "multipart/form-data": {
                "schema": {
                    "type": "object",
                    "required": ["photo"],
                    "properties": {"photo": {"type": "string", "format": "binary"}},
                },
            },
        },
    },
}

PHOTO_CHANGE_RESPONSES = {
    **rate_limit.RATE_LIMITED_RESPONSE,
    413: {"description": PHOTO_TOO_LARGE},
}


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


async def limit_photo_changes(
    current_user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> None:
    """Cap photo uploads and removals per user (SRS 9.3)."""

    await rate_limit.hit(
        redis,
        f"pikva:rl:photos:user:{current_user.id}",
        PHOTO_CHANGE_LIMIT,
        PHOTO_CHANGE_WINDOW_SECONDS,
    )


async def _read_photo_upload(request: Request) -> bytes:
    """Return the uploaded photo's bytes, refusing oversized bodies unread.

    The declared size is checked before anything is read, so a huge upload
    is never stored, even temporarily.
    """

    declared = request.headers.get("content-length", "")

    if not declared.isdigit():
        raise HTTPException(
            status_code=status.HTTP_411_LENGTH_REQUIRED,
            detail="Content-Length is required",
        )

    if int(declared) > PHOTO_MAX_BYTES + MULTIPART_OVERHEAD_BYTES:
        raise HTTPException(status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail=PHOTO_TOO_LARGE)

    async with request.form(max_files=1, max_fields=0) as form:
        upload = form.get("photo")

        if not isinstance(upload, UploadFile):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Choose a photo to upload",
            )

        # One byte over the limit is enough to know it is too large.
        return await upload.read(PHOTO_MAX_BYTES + 1)


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


@router.put(
    "/{authorisation_id}/photo",
    response_model=PickupAuthorisationResponse,
    responses=PHOTO_CHANGE_RESPONSES,
    openapi_extra=PHOTO_UPLOAD_BODY,
    dependencies=[Depends(require_role(UserRole.PARENT)), Depends(limit_photo_changes)],
)

async def upload_pickup_authorisation_photo_endpoint(
    authorisation_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    storage: PhotoStorage = Depends(get_photo_storage),
):

    """Upload or replace a pickup person's photo (SRS 9.3).

    Send multipart form data with one file field, photo: JPEG, PNG or WebP,
    at most 5 MB. It is stored as a cleaned JPEG without metadata, and an
    approved person needs the school's approval again.
    """

    data = await _read_photo_upload(request)

    try:
        photo = await asyncio.to_thread(process_photo, data)

    except PhotoTooLarge as exc:
        raise HTTPException(status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail=PHOTO_TOO_LARGE) from exc

    except InvalidPhoto as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=PHOTO_NOT_ACCEPTED,
        ) from exc

    authorisation = await set_pickup_authorisation_photo(
        session=session,
        school_id=current_user.school_id,
        parent_id=current_user.id,
        authorisation_id=authorisation_id,
        photo=photo,
        storage=storage,
    )

    _tell_admins_if_pending(background_tasks, current_user, authorisation)

    return _found(authorisation)


@router.delete(
    "/{authorisation_id}/photo",
    response_model=PickupAuthorisationResponse,
    responses=rate_limit.RATE_LIMITED_RESPONSE,
    dependencies=[Depends(require_role(UserRole.PARENT)), Depends(limit_photo_changes)],
)

async def remove_pickup_authorisation_photo_endpoint(
    authorisation_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    storage: PhotoStorage = Depends(get_photo_storage),
):

    """Remove a pickup person's photo (SRS 9.3); an approved person needs approval again."""

    authorisation = await set_pickup_authorisation_photo(
        session=session,
        school_id=current_user.school_id,
        parent_id=current_user.id,
        authorisation_id=authorisation_id,
        photo=None,
        storage=storage,
    )

    _tell_admins_if_pending(background_tasks, current_user, authorisation)

    return _found(authorisation)


@router.get(
    "/{authorisation_id}/photo",
    response_class=Response,
    responses={
        200: {"content": {PHOTO_CONTENT_TYPE: {}}, "description": "The photo as JPEG"},
        404: {"description": "No such pickup person, or no photo"},
    },
    dependencies=[Depends(require_role(*PHOTO_VIEWER_ROLES))],
)

async def get_pickup_authorisation_photo_endpoint(
    authorisation_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    storage: PhotoStorage = Depends(get_photo_storage),
):

    """Return a pickup person's photo to their parent and their school's staff (SRS 9.3)."""

    photo = await get_pickup_authorisation_photo(
        session=session,
        school_id=current_user.school_id,
        parent_id=_parent_scope(current_user),
        authorisation_id=authorisation_id,
        storage=storage,
    )

    if photo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")

    # Photos of real people: never kept by shared caches or proxies.
    return Response(
        content=photo,
        media_type=PHOTO_CONTENT_TYPE,
        headers={"Cache-Control": "private, no-store"},
    )
