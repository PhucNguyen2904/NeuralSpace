"""add git integration

Revision ID: 6a1b2c3d4e5f
Revises: dfe7f8b43b50

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '6a1b2c3d4e5f'
down_revision: Union[str, None] = 'dfe7f8b43b50'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('git_accounts',
    sa.Column('id', sa.UUID(as_uuid=False), nullable=False),
    sa.Column('user_id', sa.UUID(as_uuid=False), nullable=False),
    sa.Column('provider', sa.Enum('github', 'gitlab', 'bitbucket', name='git_provider_type'), nullable=False),
    sa.Column('username', sa.String(length=255), nullable=False),
    sa.Column('access_token', sa.String(length=1024), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    
    op.create_table('git_repositories',
    sa.Column('id', sa.UUID(as_uuid=False), nullable=False),
    sa.Column('git_account_id', sa.UUID(as_uuid=False), nullable=False),
    sa.Column('repo_name', sa.String(length=255), nullable=False),
    sa.Column('repo_url', sa.String(length=1024), nullable=False),
    sa.Column('is_private', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['git_account_id'], ['git_accounts.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('git_repositories')
    op.drop_table('git_accounts')
    op.execute('DROP TYPE git_provider_type')
