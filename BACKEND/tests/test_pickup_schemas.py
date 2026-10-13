"""Unit tests for the daily pickup code request/response schemas."""

import json
from datetime import date, datetime, timezone

import pytest
from pydantic import ValidationError

from app.models.pickup_authorisation import PickupAuthorisation
from app.models.pickup_code import PickupCodeCheckResult
from app.models.pupil import Pupil
from app.schemas.pickup import (
    GatePicker,
    GatePupil,
    PickupCodeRequest,
    PickupCodeResponse,
    PickupVerifyResponse,
)


def test_request_requires_authorisation_id():
    """A code request without an authorisation ID is rejected."""

    with pytest.raises(ValidationError):
        PickupCodeRequest.model_validate({})


def test_response_qr_data_matches_issued_code():
    """The QR payload carries the same code, date and expiry as the response."""

    response = PickupCodeResponse(
        authorisation_id=1,
        pupil_id=2,
        code="ABCD2345",
        code_date=date(2026, 10, 13),
        expires_at=datetime(2026, 10, 14, tzinfo=timezone.utc),
    )

    body = response.model_dump(mode="json")

    assert json.loads(body["qr_data"]) == {
        "code": "ABCD2345",
        "code_date": "2026-10-13",
        "expires_at": "2026-10-14T00:00:00Z",
    }
    assert json.loads(body["qr_data"])["expires_at"] == body["expires_at"]
    assert body["code"] == "ABCD2345"


def test_verify_response_exposes_only_minimal_details():
    """A valid result shows names and photos, never DOB, phones or parent."""

    pupil = Pupil(
        id=7, school_id=1, parent_id=3, first_name="Ada", last_name="Obi",
        photo_url=None, date_of_birth=date(2018, 1, 1),
    )
    authorisation = PickupAuthorisation(
        id=3, pupil_id=7, picker_name="Aunt Ada", picker_phone="0722222222",
        relationship="aunt", photo_url=None, type="regular",
    )

    body = PickupVerifyResponse(
        result=PickupCodeCheckResult.VALID,
        method="qr",
        pupil=GatePupil.model_validate(pupil),
        authorisation=GatePicker.model_validate(authorisation),
        code_expires_at=datetime(2026, 10, 14, tzinfo=timezone.utc),
    ).model_dump(mode="json")

    assert body["verified"] is True
    assert set(body["pupil"]) == {"id", "first_name", "last_name", "photo_url"}
    assert set(body["authorisation"]) == {"id", "picker_name", "relationship", "photo_url"}


def test_verify_response_failure_is_not_verified():
    """Any non-valid result is reported as not verified."""

    body = PickupVerifyResponse(
        result=PickupCodeCheckResult.USED_CODE, method="manual"
    ).model_dump(mode="json")

    assert body["verified"] is False
    assert body["pupil"] is None and body["authorisation"] is None
