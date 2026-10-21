"""API tests for uploading, viewing and removing pupil photos."""

from io import BytesIO

import pytest
from PIL import Image
from sqlalchemy import select

import test_pickup_code_api as api
from app.core.constants import PHOTO_CHANGE_LIMIT
from app.db.session import async_session
from app.main import app
from app.models.audit_log import AuditLog
from app.routes import photo_upload
from app.services.photo_service import PHOTO_MAX_BYTES, LocalPhotoStorage, get_photo_storage

MAKE = 0x010F


@pytest.fixture(autouse=True)
def photo_dir(tmp_path):
    """Store photos in a throwaway folder, never in the real storage folder."""

    app.dependency_overrides[get_photo_storage] = lambda: LocalPhotoStorage(tmp_path)
    yield tmp_path
    app.dependency_overrides.pop(get_photo_storage, None)


@pytest.fixture
async def school(client):
    """Provide one school with an admin, a parent, gate staff and the parent's pupil."""

    school = await api.create_school(client, "pupilphoto")

    picker = await client.get(
        f"/api/v1/pickers/{school['authorisation_id']}",
        headers=school["headers"]["parent"],
    )
    school["pupil_id"] = picker.json()["pupil_id"]

    return school


def jpeg(colour: str = "red", camera: str | None = None) -> bytes:
    """Return a small JPEG, optionally carrying a camera make in its EXIF."""

    exif = Image.Exif()
    if camera:
        exif[MAKE] = camera

    output = BytesIO()
    Image.new("RGB", (120, 90), colour).save(output, format="JPEG", exif=exif)
    return output.getvalue()


def photo_url(school) -> str:
    return f"/api/v1/pupils/{school['pupil_id']}/photo"


async def upload(client, school, data: bytes, role: str = "parent"):
    """PUT a photo as multipart form data."""

    return await client.put(
        photo_url(school),
        headers=school["headers"][role],
        files={"photo": ("me.jpg", data, "image/jpeg")},
    )


async def stored(photo_dir) -> list[str]:
    """Return the names of the files in photo storage."""

    return sorted(path.name for path in photo_dir.iterdir())


async def photo_audits(pupil_id: int) -> list[tuple[str, dict]]:
    """Return the photo audit entries for one pupil, oldest first."""

    async with async_session() as session:
        rows = await session.execute(
            select(AuditLog.action, AuditLog.metadata_)
            .where(
                AuditLog.entity_type == "pupil",
                AuditLog.entity_id == pupil_id,
                AuditLog.action.like("%photo%"),
            )
            .order_by(AuditLog.id)
        )
        return [tuple(row) for row in rows]


# --- Upload and view --------------------------------------------------------


async def test_parent_uploads_photo_and_staff_can_view_it(client, school, photo_dir):
    """The photo is stored cleaned and shown to the parent, admin and gate."""

    response = await upload(client, school, jpeg(camera="SecretCam"))

    assert response.status_code == 200
    assert response.json()["photo_updated_at"] is not None
    assert "photo_key" not in response.json()
    assert len(await stored(photo_dir)) == 1

    for role in ("parent", "admin", "gate_staff"):
        photo = await client.get(photo_url(school), headers=school["headers"][role])

        assert photo.status_code == 200, role
        assert photo.headers["content-type"] == "image/jpeg"
        assert photo.headers["cache-control"] == "private, no-store"
        assert b"SecretCam" not in photo.content
        assert Image.open(BytesIO(photo.content)).format == "JPEG"


async def test_admin_uploads_photo_for_any_pupil_in_school(client, school):
    """School admins can fix a pupil's photo on a parent's behalf."""

    response = await upload(client, school, jpeg(), role="admin")

    assert response.status_code == 200
    assert response.json()["photo_updated_at"] is not None


async def test_gate_staff_cannot_change_photos(client, school):
    """Gate staff may view photos but not upload or remove them."""

    assert (await upload(client, school, jpeg(), role="gate_staff")).status_code == 403

    removal = await client.delete(photo_url(school), headers=school["headers"]["gate_staff"])
    assert removal.status_code == 403


async def test_replacing_a_photo_deletes_the_old_file(client, school, photo_dir):
    """Only the newest photo stays on disk."""

    await upload(client, school, jpeg("red"))
    [first] = await stored(photo_dir)

    await upload(client, school, jpeg("blue"))
    [second] = await stored(photo_dir)

    assert first != second


async def test_pupil_without_photo_has_none(client, school):
    """A new pupil shows no photo and the image is not found."""

    pupil = await client.get(
        f"/api/v1/pupils/{school['pupil_id']}", headers=school["headers"]["parent"]
    )
    assert pupil.json()["photo_updated_at"] is None

    photo = await client.get(photo_url(school), headers=school["headers"]["parent"])
    assert photo.status_code == 404


# --- Refused uploads --------------------------------------------------------


async def test_non_image_is_refused(client, school, photo_dir):
    """A file that is not an image is rejected and nothing is stored."""

    response = await upload(client, school, b"not an image")

    assert response.status_code == 422
    assert response.json()["detail"] == photo_upload.PHOTO_NOT_ACCEPTED
    assert await stored(photo_dir) == []


async def test_photo_over_the_limit_is_refused(client, school):
    """A photo over 5 MB is refused."""

    response = await upload(client, school, b"\xff" * (PHOTO_MAX_BYTES + 1))

    assert response.status_code == 413
    assert response.json()["detail"] == photo_upload.PHOTO_TOO_LARGE


async def test_wrong_field_name_is_refused(client, school):
    """The file must be sent in the photo field."""

    response = await client.put(
        photo_url(school),
        headers=school["headers"]["parent"],
        files={"picture": ("me.jpg", jpeg(), "image/jpeg")},
    )

    assert response.status_code == 422


# --- Removal ----------------------------------------------------------------


async def test_parent_removes_photo(client, school, photo_dir):
    """Removal deletes the file; the photo is then not found."""

    await upload(client, school, jpeg())

    response = await client.delete(photo_url(school), headers=school["headers"]["parent"])

    assert response.status_code == 200
    assert response.json()["photo_updated_at"] is None
    assert await stored(photo_dir) == []

    photo = await client.get(photo_url(school), headers=school["headers"]["admin"])
    assert photo.status_code == 404


async def test_removing_when_there_is_no_photo_changes_nothing(client, school):
    """No photo, nothing to remove: succeeds and logs nothing."""

    response = await client.delete(photo_url(school), headers=school["headers"]["parent"])

    assert response.status_code == 200
    assert await photo_audits(school["pupil_id"]) == []


# --- Access -----------------------------------------------------------------


async def test_other_school_cannot_see_or_change_photo(client, school, photo_dir):
    """Another school's parent, admin and gate staff get 404 for everything."""

    await upload(client, school, jpeg())
    other = await api.create_school(client, "otherpupilphoto")

    for role in ("parent", "admin", "gate_staff"):
        response = await client.get(photo_url(school), headers=other["headers"][role])
        assert response.status_code == 404, role

    intruder = {"headers": other["headers"], "pupil_id": school["pupil_id"]}
    assert (await upload(client, intruder, jpeg("blue"))).status_code == 404
    assert (await client.delete(photo_url(school), headers=other["headers"]["parent"])).status_code == 404
    assert len(await stored(photo_dir)) == 1


async def test_other_family_in_same_school_cannot_see_or_change_photo(client, school, photo_dir):
    """A different parent at the same school cannot reach this pupil's photo."""

    await upload(client, school, jpeg())
    other_parent = await api.add_parent(client, school, "neighbour")

    assert (await client.get(photo_url(school), headers=other_parent)).status_code == 404

    response = await client.put(
        photo_url(school), headers=other_parent, files={"photo": ("x.jpg", jpeg("blue"), "image/jpeg")}
    )
    assert response.status_code == 404
    assert (await client.delete(photo_url(school), headers=other_parent)).status_code == 404
    assert len(await stored(photo_dir)) == 1


async def test_unknown_pupil_is_not_found(client, school):
    """A pupil id that does not exist is a 404, not an error."""

    missing = {**school, "pupil_id": school["pupil_id"] + 100_000}

    assert (await upload(client, missing, jpeg())).status_code == 404


# --- Audit and rate limit ---------------------------------------------------


async def test_photo_changes_are_audited_without_the_photo(client, school):
    """Upload and removal each leave one audit entry naming only the parent."""

    await upload(client, school, jpeg(), role="admin")
    await client.delete(photo_url(school), headers=school["headers"]["admin"])

    audits = await photo_audits(school["pupil_id"])

    assert [action for action, _ in audits] == ["pupil.photo_updated", "pupil.photo_removed"]
    assert all(set(metadata) == {"parent_id"} for _, metadata in audits)


async def test_photo_changes_are_rate_limited(client, school):
    """Too many changes in an hour are refused with 429."""

    for _ in range(PHOTO_CHANGE_LIMIT):
        assert (await client.delete(photo_url(school), headers=school["headers"]["parent"])).status_code == 200

    response = await client.delete(photo_url(school), headers=school["headers"]["parent"])

    assert response.status_code == 429
