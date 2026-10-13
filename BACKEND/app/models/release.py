from app.db.base import Base
from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column
from enum import Enum


class ReleaseResult(str, Enum):
    """Define the recorded outcome of a release (SRS 12)."""

    RELEASED = "released"


class ReleaseRecord(Base):
    """Record an attempt to release a pupil at the school gate."""

    __tablename__ = "release_records"
    __table_args__ = (
        # Release history for a pupil, newest first.
        Index(
            "ix_release_records_pupil_id_released_at",
            "pupil_id",
            "released_at",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    pupil_id: Mapped[int] = mapped_column(
        ForeignKey("pupils.id"),
        nullable=False,
    )

    authorisation_id: Mapped[int] = mapped_column(
        ForeignKey("pickup_authorisations.id"),
        nullable=False,
    )

    verified_by: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )

    verification_method: Mapped[str] = mapped_column(String(500), nullable=False)

    result: Mapped[str] = mapped_column(String(500), nullable=False)

    released_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
