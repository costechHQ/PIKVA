from app.db.base import Base
from sqlalchemy import Date, DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from datetime import date, datetime, timezone


class DailyPickupCode(Base):
    """Represent a hashed pickup verification code for a day."""

    __tablename__ = "daily_pickup_codes"
    __table_args__ = (
        # Gate lookup by hash; unique so a hash identifies exactly one code.
        Index("ix_daily_pickup_codes_code_hash", "code_hash", unique=True),
        # Find today's codes for an authorisation when re-issuing.
        Index(
            "ix_daily_pickup_codes_authorisation_id_code_date",
            "authorisation_id",
            "code_date",
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

    code_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    code_date: Mapped[date] = mapped_column(Date, nullable=False)

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
