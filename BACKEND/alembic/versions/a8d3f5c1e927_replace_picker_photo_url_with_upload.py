"""replace pickup_authorisations.photo_url with an uploaded photo (SRS 9.3)

Revision ID: a8d3f5c1e927
Revises: 4f1c8e2b7d93
Create Date: 2026-10-16 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a8d3f5c1e927'
down_revision: Union[str, Sequence[str], None] = '4f1c8e2b7d93'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Photo links are no longer accepted; existing ones are dropped and
    # parents upload a photo instead. Pupils keep photo_url for now.
    op.drop_column('pickup_authorisations', 'photo_url')
    op.add_column(
        'pickup_authorisations',
        sa.Column('photo_key', sa.String(length=32), nullable=True),
    )
    op.add_column(
        'pickup_authorisations',
        sa.Column('photo_updated_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Uploaded photos cannot become links; the old column comes back empty.
    op.drop_column('pickup_authorisations', 'photo_updated_at')
    op.drop_column('pickup_authorisations', 'photo_key')
    op.add_column(
        'pickup_authorisations',
        sa.Column('photo_url', sa.String(length=500), nullable=True),
    )
