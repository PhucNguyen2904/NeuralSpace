"""create workspace tables

Revision ID: 0001_create_workspace_tables
Revises:
Create Date: 2026-05-19 16:30:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001_create_workspace_tables"
down_revision: Union[str, None] = "0000_init_users"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


workspace_status_enum = sa.Enum(
    "PROVISIONING",
    "RUNNING",
    "STOPPING",
    "STOPPED",
    "ERROR",
    name="workspace_status",
)


def upgrade() -> None:
    op.create_table(
        "workspaces",
        sa.Column("id", sa.String(length=20), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("status", workspace_status_enum, nullable=False, server_default="PROVISIONING"),
        sa.Column("tier", sa.String(length=30), nullable=False),
        sa.Column("k8s_namespace", sa.String(length=63), nullable=True),
        sa.Column("k8s_pod_name", sa.String(length=63), nullable=True),
        sa.Column("pod_ip", sa.String(length=45), nullable=True),
        sa.Column("access_url", sa.Text(), nullable=True),
        sa.Column("jupyter_token_hash", sa.String(length=64), nullable=True),
        sa.Column("dataset_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("model_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column(
            "environment_config",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "resource_config",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("stopped_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_heartbeat", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_kernel_activity", sa.DateTime(timezone=True), nullable=True),
        sa.Column("auto_kill_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_workspaces_user_id", "workspaces", ["user_id"], unique=False)
    op.create_index("ix_workspaces_user_id_status", "workspaces", ["user_id", "status"], unique=False)
    op.create_index(
        "ix_workspaces_status_auto_kill_at_running",
        "workspaces",
        ["status", "auto_kill_at"],
        unique=False,
        postgresql_where=sa.text("status = 'RUNNING'"),
    )
    op.create_index("ix_workspaces_k8s_namespace_lookup", "workspaces", ["k8s_namespace"], unique=False)

    op.create_table(
        "workspace_events",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("workspace_id", sa.String(length=20), nullable=False),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("actor", sa.String(length=50), nullable=False),
        sa.Column(
            "details",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_workspace_events_workspace_id", "workspace_events", ["workspace_id"], unique=False)
    op.create_index(
        "ix_workspace_events_workspace_id_created_at_desc",
        "workspace_events",
        ["workspace_id", sa.text("created_at DESC")],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_workspace_events_workspace_id_created_at_desc", table_name="workspace_events")
    op.drop_index("ix_workspace_events_workspace_id", table_name="workspace_events")
    op.drop_table("workspace_events")

    op.drop_index("ix_workspaces_k8s_namespace_lookup", table_name="workspaces")
    op.drop_index("ix_workspaces_status_auto_kill_at_running", table_name="workspaces")
    op.drop_index("ix_workspaces_user_id_status", table_name="workspaces")
    op.drop_index("ix_workspaces_user_id", table_name="workspaces")
    op.drop_table("workspaces")

    workspace_status_enum.drop(op.get_bind(), checkfirst=True)
