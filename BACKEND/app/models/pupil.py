from datetime import date, datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import Date, DateTime, ForeignKey, String

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class Pupil(Base):
    """Represents a pupil enrolled in a school."""
    __tablename__ = "pupils"

    id: Mapped[int] = mapped_column(primary_key=True)

    school_id: Mapped[int] = mapped_column(
        ForeignKey("schools.id"),
        nullable=False,
    )

    parent_id:Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )

    # Never loaded implicitly (async sessions cannot lazy load): queries that
    # need it load it explicitly, and any other access raises.
    parent: Mapped["User"] = relationship(lazy="raise")

    first_name: Mapped[str] = mapped_column(String(100), nullable=False)

    last_name: Mapped[str] = mapped_column(String(100), nullable=False)

    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    date_of_birth: Mapped[date] = mapped_column(Date, nullable=False)

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
