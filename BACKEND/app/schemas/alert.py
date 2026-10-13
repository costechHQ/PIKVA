from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, computed_field


class AlertStatus(str, Enum):
    """Define the states used to filter security alerts."""

    OPEN = "open"
    RESOLVED = "resolved"


class SecurityAlertResponse(BaseModel):
    """Define the security alert data returned to school admins (SRS 13)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    pupil_id: int | None
    authorisation_id: int | None
    attempted_by: int | None
    alert_type: str
    message: str
    created_at: datetime
    resolved_at: datetime | None

    @computed_field
    @property
    def status(self) -> AlertStatus:
        """Return whether the alert is still open or has been resolved."""

        return AlertStatus.OPEN if self.resolved_at is None else AlertStatus.RESOLVED
