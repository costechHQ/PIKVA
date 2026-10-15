"""add pickup_authorisations.approved_at (school approval, SRS 9.2)

Revision ID: 7b2e4c9d1a60
Revises: 3c8d1f7a92b4
Create Date: 2026-10-15 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7b2e4c9d1a60'
down_revision: Union[str, Sequence[str], None] = '3c8d1f7a92b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'pickup_authorisations',
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
    )
    # Pickup people that existed before school approval count as approved.
    op.execute('UPDATE pickup_authorisations SET approved_at = created_at')


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('pickup_authorisations', 'approved_at')
