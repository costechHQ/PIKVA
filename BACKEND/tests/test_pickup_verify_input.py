"""Unit tests for gate verification input: request schema and QR parsing."""

import pytest
from pydantic import ValidationError

from app.schemas.pickup import PickupCodeResponse, PickupVerifyRequest, VerificationMethod
from app.services.pickup_service import code_from_qr_data


def test_manual_request_with_code_is_accepted():
    """Manual verification carries a typed code."""

    request = PickupVerifyRequest(method="manual", code="ABCD2345", pupil_id=7)

    assert request.method == VerificationMethod.MANUAL
    assert request.pupil_id == 7


def test_qr_request_with_qr_data_is_accepted():
    """QR verification carries the scanned payload."""

    request = PickupVerifyRequest(method="qr", qr_data='{"code":"ABCD2345"}')

    assert request.method == VerificationMethod.QR


@pytest.mark.parametrize(
    "body",
    [
        {"method": "manual"},
        {"method": "manual", "code": ""},
        {"method": "manual", "code": "ABCD2345", "qr_data": "{}"},
        {"method": "qr"},
        {"method": "qr", "qr_data": ""},
        {"method": "qr", "qr_data": "{}", "code": "ABCD2345"},
        {"method": "sms", "code": "ABCD2345"},
        {"method": "manual", "code": "A" * 65},
        {"method": "qr", "qr_data": "x" * 513},
    ],
)
def test_request_without_matching_input_is_rejected(body):
    """Each method requires exactly its own, reasonably sized input."""

    with pytest.raises(ValidationError):
        PickupVerifyRequest.model_validate(body)


def test_code_is_read_from_issued_qr_data():
    """The QR payload produced at issue time yields the same code."""

    issued = PickupCodeResponse(
        authorisation_id=1,
        pupil_id=2,
        code="ABCD2345",
        code_date="2026-10-13",
        expires_at="2026-10-14T00:00:00Z",
    )

    assert code_from_qr_data(issued.qr_data) == "ABCD2345"


@pytest.mark.parametrize(
    "qr_data",
    ["not json", "[1, 2]", '"ABCD2345"', "{}", '{"code": 12345678}', '{"code": "  "}'],
)
def test_malformed_qr_data_yields_no_code(qr_data):
    """Malformed QR data is treated as having no code."""

    assert code_from_qr_data(qr_data) is None
