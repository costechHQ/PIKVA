"""Upload rules shared by every route that takes a photo (SRS 9.3)."""

import asyncio

from fastapi import Depends, HTTPException, Request, Response, status
from redis.asyncio import Redis
from starlette.datastructures import UploadFile

from app.core import rate_limit
from app.core.constants import PHOTO_CHANGE_LIMIT, PHOTO_CHANGE_WINDOW_SECONDS
from app.core.dependencies import get_current_user
from app.db.redis import get_redis
from app.models.user import User
from app.services.photo_service import (
    PHOTO_CONTENT_TYPE,
    PHOTO_MAX_BYTES,
    InvalidPhoto,
    PhotoTooLarge,
    process_photo,
)

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


async def read_photo_upload(request: Request) -> bytes:
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


async def read_clean_photo(request: Request) -> bytes:
    """Read the upload and return it as a cleaned JPEG, or raise the HTTP error."""

    data = await read_photo_upload(request)

    try:
        return await asyncio.to_thread(process_photo, data)

    except PhotoTooLarge as exc:
        raise HTTPException(status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail=PHOTO_TOO_LARGE) from exc

    except InvalidPhoto as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=PHOTO_NOT_ACCEPTED,
        ) from exc


def photo_response(photo: bytes) -> Response:
    """Return a photo as JPEG that shared caches and proxies must not keep."""

    return Response(
        content=photo,
        media_type=PHOTO_CONTENT_TYPE,
        headers={"Cache-Control": "private, no-store"},
    )
