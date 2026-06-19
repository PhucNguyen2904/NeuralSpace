"""User repository helpers."""

from __future__ import annotations

from uuid import uuid4

from sqlalchemy import Select, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


class UserRepository:
    """User data access layer."""

    @staticmethod
    async def get_by_email(db: AsyncSession, email: str) -> User | None:
        stmt: Select[tuple[User]] = select(User).where(func.lower(User.email) == email.lower())
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_id(db: AsyncSession, user_id: str) -> User | None:
        stmt: Select[tuple[User]] = select(User).where(User.id == user_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def update_full_name(db: AsyncSession, user_id: str, full_name: str) -> None:
        stmt = update(User).where(User.id == user_id).values(full_name=full_name.strip())
        await db.execute(stmt)

    @staticmethod
    async def create(db: AsyncSession, email: str, password_hash: str, full_name: str | None = None) -> User:
        user = User(
            id=str(uuid4()),
            email=email.lower().strip(),
            full_name=full_name.strip() if full_name else None,
            password_hash=password_hash,
        )
        db.add(user)
        await db.flush()
        return user
