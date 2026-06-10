"""link Colab runtime sessions to runs and logs

Revision ID: 0008_colab_runtime_tracking
Revises: 0007_colab_workspace_align
Create Date: 2026-06-04
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0008_colab_runtime_tracking"
down_revision: Union[str, None] = "0007_colab_workspace_align"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("runs", sa.Column("workspace_id", sa.String(length=20), nullable=True), schema="mlops")
    op.add_column(
        "runs",
        sa.Column("runtime_session_id", postgresql.UUID(as_uuid=False), nullable=True),
        schema="mlops",
    )
    op.create_foreign_key(
        "fk_mlops_runs_workspace_id",
        "runs",
        "workspaces",
        ["workspace_id"],
        ["id"],
        source_schema="mlops",
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_mlops_runs_runtime_session_id",
        "runs",
        "external_runtime_sessions",
        ["runtime_session_id"],
        ["id"],
        source_schema="mlops",
        ondelete="SET NULL",
    )
    op.create_index("ix_mlops_runs_runtime_session_created", "runs", ["runtime_session_id", "created_at"], schema="mlops")

    op.create_table(
        "run_logs",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("runtime_session_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("level", sa.String(length=10), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["mlops.runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["runtime_session_id"], ["external_runtime_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema="mlops",
    )
    op.create_index("ix_mlops_run_logs_run_created", "run_logs", ["run_id", "created_at"], schema="mlops")


def downgrade() -> None:
    op.drop_index("ix_mlops_run_logs_run_created", table_name="run_logs", schema="mlops")
    op.drop_table("run_logs", schema="mlops")
    op.drop_index("ix_mlops_runs_runtime_session_created", table_name="runs", schema="mlops")
    op.drop_constraint("fk_mlops_runs_runtime_session_id", "runs", schema="mlops", type_="foreignkey")
    op.drop_constraint("fk_mlops_runs_workspace_id", "runs", schema="mlops", type_="foreignkey")
    op.drop_column("runs", "runtime_session_id", schema="mlops")
    op.drop_column("runs", "workspace_id", schema="mlops")
