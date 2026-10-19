from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_role
from app.db.session import get_session
from app.models.pupil import Pupil
from app.models.user import User, UserRole
from app.routes.photo_upload import (
    PHOTO_CHANGE_RESPONSES,
    PHOTO_UPLOAD_BODY,
    limit_photo_changes,
    photo_response,
    read_clean_photo,
)
from app.schemas.pupil import PupilCreate, PupilResponse, PupilUpdate
from app.services.photo_service import PHOTO_CONTENT_TYPE, PhotoStorage, get_photo_storage
from app.services.pupil_service import (
    create_pupil,
    get_pupil,
    get_pupil_photo,
    list_pupils,
    set_pupil_photo,
    update_pupil,
)
from app.core import rate_limit

router = APIRouter(prefix="/pupils", tags=["Pupils"])

MANAGER_ROLES = (UserRole.PARENT, UserRole.SCHOOL_ADMIN)
PHOTO_VIEWER_ROLES = (UserRole.PARENT, UserRole.SCHOOL_ADMIN, UserRole.GATE_STAFF)


def _parent_scope(current_user: User) -> int | None:
    """Limit parents to their own pupils; admins see their whole school."""

    return current_user.id if current_user.role == UserRole.PARENT else None

@router.post(
    "",
    response_model=PupilResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(*MANAGER_ROLES))],
)

async def create_pupil_endpoint(
    data: PupilCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """Create a pupil: parents for themselves, admins for a parent in their school."""

    try:
        return await create_pupil(
            session = session,
            school_id = current_user.school_id,
            parent_id = _parent_scope(current_user),
            data = data,
            actor_id = current_user.id,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

@router.get(
    "",
    response_model=list[PupilResponse],
    dependencies=[Depends(require_role(*MANAGER_ROLES))],
)

async def list_pupils_endpoint(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """List pupils the user may view: a parent's own, or an admin's whole school."""

    return await list_pupils(
        session = session,
        school_id = current_user.school_id,
        parent_id = _parent_scope(current_user),
    )


@router.get(
    "/{pupil_id}",
    response_model=PupilResponse,
    dependencies=[Depends(require_role(*MANAGER_ROLES))],
)

async def get_pupil_endpoint(
    pupil_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """Retrieve one pupil the authenticated user may view."""

    pupil = await get_pupil(
        session = session,
        school_id = current_user.school_id,
        parent_id = _parent_scope(current_user),
        pupil_id = pupil_id,
    )

    if pupil is None:
        raise HTTPException(
            status_code = status.HTTP_404_NOT_FOUND,
            detail= "Pupil not found",
        )

    return pupil


@router.patch(
    "/{pupil_id}",
    response_model = PupilResponse,
    dependencies = [Depends(require_role(*MANAGER_ROLES))],
)

async def update_pupil_endpoint(
    pupil_id: int,
    data: PupilUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """Update a pupil: parents their own, admins any pupil in their school."""

    pupil = await update_pupil(
        session = session,
        school_id = current_user.school_id,
        parent_id = _parent_scope(current_user),
        pupil_id = pupil_id,
        data = data,
        actor_id = current_user.id,
    )

    if pupil is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail = "Pupil not found",
        )

    return pupil

def _pupil_found(pupil: Pupil | None) -> Pupil:
    """Return the pupil or raise 404 when it is not accessible."""

    if pupil is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pupil not found",
        )

    return pupil


@router.put(
    "/{pupil_id}/photo",
    response_model=PupilResponse,
    responses=PHOTO_CHANGE_RESPONSES,
    openapi_extra=PHOTO_UPLOAD_BODY,
    dependencies=[Depends(require_role(*MANAGER_ROLES)), Depends(limit_photo_changes)],
)

async def upload_pupil_photo_endpoint(
    pupil_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    storage: PhotoStorage = Depends(get_photo_storage),
):

    """Upload or replace a pupil's photo: parents their own, admins any in their school.

    Send multipart form data with one file field, photo: JPEG, PNG or WebP,
    at most 5 MB. It is stored as a cleaned JPEG without metadata.
    """

    photo = await read_clean_photo(request)

    pupil = await set_pupil_photo(
        session=session,
        school_id=current_user.school_id,
        parent_id=_parent_scope(current_user),
        pupil_id=pupil_id,
        photo=photo,
        storage=storage,
        actor_id=current_user.id,
    )

    return _pupil_found(pupil)


@router.delete(
    "/{pupil_id}/photo",
    response_model=PupilResponse,
    responses=rate_limit.RATE_LIMITED_RESPONSE,
    dependencies=[Depends(require_role(*MANAGER_ROLES)), Depends(limit_photo_changes)],
)

async def remove_pupil_photo_endpoint(
    pupil_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    storage: PhotoStorage = Depends(get_photo_storage),
):

    """Remove a pupil's photo: parents their own, admins any in their school."""

    pupil = await set_pupil_photo(
        session=session,
        school_id=current_user.school_id,
        parent_id=_parent_scope(current_user),
        pupil_id=pupil_id,
        photo=None,
        storage=storage,
        actor_id=current_user.id,
    )

    return _pupil_found(pupil)


@router.get(
    "/{pupil_id}/photo",
    response_class=Response,
    responses={
        200: {"content": {PHOTO_CONTENT_TYPE: {}}, "description": "The photo as JPEG"},
        404: {"description": "No such pupil, or no photo"},
    },
    dependencies=[Depends(require_role(*PHOTO_VIEWER_ROLES))],
)

async def get_pupil_photo_endpoint(
    pupil_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    storage: PhotoStorage = Depends(get_photo_storage),
):

    """Return a pupil's photo to their parent and their school's staff."""

    photo = await get_pupil_photo(
        session=session,
        school_id=current_user.school_id,
        parent_id=_parent_scope(current_user),
        pupil_id=pupil_id,
        storage=storage,
    )

    if photo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")

    return photo_response(photo)
