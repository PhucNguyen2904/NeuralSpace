"""Cloud Storage Integration — Full schema upgrade

Adds:
  - storage_connections: credential_type, credential_expires_at, status_message,
                         last_validated_at, total_bytes_synced columns
  - sync_jobs table
  - storage_audit_logs table

Revision ID: 0012_cloud_storage_integration
Revises: 5e23d17f8b5b
Create Date: 2026-07-13
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0012_cloud_storage_integration"
down_revision: Union[str, None] = "5e23d17f8b5b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── storage_connections: new columns ──────────────────────────────────
    op.add_column(
        "storage_connections",
        sa.Column("credential_type", sa.String(50), nullable=True),
    )
    op.add_column(
        "storage_connections",
        sa.Column("credential_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "storage_connections",
        sa.Column("status_message", sa.Text(), nullable=True),
    )
    op.add_column(
        "storage_connections",
        sa.Column("last_validated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "storage_connections",
        sa.Column(
            "total_bytes_synced",
            sa.BigInteger(),
            nullable=False,
            server_default="0",
        ),
    )

    # Index cho TokenManager query
    op.create_index(
        "idx_storage_connections_expires",
        "storage_connections",
        ["credential_expires_at"],
        postgresql_where=sa.text(
            "credential_expires_at IS NOT NULL AND status = 'connected'"
        ),
    )

    # ── sync_jobs table ───────────────────────────────────────────────────
    op.create_table(
        "sync_jobs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=False),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "connection_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("storage_connections.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("job_type", sa.String(50), nullable=False),
        sa.Column("source_path", sa.Text(), nullable=True),
        sa.Column("dest_path", sa.Text(), nullable=True),
        sa.Column(
            "params",
            postgresql.JSONB(),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "status",
            sa.String(50),
            nullable=False,
            server_default="pending",
        ),
        sa.Column(
            "priority",
            sa.SmallInteger(),
            nullable=False,
            server_default="5",
        ),
        sa.Column("task_id", sa.String(255), nullable=True),
        sa.Column("progress_pct", sa.SmallInteger(), nullable=True),
        sa.Column("bytes_transferred", sa.BigInteger(), nullable=True),
        sa.Column("files_transferred", sa.Integer(), nullable=True),
        sa.Column(
            "scheduled_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("result_summary", postgresql.JSONB(), nullable=True),
        sa.Column(
            "retry_count",
            sa.SmallInteger(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "max_retries",
            sa.SmallInteger(),
            nullable=False,
            server_default="3",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_index("idx_sync_jobs_user_status", "sync_jobs", ["user_id", "status"])
    op.create_index(
        "idx_sync_jobs_pending",
        "sync_jobs",
        ["scheduled_at"],
        postgresql_where=sa.text("status = 'pending'"),
    )

    # ── storage_audit_logs table ──────────────────────────────────────────
    op.create_table(
        "storage_audit_logs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=False),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "connection_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("storage_connections.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("resource_path", sa.Text(), nullable=True),
        sa.Column("resource_size", sa.BigInteger(), nullable=True),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="success",
        ),
        sa.Column("error_code", sa.String(100), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "metadata",
            postgresql.JSONB(),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("ip_address", sa.Text(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_index(
        "idx_audit_logs_user_created",
        "storage_audit_logs",
        ["user_id", sa.text("created_at DESC")],
    )
    op.create_index(
        "idx_audit_logs_connection",
        "storage_audit_logs",
        ["connection_id"],
    )


def downgrade() -> None:
    # Drop tables
    op.drop_index("idx_audit_logs_connection", "storage_audit_logs")
    op.drop_index("idx_audit_logs_user_created", "storage_audit_logs")
    op.drop_table("storage_audit_logs")

    op.drop_index("idx_sync_jobs_pending", "sync_jobs")
    op.drop_index("idx_sync_jobs_user_status", "sync_jobs")
    op.drop_table("sync_jobs")

    # Drop new columns from storage_connections
    op.drop_index("idx_storage_connections_expires", "storage_connections")
    op.drop_column("storage_connections", "total_bytes_synced")
    op.drop_column("storage_connections", "last_validated_at")
    op.drop_column("storage_connections", "status_message")
    op.drop_column("storage_connections", "credential_expires_at")
    op.drop_column("storage_connections", "credential_type")
