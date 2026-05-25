"""add datasets and models tables

Revision ID: 0002_ds_models
Revises: 0001_create_workspace_tables
Create Date: 2026-05-25 17:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0002_ds_models"
down_revision: Union[str, None] = "0001_create_workspace_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "datasets",
        sa.Column("id", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("dataset_type", sa.String(length=30), nullable=False, server_default="generic"),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="ready"),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("item_count", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("label_status", sa.String(length=30), nullable=True),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("storage_path", sa.String(length=512), nullable=True),
        sa.Column("created_by", sa.String(length=64), nullable=True),
        sa.Column(
            "source_payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_datasets_type_status", "datasets", ["dataset_type", "status"], unique=False)
    op.create_index("ix_datasets_name_trgm", "datasets", ["name"], unique=False)

    op.create_table(
        "models",
        sa.Column("id", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("architecture", sa.String(length=120), nullable=True),
        sa.Column("framework", sa.String(length=40), nullable=False, server_default="generic"),
        sa.Column("task_type", sa.String(length=80), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="ready"),
        sa.Column("version", sa.String(length=40), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("parameter_count", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("primary_metric_name", sa.String(length=60), nullable=True),
        sa.Column("primary_metric_value", sa.Float(), nullable=True),
        sa.Column(
            "all_metrics",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("storage_path", sa.String(length=512), nullable=True),
        sa.Column("created_by", sa.String(length=64), nullable=True),
        sa.Column(
            "source_payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_models_framework_status", "models", ["framework", "status"], unique=False)
    op.create_index("ix_models_name", "models", ["name"], unique=False)

    op.create_table(
        "workspace_datasets",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("workspace_id", sa.String(length=20), nullable=False),
        sa.Column("dataset_id", sa.String(length=50), nullable=False),
        sa.Column("mount_path", sa.String(length=255), nullable=False),
        sa.Column("mounted_by", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", "dataset_id", name="uq_workspace_dataset"),
    )
    op.create_index("ix_workspace_datasets_workspace_id", "workspace_datasets", ["workspace_id"], unique=False)
    op.create_index("ix_workspace_datasets_dataset_id", "workspace_datasets", ["dataset_id"], unique=False)

    op.create_table(
        "workspace_models",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("workspace_id", sa.String(length=20), nullable=False),
        sa.Column("model_id", sa.String(length=50), nullable=False),
        sa.Column("mount_path", sa.String(length=255), nullable=False),
        sa.Column("mounted_by", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["model_id"], ["models.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", "model_id", name="uq_workspace_model"),
    )
    op.create_index("ix_workspace_models_workspace_id", "workspace_models", ["workspace_id"], unique=False)
    op.create_index("ix_workspace_models_model_id", "workspace_models", ["model_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_workspace_models_model_id", table_name="workspace_models")
    op.drop_index("ix_workspace_models_workspace_id", table_name="workspace_models")
    op.drop_table("workspace_models")

    op.drop_index("ix_workspace_datasets_dataset_id", table_name="workspace_datasets")
    op.drop_index("ix_workspace_datasets_workspace_id", table_name="workspace_datasets")
    op.drop_table("workspace_datasets")

    op.drop_index("ix_models_name", table_name="models")
    op.drop_index("ix_models_framework_status", table_name="models")
    op.drop_table("models")

    op.drop_index("ix_datasets_name_trgm", table_name="datasets")
    op.drop_index("ix_datasets_type_status", table_name="datasets")
    op.drop_table("datasets")

