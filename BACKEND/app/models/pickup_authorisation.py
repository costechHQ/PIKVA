from app.db.base import Base
from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from enum import Enum


class AuthorisationStatus(str, Enum):
    """Define the derived validity states of a pickup authorisation."""

    ACTIVE = "active"
    INACTIVE = "inactive"
    SCHEDULED = "scheduled"
    EXPIRED = "expired"


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
        DateTime(timezone=True),
        nullable=False,
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        default=True,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def status_at(self, moment: datetime) -> AuthorisationStatus:
        """Return the authorisation's validity status at a given moment."""

        if not self.is_active:
            return AuthorisationStatus.INACTIVE

        if moment < self.starts_at:
            return AuthorisationStatus.SCHEDULED

        if moment >= self.expires_at:
            return AuthorisationStatus.EXPIRED

        return AuthorisationStatus.ACTIVE

    @property
    def status(self) -> AuthorisationStatus:
        """Return the authorisation's validity status right now."""

        return self.status_at(datetime.now(timezone.utc))
