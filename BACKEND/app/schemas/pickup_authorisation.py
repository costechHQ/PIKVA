from datetime import datetime, timezone
from typing import Annotated

from pydantic import AfterValidator, AwareDatetime, BaseModel, ConfigDict, model_validator

from app.models.pickup_authorisation import AuthorisationStatus
from app.schemas.fields import Label, Name, Phone, PhotoUrl


def normalise_to_utc(value: datetime) -> datetime:
    """Convert a timezone-aware timestamp to UTC."""

    return value.astimezone(timezone.utc)


UtcDatetime = Annotated[AwareDatetime, AfterValidator(normalise_to_utc)]


class PickupAuthorisationCreate(BaseModel):
    """Define the data required to authorise a pickup person."""

    pupil_id: int
    picker_name: Name
    picker_phone: Phone
    relationship: Label
    photo_url: PhotoUrl | None = None
    type: Label
    starts_at: UtcDatetime
    expires_at: UtcDatetime


class PickupAuthorisationUpdate(BaseModel):
    """Define the pickup authorisation details that may be changed."""

    picker_name: Name | None = None
    picker_phone: Phone | None = None
    relationship: Label | None = None
    photo_url: PhotoUrl | None = None
    type: Label | None = None
    starts_at: UtcDatetime | None = None
    expires_at: UtcDatetime | None = None

    @model_validator(mode="after")
    def reject_null_required_fields(self) -> "PickupAuthorisationUpdate":
        """Reject explicit nulls for fields that cannot be empty."""

        null_fields = sorted(
            field for field in self.model_fields_set
            if field != "photo_url" and getattr(self, field) is None
        )

        if null_fields:
            raise ValueError(f"Fields cannot be null: {', '.join(null_fields)}")

        return self


class PickupAuthorisationApprove(BaseModel):
    """Define the approval request: the version of the details the admin saw."""

    # The authorisation's updated_at as the admin was shown it, so a parent's
    # later change is never approved unseen (SRS 9.2).
    updated_at: UtcDatetime


class PickupAuthorisationResponse(BaseModel):
    """Define the pickup authorisation data returned by the API"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    pupil_id: int
    picker_name: str
    picker_phone: str
    relationship: str
    photo_url: str | None
    type: str
    starts_at: datetime
    expires_at: datetime
    is_active: bool
    status: AuthorisationStatus
    # None while awaiting school approval (SRS 9.2).
    approved_at: datetime | None
    created_at: datetime
    updated_at: datetime
