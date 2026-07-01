"""align workspaces with external Colab runtime

Revision ID: 0007_colab_workspace_align
Revises: 0006_external_runtime_sessions
Create Date: 2026-06-04
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0007_colab_workspace_align"
down_revision: Union[str, None] = "0006_external_runtime_sessions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE workspaces SET tier = 'external-colab'")
    op.execute(
        """
        UPDATE workspaces AS w
        SET dataset_ids = (
            SELECT COALESCE(jsonb_agg(asset_id ORDER BY asset_id), '[]'::jsonb)
            FROM (
                SELECT DISTINCT asset_id
                FROM (
                    SELECT jsonb_array_elements_text(w.dataset_ids) AS asset_id
                    UNION ALL
                    SELECT wd.dataset_id AS asset_id
                    FROM workspace_datasets AS wd
                    WHERE wd.workspace_id = w.id
                ) AS dataset_assets
            ) AS unique_dataset_assets
        ),
        model_ids = (
            SELECT COALESCE(jsonb_agg(asset_id ORDER BY asset_id), '[]'::jsonb)
            FROM (
                SELECT DISTINCT asset_id
                FROM (
                    SELECT jsonb_array_elements_text(w.model_ids) AS asset_id
                    UNION ALL
                    SELECT wm.model_id AS asset_id
                    FROM workspace_models AS wm
                    WHERE wm.workspace_id = w.id
                ) AS model_assets
            ) AS unique_model_assets
        )
        """
    )
    op.create_check_constraint("ck_workspaces_external_colab_tier", "workspaces", "tier = 'external-colab'")
    op.create_check_constraint("ck_workspaces_dataset_ids_array", "workspaces", "jsonb_typeof(dataset_ids) = 'array'")
    op.create_check_constraint("ck_workspaces_model_ids_array", "workspaces", "jsonb_typeof(model_ids) = 'array'")
    op.create_check_constraint(
        "ck_workspaces_environment_config_object",
        "workspaces",
        "jsonb_typeof(environment_config) = 'object'",
    )

    # Drop old public tables so MLflow can create its own
    op.drop_table("workspace_models")
    op.drop_table("workspace_datasets")
    op.drop_table("models")
    op.drop_table("datasets")


def downgrade() -> None:
    op.drop_constraint("ck_workspaces_environment_config_object", "workspaces", type_="check")
    op.drop_constraint("ck_workspaces_model_ids_array", "workspaces", type_="check")
    op.drop_constraint("ck_workspaces_dataset_ids_array", "workspaces", type_="check")
    op.drop_constraint("ck_workspaces_external_colab_tier", "workspaces", type_="check")
