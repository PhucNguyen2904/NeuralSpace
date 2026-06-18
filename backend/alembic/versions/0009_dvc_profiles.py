"""add configurable DVC storage profiles

Revision ID: 0009_dvc_profiles
Revises: 0008_colab_runtime_tracking
Create Date: 2026-06-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0009_dvc_profiles"
down_revision: Union[str, None] = "0008_colab_runtime_tracking"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


dvc_profile_scope_enum = sa.Enum("global", "team", "user", "workspace", name="mlops_dvc_profile_scope")
dvc_profile_status_enum = sa.Enum("ready", "inactive", "error", name="mlops_dvc_profile_status")
dvc_profile_repo_mode_enum = sa.Enum("managed_git", "existing_path", name="mlops_dvc_profile_repo_mode")


def upgrade() -> None:
    dvc_profile_scope_enum.create(op.get_bind(), checkfirst=True)
    dvc_profile_status_enum.create(op.get_bind(), checkfirst=True)
    dvc_profile_repo_mode_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "dvc_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("scope", dvc_profile_scope_enum, server_default="global", nullable=False),
        sa.Column("scope_id", sa.String(length=64), nullable=True),
        sa.Column("repo_mode", dvc_profile_repo_mode_enum, server_default="managed_git", nullable=False),
        sa.Column("git_repo_url", sa.String(length=500), nullable=True),
        sa.Column("git_branch", sa.String(length=100), server_default="main", nullable=False),
        sa.Column("repo_path", sa.String(length=500), nullable=False),
        sa.Column("remote_name", sa.String(length=100), server_default="minio", nullable=False),
        sa.Column("remote_url", sa.String(length=500), nullable=True),
        sa.Column("endpoint_url", sa.String(length=500), nullable=True),
        sa.Column("is_default", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("status", dvc_profile_status_enum, server_default="ready", nullable=False),
        sa.Column("status_message", sa.Text(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", "scope", "scope_id", name="uq_mlops_dvc_profiles_name_scope"),
        schema="mlops",
    )
    op.create_index("ix_mlops_dvc_profiles_scope", "dvc_profiles", ["scope", "scope_id"], schema="mlops")

    op.add_column(
        "datasets",
        sa.Column("dvc_profile_id", postgresql.UUID(as_uuid=False), nullable=True),
        schema="mlops",
    )
    op.add_column(
        "dataset_versions",
        sa.Column("dvc_profile_id", postgresql.UUID(as_uuid=False), nullable=True),
        schema="mlops",
    )
    op.create_foreign_key(
        "fk_mlops_datasets_dvc_profile_id",
        "datasets",
        "dvc_profiles",
        ["dvc_profile_id"],
        ["id"],
        source_schema="mlops",
        referent_schema="mlops",
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_mlops_dataset_versions_dvc_profile_id",
        "dataset_versions",
        "dvc_profiles",
        ["dvc_profile_id"],
        ["id"],
        source_schema="mlops",
        referent_schema="mlops",
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_mlops_dataset_versions_dvc_profile_id", "dataset_versions", schema="mlops", type_="foreignkey")
    op.drop_constraint("fk_mlops_datasets_dvc_profile_id", "datasets", schema="mlops", type_="foreignkey")
    op.drop_column("dataset_versions", "dvc_profile_id", schema="mlops")
    op.drop_column("datasets", "dvc_profile_id", schema="mlops")

    op.drop_index("ix_mlops_dvc_profiles_scope", table_name="dvc_profiles", schema="mlops")
    op.drop_table("dvc_profiles", schema="mlops")
    dvc_profile_repo_mode_enum.drop(op.get_bind(), checkfirst=True)
    dvc_profile_status_enum.drop(op.get_bind(), checkfirst=True)
    dvc_profile_scope_enum.drop(op.get_bind(), checkfirst=True)
