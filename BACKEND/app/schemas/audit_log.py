from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class AuditActor(BaseModel):
    """Define the user shown as having performed an audited action."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class AuditLogResponse(BaseModel):
    """Define one audit record returned to school admins (SRS 14)."""

    id: int
    user: AuditActor | None
    action: str
    entity_type: str
    entity_id: int | None
    metadata: dict[str, Any] | None
    created_at: datetime
