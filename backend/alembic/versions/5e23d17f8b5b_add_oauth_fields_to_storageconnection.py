"""Add OAuth fields to StorageConnection

Revision ID: 5e23d17f8b5b
Revises: a5e6bded0f6a
Create Date: 2026-06-29 04:44:38.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '5e23d17f8b5b'
down_revision: Union[str, None] = 'a5e6bded0f6a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # We only add columns to storage_connections
    op.add_column('storage_connections', sa.Column('encrypted_credentials', sa.Text(), nullable=True))
    op.add_column('storage_connections', sa.Column('status', sa.String(length=50), server_default='connected', nullable=False))
    op.add_column('storage_connections', sa.Column('last_sync_at', sa.DateTime(timezone=True), nullable=True))

def downgrade() -> None:
    op.drop_column('storage_connections', 'last_sync_at')
    op.drop_column('storage_connections', 'status')
    op.drop_column('storage_connections', 'encrypted_credentials')
