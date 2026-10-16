"""Unit tests for release response and history schemas (SRS 12, 18.8)."""

from datetime import date, datetime, timezone

import pytest
from pydantic import ValidationError

from app.models.pickup_authorisation import PickupAuthorisation
from app.models.pickup_code import PickupCodeCheckResult
from app.models.pupil import Pupil
from app.models.user import User, UserRole
from app.schemas.pickup import GatePicker, GatePupil
from app.schemas.release import PickupReleaseResponse, ReleaseHistoryItem, ReleaseStaff

NOW = datetime(2026, 10, 13, 14, 2, tzinfo=timezone.utc)


def records():
    """Build full pupil, authorisation and staff objects with private fields."""

    pupil = Pupil(
        id=7, school_id=1, parent_id=3, first_name="Ada", last_name="Obi",
        photo_url=None, date_of_birth=date(2018, 1, 1),
    )
    authorisation = PickupAuthorisation(
        id=3, pupil_id=7, picker_name="Aunt Ada", picker_phone="0722222222",
        relationship="aunt", photo_updated_at=None, type="regular",
    )
    staff = User(
        id=9, school_id=1, name="Gate Ike", email="ike@example.com",
        phone="0733333333", password_hash="hash", role=UserRole.GATE_STAFF,
    )

    return pupil, authorisation, staff


def test_successful_release_response():
    """A release reports released with its record and minimal details."""

    pupil, authorisation, _ = records()

    body = PickupReleaseResponse(
        result=PickupCodeCheckResult.VALID,
        method="manual",
        release_id=12,
        released_at=NOW,
        pupil=GatePupil.model_validate(pupil),
        authorisation=GatePicker.model_validate(authorisation),
    ).model_dump(mode="json")

    assert body["released"] is True
    assert body["release_id"] == 12
    assert body["pupil"]["first_name"] == "Ada"


def test_failed_release_response_has_no_details():
    """A failed release returns only the reason."""

    body = PickupReleaseResponse(
        result=PickupCodeCheckResult.USED_CODE, method="qr"
    ).model_dump(mode="json")

    assert body["released"] is False
    assert body["release_id"] is None
    assert body["pupil"] is None and body["authorisation"] is None


def test_history_item_has_srs_fields_and_no_private_details():
    """History shows pupil, picker, staff, method, result and time only."""

    pupil, authorisation, staff = records()

    body = ReleaseHistoryItem(
        id=12,
        pupil=GatePupil.model_validate(pupil),
        authorisation=GatePicker.model_validate(authorisation),
        verified_by=ReleaseStaff.model_validate(staff),
        verification_method="qr",
        result="released",
        released_at=NOW,
    ).model_dump(mode="json")

    assert set(body) == {
        "id", "pupil", "authorisation", "verified_by",
        "verification_method", "result", "released_at",
    }
    assert body["verified_by"] == {"id": 9, "name": "Gate Ike"}
    assert "picker_phone" not in body["authorisation"]
    assert "date_of_birth" not in body["pupil"]


def test_history_item_rejects_unknown_result():
    """Only known release results are accepted."""

    pupil, authorisation, staff = records()

    with pytest.raises(ValidationError):
        ReleaseHistoryItem(
            id=12,
            pupil=GatePupil.model_validate(pupil),
            authorisation=GatePicker.model_validate(authorisation),
            verified_by=ReleaseStaff.model_validate(staff),
            verification_method="qr",
            result="Released",
            released_at=NOW,
        )
