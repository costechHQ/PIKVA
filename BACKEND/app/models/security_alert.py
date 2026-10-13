from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

class SecurityAlert(Base):
    """Represent a security-related incident in Pikva."""

    __tablename__ = "security_alerts"
    __table_args__ = (
        # Count a staff member's recent failed attempts (repeated-attempt rule).
        Index(
            "ix_security_alerts_attempted_by_created_at",
            "attempted_by",
            "created_at",
        ),
        # A school's alerts, newest first.
        Index("ix_security_alerts_school_id_created_at", "school_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    school_id: Mapped[int] = mapped_column(
        ForeignKey("schools.id"),
        nullable=False,
    )

    pupil_id: Mapped[int | None] = mapped_column(   
        ForeignKey("pupils.id"),
        nullable=True,
    )

    authorisation_id: Mapped[int | None] = mapped_column(   
        ForeignKey("pickup_authorisations.id"),
        nullable=True,
    )

    attempted_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
    )

    alert_type: Mapped[str] = mapped_column(String(50), nullable=False)

    message: Mapped[str] = mapped_column(String(500), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    ) 