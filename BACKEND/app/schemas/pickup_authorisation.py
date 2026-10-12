from datetime import datetime, timezone
from pydantic import AwareDatetime, BaseModel, ConfigDict, field_validator

class PickupAuthorisationCreate(BaseModel):
    """Define the data required to authorise a pickup person."""

    pupil_id: int
    picker_name: str
    picker_phone: str
    relationship: str
    photo_url: str | None = None
    type: str
    starts_at: AwareDatetime
    expires_at: AwareDatetime

    @field_validator("starts_at", "expires_at")
    @classmethod
    def normalise_to_utc(cls, value: datetime) -> datetime:
        """Convert timezone-aware timestamps to UTC."""

        return value.astimezone(timezone.utc)


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
    created_at: datetime
    updated_at: datetime
