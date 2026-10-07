from app.db.base import Base
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

class ReleaseRecord(Base):
    """Record an attempt to release a pupil at the school gate."""

    __tablename__ = "release_records"

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
        DateTime,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )
