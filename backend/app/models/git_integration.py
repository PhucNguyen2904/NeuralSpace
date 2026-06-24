"""Git Integration models."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Enum, ForeignKey, String, DateTime, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel

if TYPE_CHECKING:
    from app.models.user import User


git_provider_enum = Enum("github", "gitlab", "bitbucket", name="git_provider_type")


class GitAccount(BaseModel):
    """Represents a connected Git account."""

    __tablename__ = "git_accounts"

    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    provider: Mapped[str] = mapped_column(git_provider_enum, nullable=False)
    username: Mapped[str] = mapped_column(String(255), nullable=False)
    access_token: Mapped[str] = mapped_column(String(1024), nullable=False)
    
    # Relationships
    user: Mapped["User"] = relationship("User")
    repositories: Mapped[list["GitRepository"]] = relationship("GitRepository", back_populates="account", cascade="all, delete-orphan")


class GitRepository(BaseModel):
    """Represents a repository from a connected Git account."""

    __tablename__ = "git_repositories"

    git_account_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("git_accounts.id", ondelete="CASCADE"), nullable=False)
    repo_name: Mapped[str] = mapped_column(String(255), nullable=False)
    repo_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    is_private: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    
    # Tracking fields
    is_tracked: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    tracked_branch: Mapped[str] = mapped_column(String(255), nullable=False, server_default="main")
    last_sync_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sync_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    
    # Relationships
    account: Mapped["GitAccount"] = relationship("GitAccount", back_populates="repositories")


class GitSyncPreference(BaseModel):
    """Represents sync preferences for a user."""

    __tablename__ = "git_sync_preferences"

    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    auto_sync_experiments: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    commit_checkpoints: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    create_pr_on_completion: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    sync_interval: Mapped[int] = mapped_column(Integer, nullable=False, server_default="15")
    
    # Relationships
    user: Mapped["User"] = relationship("User")
