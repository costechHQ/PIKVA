"""Unit tests for cleaning and storing pickup person photos (SRS 9.3)."""

from io import BytesIO

import pytest
from PIL import Image

from app.services.photo_service import (
    PHOTO_MAX_BYTES,
    PHOTO_MAX_SIDE,
    InvalidPhoto,
    LocalPhotoStorage,
    PhotoTooLarge,
    process_photo,
)

ORIENTATION = 0x0112
MAKE = 0x010F
GPS_IFD = 0x8825


def encode(image: Image.Image, image_format: str, **options) -> bytes:
    """Return an image saved in the given format."""

    output = BytesIO()
    image.save(output, format=image_format, **options)
    return output.getvalue()


def decode(data: bytes) -> Image.Image:
    """Open processed bytes as an image."""

    return Image.open(BytesIO(data))


def test_output_is_jpeg():
    """Every accepted format comes out as JPEG."""

    for image_format in ("JPEG", "PNG", "WEBP"):
        source = encode(Image.new("RGB", (120, 80), "red"), image_format)

        assert decode(process_photo(source)).format == "JPEG"


def test_large_photo_is_shrunk_keeping_its_shape():
    """The longest side becomes PHOTO_MAX_SIDE."""

    source = encode(Image.new("RGB", (1600, 400), "blue"), "JPEG")

    assert decode(process_photo(source)).size == (PHOTO_MAX_SIDE, 200)


def test_small_photo_is_not_enlarged():
    """A photo already small enough keeps its size."""

    source = encode(Image.new("RGB", (100, 50), "blue"), "PNG")

    assert decode(process_photo(source)).size == (100, 50)


def test_metadata_is_removed():
    """No EXIF survives: no camera make, no GPS location."""

    exif = Image.Exif()
    exif[MAKE] = "SecretCam"
    exif.get_ifd(GPS_IFD)[1] = "N"
    source = encode(Image.new("RGB", (120, 80), "green"), "JPEG", exif=exif)

    cleaned = process_photo(source)

    assert b"SecretCam" not in cleaned
    assert len(decode(cleaned).getexif()) == 0
    assert "exif" not in decode(cleaned).info


def test_photo_is_turned_upright():
    """An EXIF rotation is applied to the pixels before it is removed."""

    exif = Image.Exif()
    exif[ORIENTATION] = 6  # taken sideways: rotate 90 degrees
    source = encode(Image.new("RGB", (200, 100), "white"), "JPEG", exif=exif)

    assert decode(process_photo(source)).size == (100, 200)


def test_transparency_becomes_white():
    """A transparent PNG is flattened onto white, not black."""

    source = encode(Image.new("RGBA", (10, 10), (0, 0, 0, 0)), "PNG")

    pixel = decode(process_photo(source)).getpixel((5, 5))

    assert all(channel > 245 for channel in pixel)


@pytest.mark.parametrize(
    "data",
    [
        b"",
        b"not an image at all",
        b"<svg xmlns='http://www.w3.org/2000/svg'></svg>",
        encode(Image.new("RGB", (10, 10)), "GIF"),
        encode(Image.new("RGB", (10, 10)), "BMP"),
        encode(Image.new("RGB", (300, 300), "red"), "JPEG")[:200],
    ],
    ids=["empty", "text", "svg", "gif", "bmp", "truncated-jpeg"],
)
def test_non_accepted_files_are_refused(data):
    """Only whole JPEG, PNG and WebP images are accepted."""

    with pytest.raises(InvalidPhoto):
        process_photo(data)


def test_huge_dimensions_are_refused():
    """A tiny file claiming enormous dimensions is never decoded."""

    source = encode(Image.new("1", (8000, 7000)), "PNG")

    assert len(source) < PHOTO_MAX_BYTES

    with pytest.raises(InvalidPhoto):
        process_photo(source)


def test_file_over_limit_is_refused():
    """Over PHOTO_MAX_BYTES is refused before any decoding."""

    with pytest.raises(PhotoTooLarge):
        process_photo(b"\xff" * (PHOTO_MAX_BYTES + 1))


async def test_storage_saves_reads_and_deletes(tmp_path):
    """A saved photo can be read back by its key until deleted."""

    storage = LocalPhotoStorage(tmp_path / "photos")

    key = await storage.save(b"jpeg bytes")

    assert await storage.read(key) == b"jpeg bytes"

    await storage.delete(key)

    assert await storage.read(key) is None


async def test_storage_uses_random_names_and_leaves_no_partial_file(tmp_path):
    """Each save gets a new key, and only finished files remain."""

    storage = LocalPhotoStorage(tmp_path)

    first = await storage.save(b"one")
    second = await storage.save(b"two")

    assert first != second
    assert sorted(path.name for path in tmp_path.iterdir()) == sorted(
        [f"{first}.jpg", f"{second}.jpg"]
    )


async def test_storage_delete_of_missing_photo_is_fine(tmp_path):
    """Deleting twice is not an error."""

    storage = LocalPhotoStorage(tmp_path)
    key = await storage.save(b"x")

    await storage.delete(key)
    await storage.delete(key)


@pytest.mark.parametrize("key", ["../secret", "..\\secret", "ABC", "a" * 31, "a" * 33, ""])
async def test_storage_refuses_keys_it_did_not_make(tmp_path, key):
    """Only 32 lowercase hex characters: no path tricks."""

    storage = LocalPhotoStorage(tmp_path)

    with pytest.raises(ValueError):
        await storage.read(key)
