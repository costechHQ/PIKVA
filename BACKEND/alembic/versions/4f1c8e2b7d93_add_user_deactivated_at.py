"""add users.deactivated_at (deactivating school users, SRS 6.7)

Revision ID: 4f1c8e2b7d93
Revises: 7b2e4c9d1a60
Create Date: 2026-10-15 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4f1c8e2b7d93'
down_revision: Union[str, Sequence[str], None] = '7b2e4c9d1a60'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # NULL means active, so every existing account stays active.
    op.add_column(
        'users',
        sa.Column('deactivated_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'deactivated_at')
