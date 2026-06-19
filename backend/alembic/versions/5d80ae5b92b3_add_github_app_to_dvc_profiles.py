"""add_github_app_to_dvc_profiles

Revision ID: 5d80ae5b92b3
Revises: 0011_dvc_profile_archived
Create Date: 2026-06-19 07:44:57.793828

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5d80ae5b92b3'
down_revision: Union[str, None] = '0011_dvc_profile_archived'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new enum values if using postgresql
    # Note: ALTER TYPE ... ADD VALUE cannot be executed inside a transaction block in some older PG versions
    # but Alembic usually runs in auto-commit mode for these if outside transaction, or we can just commit before.
    # However, postgres 12+ supports it better.
    op.execute("ALTER TYPE mlops_dvc_profile_status ADD VALUE IF NOT EXISTS 'pending_oauth'")
    op.execute("ALTER TYPE mlops_dvc_profile_status ADD VALUE IF NOT EXISTS 'pending_repo_selection'")
    op.execute("ALTER TYPE mlops_dvc_profile_status ADD VALUE IF NOT EXISTS 'active'")

    op.add_column('dvc_profiles', sa.Column('git_ssh_url', sa.Text(), nullable=True), schema='mlops')
    op.add_column('dvc_profiles', sa.Column('git_repo_owner', sa.String(length=255), nullable=True), schema='mlops')
    op.add_column('dvc_profiles', sa.Column('git_repo_name', sa.String(length=255), nullable=True), schema='mlops')
    op.add_column('dvc_profiles', sa.Column('github_installation_id', sa.BigInteger(), nullable=True), schema='mlops')
    op.add_column('dvc_profiles', sa.Column('github_deploy_key_id', sa.BigInteger(), nullable=True), schema='mlops')
    op.add_column('dvc_profiles', sa.Column('ssh_key_encrypted', sa.LargeBinary(), nullable=True), schema='mlops')
    op.add_column('dvc_profiles', sa.Column('ssh_public_key', sa.Text(), nullable=True), schema='mlops')

def downgrade() -> None:
    op.drop_column('dvc_profiles', 'ssh_public_key', schema='mlops')
    op.drop_column('dvc_profiles', 'ssh_key_encrypted', schema='mlops')
    op.drop_column('dvc_profiles', 'github_deploy_key_id', schema='mlops')
    op.drop_column('dvc_profiles', 'github_installation_id', schema='mlops')
    op.drop_column('dvc_profiles', 'git_repo_name', schema='mlops')
    op.drop_column('dvc_profiles', 'git_repo_owner', schema='mlops')
    op.drop_column('dvc_profiles', 'git_ssh_url', schema='mlops')
    # Note: postgres doesn't support DROP VALUE for enums easily, so we leave the enum values in downgrade

