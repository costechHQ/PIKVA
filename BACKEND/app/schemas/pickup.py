import json
from datetime import date, datetime

from pydantic import BaseModel, computed_field


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
