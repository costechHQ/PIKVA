from app.db.base import Base
from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from datetime import datetime, timezone


class PasswordResetToken(Base):
    """Represent a single-use password reset link (SRS 6.6).

    Only the SHA-256 hash of the emailed token is stored; the token itself
    is 32 random bytes, so a fast hash is safe here.
    """

    __tablename__ = "password_reset_tokens"
    __table_args__ = (
        # Confirm looks a token up by hash; unique so a hash means one token.
        Index("ix_password_reset_tokens_token_hash", "token_hash", unique=True),
        # A new request cancels the user's older unused tokens.
        Index("ix_password_reset_tokens_user_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )

    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)

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
