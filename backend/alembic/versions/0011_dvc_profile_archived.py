"""dvc profile archived status

Revision ID: 0011_dvc_profile_archived
Revises: 0010_merge_0009_branches
Create Date: 2026-06-19 10:00:00.000000

"""

from alembic import op


revision = "0011_dvc_profile_archived"
down_revision = "0010_merge_0009_branches"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostgreSQL doesn't support removing enum values natively, and adding is transaction-safe only in PG 12+ 
    # if done outside transaction block or within it depending on version.
    op.execute("COMMIT")
    op.execute("ALTER TYPE mlops_dvc_profile_status ADD VALUE IF NOT EXISTS 'archived'")


def downgrade() -> None:
    pass
