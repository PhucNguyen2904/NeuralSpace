"""merge 0009_dvc_profiles and 0009_dataset_upload_metadata branches

Revision ID: 0010_merge_0009_branches
Revises: 0009_dvc_profiles, 0009_dataset_upload_metadata
Create Date: 2026-06-18

"""

from typing import Sequence, Union


revision: str = "0010_merge_0009_branches"
down_revision: Union[str, tuple, None] = (
    "0009_dvc_profiles",
    "0009_dataset_upload_metadata",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
