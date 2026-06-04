"""add external runtime sessions

Revision ID: 0006_external_runtime_sessions
Revises: 0005_mlops_tracking_schema
Create Date: 2026-06-04
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0006_external_runtime_sessions"
down_revision: Union[str, None] = "0005_mlops_tracking_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # PostgreSQL requires a newly-added enum value to be committed before it is used.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE workspace_status ADD VALUE IF NOT EXISTS 'READY' BEFORE 'PROVISIONING'")
    op.execute("ALTER TABLE workspaces ALTER COLUMN status SET DEFAULT 'READY'")
    op.execute("UPDATE workspaces SET status = 'READY' WHERE status = 'PROVISIONING'")
    runtime_status = postgresql.ENUM(
        "CREATED",
        "CONNECTED",
        "REVOKED",
        "EXPIRED",
        name="runtime_session_status",
        create_type=False,
    )
    runtime_status.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "external_runtime_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("workspace_id", sa.String(length=20), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("provider", sa.String(length=30), server_default="google_colab", nullable=False),
        sa.Column("status", runtime_status, server_default="CREATED", nullable=False),
        sa.Column("token_jti", sa.String(length=64), nullable=True),
        sa.Column("capabilities", postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("connected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoke_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_jti"),
    )
    op.create_index("ix_runtime_sessions_user_status", "external_runtime_sessions", ["user_id", "status"])
    op.create_index(
        "ix_runtime_sessions_workspace_created",
        "external_runtime_sessions",
        ["workspace_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_runtime_sessions_workspace_created", table_name="external_runtime_sessions")
    op.drop_index("ix_runtime_sessions_user_status", table_name="external_runtime_sessions")
    op.drop_table("external_runtime_sessions")
    postgresql.ENUM(name="runtime_session_status").drop(op.get_bind(), checkfirst=True)
    op.execute("ALTER TABLE workspaces ALTER COLUMN status SET DEFAULT 'PROVISIONING'")
