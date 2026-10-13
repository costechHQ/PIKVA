from datetime import datetime

from pydantic import BaseModel, ConfigDict, computed_field

from app.models.pickup_code import PickupCodeCheckResult
from app.models.release import ReleaseResult
from app.schemas.pickup import GatePicker, GatePupil, VerificationMethod


class PickupReleaseResponse(BaseModel):
    """Define the outcome of a release attempt at the gate.

    Release details are only included when the pupil was released; a failed
    attempt returns only the reason.
    """

    result: PickupCodeCheckResult
    method: VerificationMethod
    release_id: int | None = None
    released_at: datetime | None = None
    pupil: GatePupil | None = None
    authorisation: GatePicker | None = None

    @computed_field
    @property
    def released(self) -> bool:
        """Return whether the pupil was released."""

        return self.result == PickupCodeCheckResult.VALID


class ReleaseStaff(BaseModel):
    """Define the verifying staff details shown in release history."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class ReleaseHistoryItem(BaseModel):
    """Define one release in the history (SRS 12, 18.8)."""

    id: int
    pupil: GatePupil
    authorisation: GatePicker
    verified_by: ReleaseStaff
    verification_method: VerificationMethod
    result: ReleaseResult
    released_at: datetime
