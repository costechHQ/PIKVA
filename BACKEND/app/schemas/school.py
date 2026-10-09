"""Define schemas for school profile data."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SchoolResponse(BaseModel):
    """Define the school information returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    address: str
    created_at: datetime
    updated_at: datetime
