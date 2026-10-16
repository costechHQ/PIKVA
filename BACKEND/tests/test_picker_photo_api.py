"""API tests for uploading, viewing and removing pickup person photos (SRS 9.3)."""

from io import BytesIO

import pytest
from PIL import Image
from sqlalchemy import select

import test_pickup_code_api as api
from app.core.constants import PHOTO_CHANGE_LIMIT
from app.db.session import async_session
from app.main import app
from app.models.audit_log import AuditLog
from app.routes import pickers as pickers_routes
from app.services.photo_service import PHOTO_MAX_BYTES, LocalPhotoStorage, get_photo_storage

MAKE = 0x010F


@pytest.fixture(autouse=True)
def photo_dir(tmp_path):
    """Store photos in a throwaway folder, never in the real storage folder."""

    app.dependency_overrides[get_photo_storage] = lambda: LocalPhotoStorage(tmp_path)
    yield tmp_path
    app.dependency_overrides.pop(get_photo_storage, None)


@pytest.fixture
def notified(monkeypatch) -> list[int]:
    """Record the school ids the routes ask to notify, instead of emailing."""

    calls: list[int] = []

    async def record(school_id: int) -> bool:
        calls.append(school_id)
        return True

    monkeypatch.setattr(pickers_routes, "notify_approval_requested", record)
    return calls


@pytest.fixture
async def school(client):
    """Provide one school with an admin, a parent, gate staff and an approved authorisation."""

    return await api.create_school(client, "photo")


def jpeg(colour: str = "red", camera: str | None = None) -> bytes:
    """Return a small JPEG, optionally carrying a camera make in its EXIF."""

    exif = Image.Exif()
    if camera:
        exif[MAKE] = camera

    output = BytesIO()
    Image.new("RGB", (120, 90), colour).save(output, format="JPEG", exif=exif)
    return output.getvalue()


def photo_url(school) -> str:
    return f"/api/v1/pickers/{school['authorisation_id']}/photo"


async def upload(client, school, data: bytes, role: str = "parent", name: str = "me.jpg"):
    """PUT a photo as multipart form data."""

    return await client.put(
        photo_url(school),
        headers=school["headers"][role],
        files={"photo": (name, data, "image/jpeg")},
    )


async def stored(photo_dir) -> list[str]:
    """Return the names of the files in photo storage."""

    return sorted(path.name for path in photo_dir.iterdir())


async def photo_audits(authorisation_id: int) -> list[tuple[str, dict]]:
    """Return the photo audit entries for one authorisation, oldest first."""

    async with async_session() as session:
        rows = await session.execute(
            select(AuditLog.action, AuditLog.metadata_)
            .where(AuditLog.entity_id == authorisation_id, AuditLog.action.like("%photo%"))
            .order_by(AuditLog.id)
        )
        return [tuple(row) for row in rows]


# --- Upload -----------------------------------------------------------------


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


async def test_upload_needs_approval_again(client, school, notified):
    """A new photo is a parent change: pending again, admins told (SRS 9.2)."""

    notified.clear()

    response = await upload(client, school, jpeg())

    assert response.json()["status"] == "pending_approval"
    assert response.json()["approved_at"] is None
    assert notified == [school["school_id"]]


async def test_admin_cannot_approve_without_seeing_new_photo(client, school):
    """An approval based on the details before the upload is refused."""

    admin = school["headers"]["admin"]
    before = (await client.get(f"/api/v1/pickers/{school['authorisation_id']}", headers=admin)).json()

    await upload(client, school, jpeg())

    response = await client.post(
        f"/api/v1/pickers/{school['authorisation_id']}/approve",
        headers=admin,
        json={"updated_at": before["updated_at"]},
    )

    assert response.status_code == 409


async def test_new_photo_replaces_and_deletes_the_old_file(client, school, photo_dir):
    """Only the latest photo is kept."""

    await upload(client, school, jpeg("red"))
    [first] = await stored(photo_dir)

    await upload(client, school, jpeg("blue"))
    [second] = await stored(photo_dir)

    assert first != second


async def test_upload_and_removal_are_audited_without_image_data(client, school):
    """Each change is logged with only ids and the approval flag."""

    await upload(client, school, jpeg())
    await client.delete(photo_url(school), headers=school["headers"]["parent"])

    [(added, added_meta), (removed, removed_meta)] = await photo_audits(school["authorisation_id"])

    assert added == "pickup_authorisation.photo_updated"
    assert removed == "pickup_authorisation.photo_removed"
    # The upload cleared the approval; the removal found it already cleared.
    assert added_meta["approval_reset"] is True
    assert removed_meta["approval_reset"] is False
    assert set(added_meta) == set(removed_meta) == {"pupil_id", "approval_reset"}


# --- Refused uploads --------------------------------------------------------


@pytest.mark.parametrize(
    "data",
    [b"not an image", b"GIF89a" + b"\x00" * 50, b""],
    ids=["text", "gif-header", "empty"],
)
async def test_non_image_is_refused_and_nothing_changes(client, school, photo_dir, data):
    """Only real JPEG, PNG or WebP images are accepted."""

    response = await upload(client, school, data)

    assert response.status_code == 422
    assert response.json()["detail"] == pickers_routes.PHOTO_NOT_ACCEPTED
    assert await stored(photo_dir) == []

    person = await client.get(f"/api/v1/pickers/{school['authorisation_id']}", headers=school["headers"]["parent"])
    assert person.json()["status"] == "active"


async def test_missing_photo_field_is_refused(client, school):
    """The file must be sent in the photo field."""

    response = await client.put(
        photo_url(school),
        headers=school["headers"]["parent"],
        files={"picture": ("me.jpg", jpeg(), "image/jpeg")},
    )

    assert response.status_code == 422


async def test_body_declared_too_large_is_refused_unread(client, school):
    """A body far over the limit is refused from its Content-Length alone."""

    response = await upload(client, school, b"\xff" * (PHOTO_MAX_BYTES + 100_000))

    assert response.status_code == 413


async def test_photo_just_over_the_limit_is_refused(client, school):
    """A photo over 5 MB that fits the multipart allowance is still refused."""

    response = await upload(client, school, b"\xff" * (PHOTO_MAX_BYTES + 1))

    assert response.status_code == 413
    assert response.json()["detail"] == pickers_routes.PHOTO_TOO_LARGE


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


async def test_removing_a_photo_needs_approval_again(client, school, photo_dir):
    """Removing the photo of an approved person is a parent change."""

    admin = school["headers"]["admin"]
    uploaded = (await upload(client, school, jpeg())).json()
    await client.post(
        f"/api/v1/pickers/{school['authorisation_id']}/approve",
        headers=admin,
        json={"updated_at": uploaded["updated_at"]},
    )

    response = await client.delete(photo_url(school), headers=school["headers"]["parent"])

    assert response.json()["status"] == "pending_approval"


async def test_removing_when_there_is_no_photo_changes_nothing(client, school, notified):
    """No photo, nothing to remove: still approved, nobody told, nothing logged."""

    notified.clear()

    response = await client.delete(photo_url(school), headers=school["headers"]["parent"])

    assert response.status_code == 200
    assert response.json()["status"] == "active"
    assert notified == []
    assert await photo_audits(school["authorisation_id"]) == []


# --- Who can see and change photos ------------------------------------------


async def test_no_photo_is_not_found(client, school):
    """A person without a photo answers 404."""

    response = await client.get(photo_url(school), headers=school["headers"]["parent"])

    assert response.status_code == 404


async def test_other_school_cannot_see_or_change_photo(client, school, photo_dir):
    """Another school's parent, admin and gate staff get 404 for everything."""

    await upload(client, school, jpeg())
    other = await api.create_school(client, "otherphoto")

    for role in ("parent", "admin", "gate_staff"):
        response = await client.get(photo_url(school), headers=other["headers"][role])
        assert response.status_code == 404, role

    intruder = {"headers": other["headers"], "authorisation_id": school["authorisation_id"]}
    assert (await upload(client, intruder, jpeg("blue"))).status_code == 404
    assert (await client.delete(photo_url(school), headers=other["headers"]["parent"])).status_code == 404
    assert len(await stored(photo_dir)) == 1


async def test_other_family_in_same_school_cannot_see_or_change_photo(client, school, photo_dir):
    """A different parent in the same school gets 404."""

    await upload(client, school, jpeg())
    other_parent = await api.add_parent(client, school, "neighbour")

    response = await client.get(photo_url(school), headers=other_parent)
    assert response.status_code == 404

    response = await client.put(
        photo_url(school), headers=other_parent, files={"photo": ("x.jpg", jpeg("blue"), "image/jpeg")}
    )
    assert response.status_code == 404
    assert len(await stored(photo_dir)) == 1


async def test_photo_changes_are_rate_limited(client, school):
    """Uploads and removals share one budget per user."""

    parent = school["headers"]["parent"]

    for _ in range(PHOTO_CHANGE_LIMIT):
        assert (await client.delete(photo_url(school), headers=parent)).status_code == 200

    response = await client.delete(photo_url(school), headers=parent)

    assert response.status_code == 429
    assert "retry-after" in response.headers
