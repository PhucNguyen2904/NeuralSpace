"""
OAuth2 server-side authentication strategy.

Thực hiện Authorization Code Flow hoàn toàn phía server (headless).
KHÔNG dùng `rclone authorize` vì lệnh đó yêu cầu browser trực tiếp trên máy chạy rclone.

Flow:
  1. build_auth_url() → Frontend redirect user đến provider
  2. Provider redirect về /storage/oauth/callback?code=...&state=...
  3. exchange_code() → {access_token, refresh_token, expires_in}
  4. authenticate() → AuthCredential
  5. TokenManager.ensure_valid() → auto-refresh khi sắp hết hạn
"""

from __future__ import annotations

import json
import logging
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx

from app.services.storage.auth.base_auth import AuthCredential, BaseAuthStrategy
from app.core.storage_exceptions import AuthenticationFailed, TokenRefreshFailed

logger = logging.getLogger(__name__)

# ── Provider OAuth2 configurations ───────────────────────────────────────────

OAUTH2_PROVIDER_CONFIGS: dict[str, dict[str, Any]] = {
    "drive": {
        "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "revoke_url": "https://oauth2.googleapis.com/revoke",
        "scopes": ["https://www.googleapis.com/auth/drive"],
        "client_id_env": "GOOGLE_CLIENT_ID",
        "client_secret_env": "GOOGLE_CLIENT_SECRET",
        "rclone_type": "drive",
        # Params để transform token response → rclone config
        "extra_params": {
            "access_type": "offline",
            "prompt": "consent",  # Bắt buộc để lấy refresh_token mỗi lần
        },
    },
    "onedrive": {
        "auth_url": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        "token_url": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        "revoke_url": None,  # OneDrive không có revoke endpoint public
        "scopes": ["Files.ReadWrite.All", "offline_access"],
        "client_id_env": "ONEDRIVE_CLIENT_ID",
        "client_secret_env": "ONEDRIVE_CLIENT_SECRET",
        "rclone_type": "onedrive",
        "extra_params": {},
    },
    "dropbox": {
        "auth_url": "https://www.dropbox.com/oauth2/authorize",
        "token_url": "https://api.dropboxapi.com/oauth2/token",
        "revoke_url": "https://api.dropboxapi.com/2/auth/token/revoke",
        "scopes": [],  # Dropbox dùng app-level permissions
        "client_id_env": "DROPBOX_APP_KEY",
        "client_secret_env": "DROPBOX_APP_SECRET",
        "rclone_type": "dropbox",
        "extra_params": {
            "token_access_type": "offline",
        },
    },
}


class OAuth2AuthStrategy(BaseAuthStrategy):
    """
    Server-side OAuth2 Authorization Code Flow.

    Không phụ thuộc vào browser trên máy backend.
    Frontend nhận auth_url → redirect user → provider gọi callback về backend.
    """

    STATE_TTL_SECONDS = 600  # 10 phút cho user hoàn thành OAuth flow

    def __init__(self, provider_type: str):
        if provider_type not in OAUTH2_PROVIDER_CONFIGS:
            raise ValueError(f"No OAuth2 config for provider: {provider_type}")
        self.provider_type = provider_type
        self.config = OAUTH2_PROVIDER_CONFIGS[provider_type]

    def _get_client_id(self) -> str:
        client_id = os.getenv(self.config["client_id_env"], "")
        if not client_id:
            raise AuthenticationFailed(
                self.provider_type,
                f"OAuth2 client ID not configured ({self.config['client_id_env']})"
            )
        return client_id

    def _get_client_secret(self) -> str:
        secret = os.getenv(self.config["client_secret_env"], "")
        if not secret:
            raise AuthenticationFailed(
                self.provider_type,
                f"OAuth2 client secret not configured ({self.config['client_secret_env']})"
            )
        return secret

    def build_auth_url(self, state: str, redirect_uri: str) -> str:
        """
        Tạo URL redirect đến trang xác thực của provider.

        Args:
            state: Opaque state token (JWT hoặc UUID) để verify trong callback.
            redirect_uri: URL backend sẽ nhận authorization code.

        Returns:
            Full authorization URL để frontend redirect user đến.
        """
        params: dict[str, str] = {
            "client_id": self._get_client_id(),
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "state": state,
        }

        # Thêm scopes nếu có
        if self.config["scopes"]:
            params["scope"] = " ".join(self.config["scopes"])

        # Provider-specific extra params
        params.update(self.config.get("extra_params", {}))

        return f"{self.config['auth_url']}?{urlencode(params)}"

    async def exchange_code(self, code: str, redirect_uri: str) -> dict[str, Any]:
        """
        Exchange authorization code lấy access + refresh token.

        Args:
            code: Authorization code từ provider callback.
            redirect_uri: Phải khớp với redirect_uri khi tạo auth_url.

        Returns:
            Raw token response từ provider.

        Raises:
            AuthenticationFailed: nếu exchange thất bại.
        """
        data = {
            "code": code,
            "client_id": self._get_client_id(),
            "client_secret": self._get_client_secret(),
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                resp = await client.post(self.config["token_url"], data=data)
                resp.raise_for_status()
                return resp.json()
            except httpx.HTTPStatusError as e:
                logger.error(
                    "OAuth2 code exchange failed",
                    provider=self.provider_type,
                    status=e.response.status_code,
                    body=e.response.text[:200],
                )
                raise AuthenticationFailed(
                    self.provider_type,
                    f"Token exchange failed: {e.response.text[:200]}"
                )

    def _token_response_to_credential(self, token_data: dict[str, Any]) -> AuthCredential:
        """
        Transform raw token response → AuthCredential.

        rclone lưu token dưới dạng JSON string trong config.
        Format: token = {"access_token":"...","refresh_token":"...","expiry":"..."}
        """
        access_token = token_data.get("access_token", "")
        refresh_token = token_data.get("refresh_token", "")
        expires_in = token_data.get("expires_in", 3600)

        expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))

        # rclone token format
        rclone_token = json.dumps({
            "access_token": access_token,
            "token_type": token_data.get("token_type", "Bearer"),
            "refresh_token": refresh_token,
            "expiry": expires_at.isoformat(),
        })

        raw_params: dict[str, Any] = {
            "token": rclone_token,
            "client_id": self._get_client_id(),
            "client_secret": self._get_client_secret(),
        }

        # Provider-specific rclone params
        if self.provider_type == "drive":
            raw_params["scope"] = "drive"

        return AuthCredential(
            provider_type=self.provider_type,
            credential_type="oauth2",
            raw_params=raw_params,
            expires_at=expires_at,
            refresh_token=refresh_token,
            metadata={
                "token_type": token_data.get("token_type", "Bearer"),
                "scope": token_data.get("scope", ""),
            },
        )

    async def authenticate(self, input_params: dict[str, Any]) -> AuthCredential:
        """
        Authenticate sau khi nhận code từ OAuth callback.

        input_params phải có:
            - code: Authorization code
            - redirect_uri: Redirect URI đã dùng
        """
        code = input_params.get("code")
        redirect_uri = input_params.get("redirect_uri")
        if not code or not redirect_uri:
            raise AuthenticationFailed(
                self.provider_type, "Missing 'code' or 'redirect_uri' in input_params"
            )

        token_data = await self.exchange_code(code, redirect_uri)
        cred = self._token_response_to_credential(token_data)

        # Lấy thêm thông tin user (email) từ provider nếu có thể
        try:
            email = await self._fetch_user_email(cred.raw_params.get("token", ""))
            if email:
                cred.metadata["email"] = email
        except Exception:
            pass  # Non-fatal

        return cred

    async def _fetch_user_email(self, rclone_token_json: str) -> str | None:
        """Lấy email user từ provider API sau khi có access token."""
        try:
            token_data = json.loads(rclone_token_json)
            access_token = token_data.get("access_token", "")
            if not access_token:
                return None

            if self.provider_type == "drive":
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.get(
                        "https://www.googleapis.com/drive/v3/about?fields=user",
                        headers={"Authorization": f"Bearer {access_token}"},
                    )
                    if resp.status_code == 200:
                        return resp.json().get("user", {}).get("emailAddress")
        except Exception as e:
            logger.debug(f"Could not fetch user email: {e}")
        return None

    async def refresh(self, credential: AuthCredential) -> AuthCredential:
        """
        Refresh access token dùng refresh_token.

        Raises:
            TokenRefreshFailed: nếu refresh thất bại hoặc refresh_token không tồn tại.
        """
        # Lấy refresh_token từ raw_params (rclone token JSON)
        rclone_token_str = credential.raw_params.get("token", "{}")
        try:
            rclone_token = json.loads(rclone_token_str)
        except json.JSONDecodeError:
            rclone_token = {}

        refresh_token = rclone_token.get("refresh_token") or credential.refresh_token
        if not refresh_token:
            raise TokenRefreshFailed(
                self.provider_type, "No refresh token available. User must re-authenticate."
            )

        data = {
            "refresh_token": refresh_token,
            "client_id": self._get_client_id(),
            "client_secret": self._get_client_secret(),
            "grant_type": "refresh_token",
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                resp = await client.post(self.config["token_url"], data=data)
                resp.raise_for_status()
                token_data = resp.json()
            except httpx.HTTPStatusError as e:
                raise TokenRefreshFailed(
                    self.provider_type,
                    f"HTTP {e.response.status_code}: {e.response.text[:200]}"
                )

        # Giữ lại refresh_token cũ nếu provider không trả về mới
        if "refresh_token" not in token_data:
            token_data["refresh_token"] = refresh_token

        new_cred = self._token_response_to_credential(token_data)

        # Giữ lại metadata cũ
        new_cred.metadata.update(credential.metadata)

        logger.info(
            "OAuth2 token refreshed",
            provider=self.provider_type,
            expires_at=new_cred.expires_at.isoformat() if new_cred.expires_at else None,
        )

        return new_cred

    async def validate(self, credential: AuthCredential) -> bool:
        """Kiểm tra credential còn hiệu lực."""
        if credential.is_expired(buffer_seconds=0):
            return False

        rclone_token_str = credential.raw_params.get("token", "{}")
        try:
            rclone_token = json.loads(rclone_token_str)
            access_token = rclone_token.get("access_token", "")
        except json.JSONDecodeError:
            return False

        if not access_token:
            return False

        try:
            if self.provider_type == "drive":
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.get(
                        "https://www.googleapis.com/drive/v3/about?fields=user",
                        headers={"Authorization": f"Bearer {access_token}"},
                    )
                    return resp.status_code == 200
        except Exception:
            return False

        return True

    async def revoke(self, credential: AuthCredential) -> None:
        """Thu hồi token tại provider (best-effort, không raise exception)."""
        revoke_url = self.config.get("revoke_url")
        if not revoke_url:
            return

        rclone_token_str = credential.raw_params.get("token", "{}")
        try:
            rclone_token = json.loads(rclone_token_str)
            token = rclone_token.get("access_token") or rclone_token.get("refresh_token")
            if not token:
                return

            async with httpx.AsyncClient(timeout=10.0) as client:
                if self.provider_type == "drive":
                    await client.post(revoke_url, params={"token": token})
                elif self.provider_type == "dropbox":
                    await client.post(
                        revoke_url,
                        headers={"Authorization": f"Bearer {token}"},
                    )
        except Exception as e:
            logger.warning(f"Token revoke failed (non-fatal): {e}", provider=self.provider_type)
