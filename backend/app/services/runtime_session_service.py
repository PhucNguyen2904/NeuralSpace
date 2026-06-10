"""External runtime session lifecycle and authentication."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.security import create_access_token, verify_token
from app.models.runtime_session import ExternalRuntimeSession, RuntimeSessionStatus

DEFAULT_CAPABILITIES = [
    "dataset:read",
    "model:read",
    "run:write",
    "artifact:write",
    "heartbeat:write",
    "model_version:create",
]


@dataclass
class RuntimeIdentity:
    session: ExternalRuntimeSession
    user_id: str


class RuntimeSessionService:
    @staticmethod
    async def create(db: AsyncSession, workspace_id: str, user_id: str) -> ExternalRuntimeSession:
        settings = get_settings()
        expires_at = datetime.now(timezone.utc) + timedelta(
            minutes=max(1, settings.COLAB_RUNTIME_TOKEN_EXPIRE_MINUTES)
        )
        session = ExternalRuntimeSession(
            workspace_id=workspace_id,
            user_id=user_id,
            capabilities=DEFAULT_CAPABILITIES,
            expires_at=expires_at,
        )
        db.add(session)
        await db.flush()
        await db.refresh(session)
        return session

    @staticmethod
    async def connect(db: AsyncSession, session_id: str, user_id: str) -> tuple[ExternalRuntimeSession, str]:
        session = await RuntimeSessionService.get(db, session_id)
        if session is None or session.user_id != user_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Runtime session not found")
        if session.status != RuntimeSessionStatus.CREATED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Runtime session is not launchable")

        now = datetime.now(timezone.utc)
        token_jti = uuid4().hex
        session.status = RuntimeSessionStatus.CONNECTED
        session.connected_at = now
        session.last_heartbeat_at = now
        session.token_jti = token_jti
        token = create_access_token(
            {
                "type": "external_runtime",
                "jti": token_jti,
                "sub": user_id,
                "session_id": session.id,
                "capabilities": session.capabilities,
            },
            expires_delta=session.expires_at - now,
        )
        await db.commit()
        await db.refresh(session)
        return session, token

    @staticmethod
    async def authenticate(db: AsyncSession, token: str) -> RuntimeIdentity:
        try:
            claims = verify_token(token)
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid runtime token") from exc
        if claims.get("type") != "external_runtime":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid runtime token type")

        session = await RuntimeSessionService.get(db, str(claims.get("session_id") or ""))
        now = datetime.now(timezone.utc)
        if (
            session is None
            or session.status != RuntimeSessionStatus.CONNECTED
            or session.token_jti != claims.get("jti")
            or session.expires_at <= now
        ):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Runtime session is inactive")
        return RuntimeIdentity(session=session, user_id=session.user_id)

    @staticmethod
    async def get(db: AsyncSession, session_id: str) -> ExternalRuntimeSession | None:
        result = await db.execute(
            select(ExternalRuntimeSession).where(ExternalRuntimeSession.id == session_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def list_for_workspace(
        db: AsyncSession, workspace_id: str, user_id: str
    ) -> list[ExternalRuntimeSession]:
        result = await db.execute(
            select(ExternalRuntimeSession)
            .where(
                ExternalRuntimeSession.workspace_id == workspace_id,
                ExternalRuntimeSession.user_id == user_id,
            )
            .order_by(ExternalRuntimeSession.created_at.desc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def heartbeat(db: AsyncSession, session: ExternalRuntimeSession) -> ExternalRuntimeSession:
        session.last_heartbeat_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(session)
        return session

    @staticmethod
    async def revoke(
        db: AsyncSession, session: ExternalRuntimeSession, reason: str = "revoked_by_user"
    ) -> ExternalRuntimeSession:
        session.status = RuntimeSessionStatus.REVOKED
        session.revoked_at = datetime.now(timezone.utc)
        session.revoke_reason = reason
        await db.commit()
        await db.refresh(session)
        return session
