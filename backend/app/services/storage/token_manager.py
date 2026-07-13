"""
Token Manager — Quản lý vòng đời OAuth2 tokens.

Chạy dưới 2 chế độ:
  1. Inline (trong request): ensure_valid() — refresh ngay khi token sắp hết hạn
  2. Background (scheduled job): bulk_refresh_expiring() — pre-emptive refresh

Đảm bảo user không bao giờ gặp lỗi 401 chỉ vì token expired.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.storage_connection import StorageConnection
from app.services.storage.auth.base_auth import AuthCredential
from app.core.storage_exceptions import TokenRefreshFailed, CredentialExpired

logger = logging.getLogger(__name__)

# Refresh token trước bao nhiêu giây khi sắp hết hạn
REFRESH_BUFFER_SECONDS = 300  # 5 phút


class TokenManager:
    """
    Quản lý vòng đời của OAuth2 tokens.

    Inject vào StorageService, gọi ensure_valid() trước mỗi storage operation.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def ensure_valid(self, connection: StorageConnection) -> StorageConnection:
        """
        Đảm bảo credential của connection còn hợp lệ.

        Gọi trước MỌI storage operation. Nếu token sắp hết hạn → refresh.

        Args:
            connection: StorageConnection từ DB

        Returns:
            connection với credential đã được refresh nếu cần

        Raises:
            CredentialExpired: nếu không thể refresh (không có refresh_token hoặc refresh_token hết hạn)
        """
        if not connection.encrypted_credentials:
            return connection  # Không có credential → không cần check (có thể dùng system config)

        if connection.credential_type not in ("oauth2",):
            return connection  # Chỉ OAuth2 mới cần refresh

        # Kiểm tra expires_at
        if connection.credential_expires_at is None:
            return connection  # Không có expiry info → không refresh

        now = datetime.now(timezone.utc)
        expires_at = connection.credential_expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

        # Còn đủ thời gian — không cần refresh
        if now < expires_at - timedelta(seconds=REFRESH_BUFFER_SECONDS):
            return connection

        # Token đã hết hạn hoàn toàn và không có khả năng refresh
        if now > expires_at + timedelta(hours=1):
            # Hết hạn quá lâu — có thể refresh token cũng đã mất hiệu lực
            logger.warning(
                "Token expired too long ago, may not be refreshable",
                connection_id=connection.id,
                provider=connection.provider,
                expired_at=expires_at.isoformat(),
            )

        # Thử refresh
        logger.info(
            "Token expiring soon, refreshing",
            connection_id=connection.id,
            provider=connection.provider,
            expires_at=expires_at.isoformat(),
        )

        try:
            connection = await self._refresh_connection_token(connection)
        except TokenRefreshFailed as e:
            # Đánh dấu connection là expired trong DB
            connection.status = "expired"
            connection.status_message = str(e)
            await self.db.commit()
            raise CredentialExpired(connection.provider, connection.id)
        except Exception as e:
            logger.error(
                "Unexpected error during token refresh",
                connection_id=connection.id,
                error=str(e),
            )
            raise TokenRefreshFailed(connection.provider, str(e))

        return connection

    async def _refresh_connection_token(self, connection: StorageConnection) -> StorageConnection:
        """
        Thực hiện token refresh và cập nhật DB.

        Returns:
            connection với credential mới
        """
        from app.services.storage.auth.base_auth import AuthCredential
        from app.services.storage.auth.oauth2_strategy import OAuth2AuthStrategy

        # Decrypt credential hiện tại
        cred = AuthCredential.from_encrypted_blob(connection.encrypted_credentials)

        # Refresh
        strategy = OAuth2AuthStrategy(connection.provider)
        new_cred = await strategy.refresh(cred)

        # Update DB
        connection.encrypted_credentials = new_cred.to_encrypted_blob()
        connection.credential_expires_at = new_cred.expires_at
        connection.status = "connected"
        connection.status_message = None

        await self.db.commit()
        await self.db.refresh(connection)

        # Rewrite rclone.conf để reflect token mới
        await self._rewrite_rclone_config(connection, new_cred)

        return connection

    async def _rewrite_rclone_config(
        self, connection: StorageConnection, cred: AuthCredential
    ) -> None:
        """Tái tạo section trong rclone.conf từ credential mới."""
        import os
        import configparser

        config_path = connection.config_path
        if not config_path:
            return

        os.makedirs(os.path.dirname(config_path), exist_ok=True)

        config = configparser.ConfigParser()
        if os.path.exists(config_path):
            config.read(config_path)

        remote_name = connection.remote_name
        if not config.has_section(remote_name):
            config.add_section(remote_name)

        config.set(remote_name, "type", connection.provider)
        for key, value in cred.raw_params.items():
            config.set(remote_name, key, str(value))

        with open(config_path, "w") as f:
            config.write(f)

        logger.debug(
            "Rewrote rclone.conf after token refresh",
            connection_id=connection.id,
            config_path=config_path,
        )

    async def bulk_refresh_expiring(self, lookahead_minutes: int = 60) -> int:
        """
        Pre-emptive refresh cho tất cả tokens sắp hết hạn.

        Dùng cho background scheduled job (chạy mỗi 15-30 phút).

        Args:
            lookahead_minutes: Refresh tokens sẽ hết hạn trong X phút tới.

        Returns:
            Số connections đã được refresh thành công.
        """
        now = datetime.now(timezone.utc)
        refresh_before = now + timedelta(minutes=lookahead_minutes)

        stmt = select(StorageConnection).where(
            StorageConnection.credential_type == "oauth2",
            StorageConnection.status == "connected",
            StorageConnection.credential_expires_at.isnot(None),
            StorageConnection.credential_expires_at <= refresh_before,
            StorageConnection.encrypted_credentials.isnot(None),
        )

        result = await self.db.execute(stmt)
        connections = result.scalars().all()

        if not connections:
            return 0

        logger.info(f"Found {len(connections)} connections with expiring tokens")

        refreshed = 0
        for conn in connections:
            try:
                await self._refresh_connection_token(conn)
                refreshed += 1
                logger.info(
                    "Background token refresh succeeded",
                    connection_id=conn.id,
                    provider=conn.provider,
                )
            except Exception as e:
                logger.warning(
                    "Background token refresh failed",
                    connection_id=conn.id,
                    provider=conn.provider,
                    error=str(e),
                )

        return refreshed
