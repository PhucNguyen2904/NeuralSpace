"""Authentication middleware for JWT verification."""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.logging import get_logger
from app.core.security import verify_jwt

logger = get_logger(__name__)


class AuthMiddleware(BaseHTTPMiddleware):
    """Verify bearer JWT and inject user into request.state."""

    SKIP_PATHS = {"/health", "/openapi.json", "/api/v1/docs", "/api/v1/openapi.json", "/api/v1/health"}

    async def dispatch(self, request: Request, call_next):
        if request.url.path in self.SKIP_PATHS or request.url.path.startswith("/docs"):
            return await call_next(request)

        authorization = request.headers.get("Authorization")
        if not authorization:
            self._log_failed_auth(request, "missing_authorization")
            return JSONResponse(status_code=401, content={"message": "Missing authorization"})

        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token:
            self._log_failed_auth(request, "invalid_authorization_scheme")
            return JSONResponse(status_code=401, content={"message": "Invalid authorization scheme"})

        try:
            request.state.user = verify_jwt(token)
        except Exception:
            self._log_failed_auth(request, "invalid_or_expired_token")
            return JSONResponse(status_code=401, content={"message": "Invalid or expired token"})

        return await call_next(request)

    @staticmethod
    def _log_failed_auth(request: Request, reason: str) -> None:
        logger.warning(
            "Auth failed",
            reason=reason,
            ip=request.client.host if request.client else "unknown",
            path=request.url.path,
            method=request.method,
        )
