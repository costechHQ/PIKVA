"""Unit tests for the daily pickup code request/response schemas."""

import json
from datetime import date, datetime, timezone

import pytest
from pydantic import ValidationError

from app.schemas.pickup import PickupCodeRequest, PickupCodeResponse


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
