"""create mlops tracking schema and tables

Revision ID: 0005_mlops_tracking_schema
Revises: 0004_user_full_name
Create Date: 2026-05-28 16:20:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql


revision: str = "0005_mlops_tracking_schema"
down_revision: Union[str, None] = "0004_user_full_name"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


dataset_type_enum = sa.Enum("image", "tabular", "text", "audio", "video", name="mlops_dataset_type", create_type=False)
dataset_status_enum = sa.Enum("active", "archived", "deprecated", name="mlops_dataset_status", create_type=False)
dataset_version_status_enum = sa.Enum("draft", "validated", "deprecated", name="mlops_dataset_version_status", create_type=False)
experiment_lifecycle_enum = sa.Enum("active", "deleted", name="mlops_experiment_lifecycle", create_type=False)
run_status_enum = sa.Enum("RUNNING", "SCHEDULED", "FINISHED", "FAILED", "KILLED", name="mlops_run_status", create_type=False)
run_source_type_enum = sa.Enum("NOTEBOOK", "JOB", "PROJECT", "LOCAL", "UNKNOWN", name="mlops_run_source_type", create_type=False)
model_stage_enum = sa.Enum("None", "Staging", "Production", "Archived", name="mlops_model_stage", create_type=False)
model_status_enum = sa.Enum("PENDING_REGISTRATION", "READY", "FAILED", name="mlops_model_status", create_type=False)
link_type_enum = sa.Enum("train", "val", "test", "eval", name="mlops_link_type", create_type=False)
approval_target_stage_enum = sa.Enum("Staging", "Production", name="mlops_approval_target_stage", create_type=False)
approval_status_enum = sa.Enum("pending", "approved", "rejected", "cancelled", name="mlops_approval_status", create_type=False)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    op.execute("CREATE SCHEMA IF NOT EXISTS mlops")

    _ = bind

    op.create_table(
        "datasets",
        sa.Column("id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("type", dataset_type_enum, nullable=False),
        sa.Column("owner_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("team_id", postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column("dvc_repo_url", sa.String(length=500), nullable=True),
        sa.Column("storage_path", sa.String(length=500), nullable=True),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("status", dataset_status_enum, nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
        schema="mlops",
    )

    op.create_table(
        "dataset_versions",
        sa.Column("id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("dataset_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("version", sa.String(length=50), nullable=False),
        sa.Column("dvc_md5", sa.String(length=64), nullable=True),
        sa.Column("dvc_commit", sa.String(length=40), nullable=True),
        sa.Column("git_tag", sa.String(length=100), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("item_count", sa.Integer(), nullable=True),
        sa.Column("schema_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("split_info", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("storage_path", sa.String(length=500), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("changelog", sa.Text(), nullable=True),
        sa.Column("is_latest", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("status", dataset_version_status_enum, nullable=False, server_default="draft"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["dataset_id"], ["mlops.datasets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dataset_id", "version", name="uq_mlops_dataset_versions_dataset_version"),
        schema="mlops",
    )
    op.create_index("ix_mlops_dataset_versions_dvc_md5", "dataset_versions", ["dvc_md5"], schema="mlops")
    op.create_index("ix_mlops_dataset_versions_dvc_commit", "dataset_versions", ["dvc_commit"], schema="mlops")
    op.execute(
        "CREATE UNIQUE INDEX uq_mlops_dataset_versions_latest_per_dataset "
        "ON mlops.dataset_versions(dataset_id) WHERE is_latest = true"
    )

    op.create_table(
        "experiments",
        sa.Column("id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("mlflow_experiment_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("owner_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("team_id", postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("artifact_location", sa.String(length=500), nullable=True),
        sa.Column("lifecycle_stage", experiment_lifecycle_enum, nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("mlflow_experiment_id"),
        schema="mlops",
    )

    op.create_table(
        "runs",
        sa.Column("id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("mlflow_run_id", sa.String(length=32), nullable=False),
        sa.Column("experiment_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("status", run_status_enum, nullable=False),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("artifact_uri", sa.String(length=500), nullable=True),
        sa.Column("source_type", run_source_type_enum, nullable=True),
        sa.Column("source_name", sa.String(length=500), nullable=True),
        sa.Column("git_commit", sa.String(length=40), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("metrics_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("params_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("tags_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("dvc_dataset_version_id", postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column("dvc_md5", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["dvc_dataset_version_id"], ["mlops.dataset_versions.id"]),
        sa.ForeignKeyConstraint(["experiment_id"], ["mlops.experiments.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("mlflow_run_id"),
        schema="mlops",
    )
    op.create_index("ix_mlops_runs_dvc_dataset_version_id", "runs", ["dvc_dataset_version_id"], schema="mlops")

    op.create_table(
        "model_versions",
        sa.Column("id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("mlflow_name", sa.String(length=255), nullable=False),
        sa.Column("mlflow_version", sa.Integer(), nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("stage", model_stage_enum, nullable=False, server_default="None"),
        sa.Column("status", model_status_enum, nullable=False, server_default="PENDING_REGISTRATION"),
        sa.Column("source", sa.String(length=500), nullable=True),
        sa.Column("framework", sa.String(length=50), nullable=True),
        sa.Column("task_type", sa.String(length=50), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("metrics", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("approved_by", postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "(stage <> 'Production') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)",
            name="ck_mlops_model_versions_prod_requires_approval",
        ),
        sa.ForeignKeyConstraint(["approved_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["run_id"], ["mlops.runs.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("mlflow_name", "mlflow_version", name="uq_mlops_model_versions_mlflow_name_version"),
        schema="mlops",
    )
    op.create_index("ix_mlops_model_versions_stage", "model_versions", ["stage"], schema="mlops")

    op.create_table(
        "model_dataset_links",
        sa.Column("id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("model_version_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("dataset_version_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("link_type", link_type_enum, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_by", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["dataset_version_id"], ["mlops.dataset_versions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["model_version_id"], ["mlops.model_versions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "model_version_id",
            "dataset_version_id",
            "link_type",
            name="uq_mlops_model_dataset_links_model_dataset_type",
        ),
        schema="mlops",
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("entity_type", sa.String(length=50), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("action", sa.String(length=50), nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("actor_role", sa.String(length=50), nullable=True),
        sa.Column("old_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("new_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema="mlops",
    )
    op.create_index(
        "ix_mlops_audit_logs_entity_entity_id_created",
        "audit_logs",
        ["entity_type", "entity_id", "created_at"],
        schema="mlops",
    )

    op.create_table(
        "approval_requests",
        sa.Column("id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("model_version_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("requested_by", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("target_stage", approval_target_stage_enum, nullable=False),
        sa.Column("status", approval_status_enum, nullable=False, server_default="pending"),
        sa.Column("reviewer_id", postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column("auto_approved", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["model_version_id"], ["mlops.model_versions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requested_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["reviewer_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema="mlops",
    )
    op.create_index(
        "ix_mlops_approval_requests_model_version_status",
        "approval_requests",
        ["model_version_id", "status"],
        schema="mlops",
    )

    # append-only audit logs
    op.execute(
        """
        CREATE OR REPLACE FUNCTION mlops.prevent_audit_logs_mutation()
        RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'mlops.audit_logs is append-only: % not allowed', TG_OP;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_mlops_audit_logs_no_update
        BEFORE UPDATE ON mlops.audit_logs
        FOR EACH ROW
        EXECUTE FUNCTION mlops.prevent_audit_logs_mutation();
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_mlops_audit_logs_no_delete
        BEFORE DELETE ON mlops.audit_logs
        FOR EACH ROW
        EXECUTE FUNCTION mlops.prevent_audit_logs_mutation();
        """
    )

    # optional FK to teams.id if table exists
    if inspector.has_table("teams"):
        op.create_foreign_key(
            "fk_mlops_datasets_team_id_teams",
            "datasets",
            "teams",
            ["team_id"],
            ["id"],
            source_schema="mlops",
        )
        op.create_foreign_key(
            "fk_mlops_experiments_team_id_teams",
            "experiments",
            "teams",
            ["team_id"],
            ["id"],
            source_schema="mlops",
        )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_mlops_audit_logs_no_delete ON mlops.audit_logs")
    op.execute("DROP TRIGGER IF EXISTS trg_mlops_audit_logs_no_update ON mlops.audit_logs")
    op.execute("DROP FUNCTION IF EXISTS mlops.prevent_audit_logs_mutation")

    op.drop_index("ix_mlops_approval_requests_model_version_status", table_name="approval_requests", schema="mlops")
    op.drop_table("approval_requests", schema="mlops")

    op.drop_index("ix_mlops_audit_logs_entity_entity_id_created", table_name="audit_logs", schema="mlops")
    op.drop_table("audit_logs", schema="mlops")

    op.drop_table("model_dataset_links", schema="mlops")

    op.drop_index("ix_mlops_model_versions_stage", table_name="model_versions", schema="mlops")
    op.drop_table("model_versions", schema="mlops")

    op.drop_index("ix_mlops_runs_dvc_dataset_version_id", table_name="runs", schema="mlops")
    op.drop_table("runs", schema="mlops")

    op.drop_table("experiments", schema="mlops")

    op.execute("DROP INDEX IF EXISTS mlops.uq_mlops_dataset_versions_latest_per_dataset")
    op.drop_index("ix_mlops_dataset_versions_dvc_commit", table_name="dataset_versions", schema="mlops")
    op.drop_index("ix_mlops_dataset_versions_dvc_md5", table_name="dataset_versions", schema="mlops")
    op.drop_table("dataset_versions", schema="mlops")

    op.drop_table("datasets", schema="mlops")

    for enum_name in (
        "mlops_approval_status",
        "mlops_approval_target_stage",
        "mlops_link_type",
        "mlops_model_status",
        "mlops_model_stage",
        "mlops_run_source_type",
        "mlops_run_status",
        "mlops_experiment_lifecycle",
        "mlops_dataset_version_status",
        "mlops_dataset_status",
        "mlops_dataset_type",
    ):
        sa.Enum(name=enum_name).drop(op.get_bind(), checkfirst=True)

    op.execute("DROP SCHEMA IF EXISTS mlops")
