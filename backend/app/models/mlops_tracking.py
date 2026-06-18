"""MLOps tracking models for DVC + MLflow integration (schema: mlops)."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


dataset_type_enum = Enum("image", "tabular", "text", "audio", "video", "custom", name="mlops_dataset_type")
dataset_status_enum = Enum("active", "archived", "deprecated", name="mlops_dataset_status")
dataset_version_status_enum = Enum("draft", "validated", "deprecated", name="mlops_dataset_version_status")
experiment_lifecycle_enum = Enum("active", "deleted", name="mlops_experiment_lifecycle")
run_status_enum = Enum("RUNNING", "SCHEDULED", "FINISHED", "FAILED", "KILLED", name="mlops_run_status")
run_source_type_enum = Enum("NOTEBOOK", "JOB", "PROJECT", "LOCAL", "UNKNOWN", name="mlops_run_source_type")
model_stage_enum = Enum("None", "Staging", "Production", "Archived", name="mlops_model_stage")
model_status_enum = Enum("PENDING_REGISTRATION", "READY", "FAILED", name="mlops_model_status")
link_type_enum = Enum("train", "val", "test", "eval", name="mlops_link_type")
approval_target_stage_enum = Enum("Staging", "Production", name="mlops_approval_target_stage")
approval_status_enum = Enum("pending", "approved", "rejected", "cancelled", name="mlops_approval_status")
dvc_profile_scope_enum = Enum("global", "team", "user", "workspace", name="mlops_dvc_profile_scope")
dvc_profile_status_enum = Enum("ready", "inactive", "error", name="mlops_dvc_profile_status")
dvc_profile_repo_mode_enum = Enum("managed_git", "existing_path", name="mlops_dvc_profile_repo_mode")


class DVCProfile(Base):
    __tablename__ = "dvc_profiles"
    __table_args__ = (
        UniqueConstraint("name", "scope", "scope_id", name="uq_mlops_dvc_profiles_name_scope"),
        Index("ix_mlops_dvc_profiles_scope", "scope", "scope_id"),
        {"schema": "mlops"},
    )

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    scope: Mapped[str] = mapped_column(dvc_profile_scope_enum, nullable=False, server_default="global")
    scope_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    repo_mode: Mapped[str] = mapped_column(dvc_profile_repo_mode_enum, nullable=False, server_default="managed_git")
    git_repo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    git_branch: Mapped[str] = mapped_column(String(100), nullable=False, server_default="main")
    repo_path: Mapped[str] = mapped_column(String(500), nullable=False)
    remote_name: Mapped[str] = mapped_column(String(100), nullable=False, server_default="minio")
    remote_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    endpoint_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    status: Mapped[str] = mapped_column(dvc_profile_status_enum, nullable=False, server_default="ready")
    status_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now(), onupdate=func.now())


class MLDataset(Base):
    __tablename__ = "datasets"
    __table_args__ = {"schema": "mlops"}

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    type: Mapped[str] = mapped_column(dataset_type_enum, nullable=False)
    owner_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    team_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    dvc_profile_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("mlops.dvc_profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    dvc_repo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    storage_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    tags: Mapped[list] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    status: Mapped[str] = mapped_column(dataset_status_enum, nullable=False, server_default="active")
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now(), onupdate=func.now())


class DatasetVersion(Base):
    __tablename__ = "dataset_versions"
    __table_args__ = (
        UniqueConstraint("dataset_id", "version", name="uq_mlops_dataset_versions_dataset_version"),
        Index("ix_mlops_dataset_versions_dvc_md5", "dvc_md5"),
        Index("ix_mlops_dataset_versions_dvc_commit", "dvc_commit"),
        {"schema": "mlops"},
    )

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    dataset_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("mlops.datasets.id", ondelete="CASCADE"),
        nullable=False,
    )
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    dvc_md5: Mapped[str | None] = mapped_column(String(64), nullable=True)
    dvc_commit: Mapped[str | None] = mapped_column(String(40), nullable=True)
    dvc_profile_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("mlops.dvc_profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    git_tag: Mapped[str | None] = mapped_column(String(100), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    item_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    schema_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    split_info: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    storage_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    metadata_uri: Mapped[str | None] = mapped_column(String(500), nullable=True)
    validation_report_uri: Mapped[str | None] = mapped_column(String(500), nullable=True)
    validation_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    validation_summary: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    metadata_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    format: Mapped[str | None] = mapped_column(String(50), nullable=True)
    task_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_by: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
    changelog: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_latest: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    status: Mapped[str] = mapped_column(dataset_version_status_enum, nullable=False, server_default="draft")


class Experiment(Base):
    __tablename__ = "experiments"
    __table_args__ = {"schema": "mlops"}

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    mlflow_experiment_id: Mapped[int] = mapped_column(BigInteger, nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    team_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    tags: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    artifact_location: Mapped[str | None] = mapped_column(String(500), nullable=True)
    lifecycle_stage: Mapped[str] = mapped_column(
        experiment_lifecycle_enum,
        nullable=False,
        server_default="active",
    )
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now(), onupdate=func.now())


class Run(Base):
    __tablename__ = "runs"
    __table_args__ = (
        Index("ix_mlops_runs_dvc_dataset_version_id", "dvc_dataset_version_id"),
        {"schema": "mlops"},
    )

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    mlflow_run_id: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    experiment_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("mlops.experiments.id"),
        nullable=False,
    )
    workspace_id: Mapped[str | None] = mapped_column(
        String(20),
        ForeignKey("workspaces.id", ondelete="SET NULL"),
        nullable=True,
    )
    runtime_session_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("external_runtime_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(run_status_enum, nullable=False)
    start_time: Mapped[datetime | None] = mapped_column(nullable=True)
    end_time: Mapped[datetime | None] = mapped_column(nullable=True)
    artifact_uri: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source_type: Mapped[str | None] = mapped_column(run_source_type_enum, nullable=True)
    source_name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    git_commit: Mapped[str | None] = mapped_column(String(40), nullable=True)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    metrics_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    params_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    tags_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    dvc_dataset_version_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("mlops.dataset_versions.id"),
        nullable=True,
    )
    dvc_md5: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())


class RunLog(Base):
    __tablename__ = "run_logs"
    __table_args__ = (
        Index("ix_mlops_run_logs_run_created", "run_id", "created_at"),
        {"schema": "mlops"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("mlops.runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    runtime_session_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("external_runtime_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    level: Mapped[str] = mapped_column(String(10), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())


class ModelVersion(Base):
    __tablename__ = "model_versions"
    __table_args__ = (
        UniqueConstraint("mlflow_name", "mlflow_version", name="uq_mlops_model_versions_mlflow_name_version"),
        Index("ix_mlops_model_versions_stage", "stage"),
        CheckConstraint(
            "(stage <> 'Production') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)",
            name="ck_mlops_model_versions_prod_requires_approval",
        ),
        {"schema": "mlops"},
    )

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    mlflow_name: Mapped[str] = mapped_column(String(255), nullable=False)
    mlflow_version: Mapped[int] = mapped_column(Integer, nullable=False)
    run_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("mlops.runs.id"), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    stage: Mapped[str] = mapped_column(model_stage_enum, nullable=False, server_default="None")
    status: Mapped[str] = mapped_column(model_status_enum, nullable=False, server_default="PENDING_REGISTRATION")
    source: Mapped[str | None] = mapped_column(String(500), nullable=True)
    framework: Mapped[str | None] = mapped_column(String(50), nullable=True)
    task_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    metrics: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    tags: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    approved_by: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_by: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now(), onupdate=func.now())


class ModelDatasetLink(Base):
    __tablename__ = "model_dataset_links"
    __table_args__ = (
        UniqueConstraint(
            "model_version_id",
            "dataset_version_id",
            "link_type",
            name="uq_mlops_model_dataset_links_model_dataset_type",
        ),
        {"schema": "mlops"},
    )

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    model_version_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("mlops.model_versions.id", ondelete="CASCADE"),
        nullable=False,
    )
    dataset_version_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("mlops.dataset_versions.id", ondelete="CASCADE"),
        nullable=False,
    )
    link_type: Mapped[str] = mapped_column(link_type_enum, nullable=False)
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
    created_by: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_mlops_audit_logs_entity_entity_id_created", "entity_type", "entity_id", "created_at"),
        {"schema": "mlops"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    actor_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    actor_role: Mapped[str | None] = mapped_column(String(50), nullable=True)
    old_value: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    new_value: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    metadata_payload: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())


class ApprovalRequest(Base):
    __tablename__ = "approval_requests"
    __table_args__ = (
        Index("ix_mlops_approval_requests_model_version_status", "model_version_id", "status"),
        {"schema": "mlops"},
    )

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    model_version_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("mlops.model_versions.id", ondelete="CASCADE"),
        nullable=False,
    )
    requested_by: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    requested_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
    target_stage: Mapped[str] = mapped_column(approval_target_stage_enum, nullable=False)
    status: Mapped[str] = mapped_column(approval_status_enum, nullable=False, server_default="pending")
    reviewer_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    auto_approved: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    expires_at: Mapped[datetime | None] = mapped_column(nullable=True)
