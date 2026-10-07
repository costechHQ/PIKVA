from app.db.base import Base
from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime

class PickupAuthorisation(Base):
    """Represents a person authorised to pick up a pupil."""

    __tablename__ = "pickup_authorisations"

    id: Mapped[int] = mapped_column(primary_key=True)

    pupil_id: Mapped[int] = mapped_column(
        ForeignKey("pupils.id"),
        nullable=False,
    )

    picker_name: Mapped[str] = mapped_column(String(150), nullable=False)

    picker_phone: Mapped[str] = mapped_column(String(30), nullable=False)

    relationship: Mapped[str] = mapped_column(String(50), nullable=False)

    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    type: Mapped[str] = mapped_column(String(50), nullable=False)

    starts_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
    )

    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        default=True,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
