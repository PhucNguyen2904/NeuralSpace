"""add full_name to users

Revision ID: 0004_user_full_name
Revises: 0003_user_password
Create Date: 2026-05-27 11:15:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0004_user_full_name"
down_revision: Union[str, None] = "0003_user_password"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("full_name", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "full_name")

