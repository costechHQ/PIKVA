"""add uploaded photo columns to pupils

Revision ID: b2e6a4d9c315
Revises: a8d3f5c1e927
Create Date: 2026-10-19 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2e6a4d9c315'
down_revision: Union[str, Sequence[str], None] = 'a8d3f5c1e927'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # photo_url stays until the upload flow is live; a later migration drops it.
    op.add_column(
        'pupils',
        sa.Column('photo_key', sa.String(length=32), nullable=True),
    )
    op.add_column(
        'pupils',
        sa.Column('photo_updated_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('pupils', 'photo_updated_at')
    op.drop_column('pupils', 'photo_key')
