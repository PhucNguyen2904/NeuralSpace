"""add generated dataset upload metadata fields

Revision ID: 0009_dataset_upload_metadata
Revises: 0008_colab_runtime_tracking
Create Date: 2026-06-17
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0009_dataset_upload_metadata"
down_revision: Union[str, None] = "0008_colab_runtime_tracking"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE mlops_dataset_type ADD VALUE IF NOT EXISTS 'custom'")
    op.add_column("dataset_versions", sa.Column("metadata_uri", sa.String(length=500), nullable=True), schema="mlops")
    op.add_column("dataset_versions", sa.Column("validation_report_uri", sa.String(length=500), nullable=True), schema="mlops")
    op.add_column("dataset_versions", sa.Column("validation_status", sa.String(length=30), nullable=True), schema="mlops")
    op.add_column("dataset_versions", sa.Column("validation_summary", postgresql.JSONB(astext_type=sa.Text()), nullable=True), schema="mlops")
    op.add_column("dataset_versions", sa.Column("metadata_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True), schema="mlops")
    op.add_column("dataset_versions", sa.Column("format", sa.String(length=50), nullable=True), schema="mlops")
    op.add_column("dataset_versions", sa.Column("task_type", sa.String(length=50), nullable=True), schema="mlops")


def downgrade() -> None:
    op.drop_column("dataset_versions", "task_type", schema="mlops")
    op.drop_column("dataset_versions", "format", schema="mlops")
    op.drop_column("dataset_versions", "metadata_snapshot", schema="mlops")
    op.drop_column("dataset_versions", "validation_summary", schema="mlops")
    op.drop_column("dataset_versions", "validation_status", schema="mlops")
    op.drop_column("dataset_versions", "validation_report_uri", schema="mlops")
    op.drop_column("dataset_versions", "metadata_uri", schema="mlops")

