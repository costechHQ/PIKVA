from datetime import date
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.fields import PhotoUrl, PupilName

class PupilCreate(BaseModel):
    """Define the data required to create a pupil."""

    # Examples document Swagger only; missing names are rejected.
    first_name: PupilName = Field(examples=["Chidi"])
    last_name: PupilName = Field(examples=["Eze"])
    photo_url: PhotoUrl | None = None
    date_of_birth: date
    # Required for school admins (the pupil's parent); parents must omit it.
    parent_id: int | None = None

class PupilParent(BaseModel):
    """The pupil's parent, so school staff can contact the family (SRS 8)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    phone: str


class PupilResponse(BaseModel):
    """Define the safe pupil data returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    school_id: int
    parent_id: int
    parent: PupilParent
    first_name: str
    last_name: str
    photo_url: str | None
    date_of_birth: date


class PupilUpdate(BaseModel):
    """Define the editable fields for an existing pupil."""
    first_name: PupilName | None = None
    last_name: PupilName | None = None
    photo_url: PhotoUrl | None = None
    date_of_birth: date | None = None

    @model_validator(mode="after")
    def reject_null_required_fields(self) -> "PupilUpdate":
        """Reject explicit nulls for fields that cannot be empty."""

        null_fields = sorted(
            field for field in self.model_fields_set
            if field != "photo_url" and getattr(self, field) is None
        )

        if null_fields:
            raise ValueError(f"Fields cannot be null: {', '.join(null_fields)}")

        return self