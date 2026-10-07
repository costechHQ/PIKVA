from app.db.base import Base
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String

class DailyPickupCode(Base):
    """Represent a hashed pickup verification code for a day."""

    __tablename__ = "daily_pickup_codes"

    id: Mapped[int] = mapped_column(primary_key=True)

    pupil_id: Mapped[int] = mapped_column(
        ForeignKey("pupils.id"),
        nullable=False,
    )

    authorisation_id: Mapped[int] = mapped_column(
        ForeignKey("pickup_authorisation.id"),
        nullable=False,
    )

    code_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    code_date: Mapped[date] = mapped_column(Date, nullable=False)

    expires_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
    )

    used_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

    created_at: Mapped[DateTime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )
