from datetime import date
from pydantic import BaseModel, ConfigDict

class PupilCreate(BaseModel):
    """Define the data required to create a pupil."""

    first_name: str = "Simon"
    last_name: str = "Christopher"
    photo_url: str | None = None
    date_of_birth: date 

class PupilResponse(BaseModel):
    """Define the safe pupil data returned by the API."""

    model_config = ConfigDict(from_attricbute=True)

    id: int
    school_id: int
    parent_id: int
    first_name: str
    last_name: str
    photo_url: str | None
    date_of_birth: date