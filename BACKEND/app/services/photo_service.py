"""Clean and store uploaded pickup person photos (SRS 9.3)."""

import asyncio
import os
import re
import secrets
from io import BytesIO
from pathlib import Path
from typing import Protocol

from PIL import Image, ImageOps

from app.core.config import settings

PHOTO_MAX_BYTES = 5 * 1024 * 1024
PHOTO_MAX_SIDE = 800
PHOTO_JPEG_QUALITY = 85
PHOTO_CONTENT_TYPE = "image/jpeg"

# Formats are decided from the image content by Pillow, never by file name.
ACCEPTED_FORMATS = frozenset({"JPEG", "PNG", "WEBP"})

# A small file can still claim a huge size (decompression bomb); refuse
# anything larger than a big phone photo before decoding its pixels.
MAX_SOURCE_PIXELS = 50_000_000

_KEY_PATTERN = re.compile(r"[0-9a-f]{32}")


class InvalidPhoto(ValueError):
    """The upload is not an accepted image."""


class PhotoTooLarge(ValueError):
    """The upload is over PHOTO_MAX_BYTES."""


def process_photo(data: bytes) -> bytes:
    """Return the upload re-encoded as a clean JPEG, or raise.

    The image is decoded, turned upright, flattened onto white if it has
    transparency, shrunk to PHOTO_MAX_SIDE and written into a new image, so
    no metadata (GPS, camera) or hidden content from the original survives.
    CPU-bound: call it through asyncio.to_thread from request handlers.
    """

    if len(data) > PHOTO_MAX_BYTES:
        raise PhotoTooLarge

    try:
        with Image.open(BytesIO(data)) as source:
            if source.format not in ACCEPTED_FORMATS:
                raise InvalidPhoto

            if source.width * source.height > MAX_SOURCE_PIXELS:
                raise InvalidPhoto

            source.load()
            image = _flatten(ImageOps.exif_transpose(source))

    except InvalidPhoto:
        raise

    # Pillow raises many error types for broken or hostile files.
    except Exception as exc:
        raise InvalidPhoto from exc

    image.thumbnail((PHOTO_MAX_SIDE, PHOTO_MAX_SIDE), Image.Resampling.LANCZOS)

    # A fresh image carries none of the original's info (EXIF, ICC, comments).
    clean = Image.new("RGB", image.size)
    clean.paste(image)

    output = BytesIO()
    clean.save(output, format="JPEG", quality=PHOTO_JPEG_QUALITY, optimize=True)

    return output.getvalue()


def _flatten(image: Image.Image) -> Image.Image:
    """Return an RGB copy, with any transparent parts shown as white."""

    has_alpha = image.mode in ("RGBA", "LA", "PA") or (
        image.mode == "P" and "transparency" in image.info
    )

    if not has_alpha:
        return image.convert("RGB")

    rgba = image.convert("RGBA")
    background = Image.new("RGB", rgba.size, "white")
    background.paste(rgba, mask=rgba.getchannel("A"))

    return background


class PhotoStorage(Protocol):
    """Define where cleaned photos are kept. Keys are opaque to callers."""

    async def save(self, data: bytes) -> str:
        """Store the photo and return its new random key."""

    async def read(self, key: str) -> bytes | None:
        """Return the photo, or None if it does not exist."""

    async def delete(self, key: str) -> None:
        """Remove the photo; a missing photo is not an error."""


class LocalPhotoStorage:
    """Keep photos as files in one folder on the server's disk."""

    def __init__(self, directory: Path) -> None:
        """Store the folder; it is created on the first save."""

        self._directory = directory

    def _path(self, key: str) -> Path:
        """Return the file for a key, refusing anything but our own keys."""

        if not _KEY_PATTERN.fullmatch(key):
            raise ValueError("Not a photo key")

        return self._directory / f"{key}.jpg"

    async def save(self, data: bytes) -> str:
        """Write the photo under a random name, never half-written."""

        key = secrets.token_hex(16)
        path = self._path(key)

        def write() -> None:
            path.parent.mkdir(parents=True, exist_ok=True)
            partial = path.with_suffix(".partial")
            partial.write_bytes(data)
            os.replace(partial, path)

        await asyncio.to_thread(write)

        return key

    async def read(self, key: str) -> bytes | None:
        """Return the photo's bytes, or None if the file is gone."""

        path = self._path(key)

        def load() -> bytes | None:
            try:
                return path.read_bytes()
            except FileNotFoundError:
                return None

        return await asyncio.to_thread(load)

    async def delete(self, key: str) -> None:
        """Delete the photo's file if it is there."""

        await asyncio.to_thread(self._path(key).unlink, missing_ok=True)


def get_photo_storage() -> PhotoStorage:
    """Return the configured photo storage."""

    return LocalPhotoStorage(settings.photo_storage_dir)
