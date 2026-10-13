import json
from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator

from app.models.pickup_code import PickupCodeCheckResult


class PickupCodeRequest(BaseModel):
    """Define the data a parent sends to request a daily pickup code."""

    authorisation_id: int


class PickupCodeResponse(BaseModel):
    """Define the newly issued pickup code, returned in plaintext only once."""

    authorisation_id: int
    pupil_id: int
    code: str
    code_date: date
    expires_at: datetime

    @computed_field
    @property
    def qr_data(self) -> str:
        """Return the payload for the client to render as a QR code."""

        # Serialise like the response fields so both carry identical values.
        return json.dumps(
            self.model_dump(mode="json", include={"code", "code_date", "expires_at"}),
            separators=(",", ":"),
        )


class VerificationMethod(str, Enum):
    """Define how gate staff presented a pickup code for verification."""

    QR = "qr"
    MANUAL = "manual"


class PickupVerifyRequest(BaseModel):
    """Define the code gate staff submit for verification.

    QR verification sends the scanned qr_data; manual verification sends the
    typed code. pupil_id is optional and, when given, the code must belong
    to that pupil.
    """

    method: VerificationMethod
    code: str | None = Field(default=None, max_length=64)
    qr_data: str | None = Field(default=None, max_length=512)
    pupil_id: int | None = None

    @model_validator(mode="after")
    def require_input_for_method(self) -> "PickupVerifyRequest":
        """Require exactly the input that matches the verification method."""

        if self.method == VerificationMethod.QR:
            if not self.qr_data or self.code is not None:
                raise ValueError("QR verification requires qr_data only")
        elif not self.code or self.qr_data is not None:
            raise ValueError("Manual verification requires code only")

        return self


class GatePupil(BaseModel):
    """Define the minimum pupil details shown to gate staff."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    first_name: str
    last_name: str
    photo_url: str | None


class GatePicker(BaseModel):
    """Define the minimum pickup person details shown to gate staff."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    picker_name: str
    relationship: str
    photo_url: str | None


class PickupVerifyResponse(BaseModel):
    """Define the gate verification result.

    Pupil and picker details are only included when the code is valid, so a
    failed attempt reveals nothing about who a code belongs to.
    """

    result: PickupCodeCheckResult
    method: VerificationMethod
    pupil: GatePupil | None = None
    authorisation: GatePicker | None = None
    code_expires_at: datetime | None = None

    @computed_field
    @property
    def verified(self) -> bool:
        """Return whether every verification check passed."""

        return self.result == PickupCodeCheckResult.VALID
