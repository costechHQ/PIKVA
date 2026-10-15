from enum import Enum
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum as SQLEnum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

class UserRole(str, Enum):
    """Define the roles available to Pikva users."""

    PARENT = "parent"
    SCHOOL_ADMIN = "school_admin"
    GATE_STAFF = "gate_staff"


class User(Base):
    """Represent a Pikva user account."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    school_id: Mapped[int] = mapped_column(
        ForeignKey("schools.id"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)

    phone: Mapped[str] = mapped_column(String(30), nullable=False)

    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    role: Mapped[UserRole] = mapped_column(SQLEnum(UserRole), nullable=False)

    # Set on password reset; access tokens issued before it are rejected.
    password_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Set when a school admin deactivates the account (SRS 6.7); None means active.
    deactivated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
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

    @property
    def is_active(self) -> bool:
        """Return whether the account may sign in and use the API."""

        return self.deactivated_at is None
