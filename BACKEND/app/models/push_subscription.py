from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PushSubscription(Base):
    """Represent one browser an admin allowed to receive push notifications.

    The endpoint is the browser's own private address at its push service,
    so it is never returned by the API or logged. The two keys encrypt each
    message for that one browser.
    """

    __tablename__ = "push_subscriptions"
    __table_args__ = (
        # One row per browser; saving it again updates the row.
        Index("ix_push_subscriptions_endpoint", "endpoint", unique=True),
        # A user's browsers, and a school's admins' browsers through the user.
        Index("ix_push_subscriptions_user_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )

    endpoint: Mapped[str] = mapped_column(String(2048), nullable=False)

    p256dh: Mapped[str] = mapped_column(String(255), nullable=False)

    auth: Mapped[str] = mapped_column(String(255), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
