"""Redis-backed rate limiting middleware."""

from __future__ import annotations

from datetime import datetime, timezone

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.dependencies import get_redis_client
from app.core.security import verify_jwt


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Per-user/workspace minute-window rate limiting."""

    async def dispatch(self, request: Request, call_next):
        if request.method.upper() == "OPTIONS":
            return await call_next(request)

        if request.url.path in {"/health", "/api/v1/health"}:
            return await call_next(request)

        limit, endpoint_group, identity = self._resolve_policy(request)
        if limit is None or identity is None:
            return await call_next(request)

        now = datetime.now(timezone.utc)
        minute_window = now.strftime("%Y%m%d%H%M")
        key = f"rate:{identity}:{endpoint_group}:{minute_window}"

        redis_client = get_redis_client()
        count = await redis_client.incr(key)
        if count == 1:
            await redis_client.expire(key, 120)

        if count > limit:
            retry_after = max(await redis_client.ttl(key), 1)
            return JSONResponse(
                status_code=429,
                content={"message": "Rate limit exceeded"},
                headers={"Retry-After": str(retry_after)},
            )

        return await call_next(request)

    @staticmethod
    def _resolve_policy(request: Request) -> tuple[int | None, str | None, str | None]:
        path = request.url.path
        method = request.method.upper()
        state_user = getattr(request.state, "user", None)
        user_id = getattr(state_user, "user_id", None)
        if user_id is None:
            authorization = request.headers.get("Authorization", "")
            scheme, _, token = authorization.partition(" ")
            if scheme.lower() == "bearer" and token:
                try:
                    user_id = verify_jwt(token).user_id
                except Exception:
                    user_id = None

        if "/heartbeat" in path:
            workspace_id = request.path_params.get("id")
            if not workspace_id:
                parts = [p for p in path.split("/") if p]
                workspace_id = parts[-2] if len(parts) >= 2 else None
            return 5, "heartbeat", workspace_id

        if method == "POST" and path.endswith("/colab/claims/exchange"):
            client_ip = request.client.host if request.client else "unknown"
            return 10, "colab_claim_exchange", client_ip

        if method == "POST" and path.endswith("/workspaces"):
            return 10, "workspaces_post", user_id

        return 100, "default", user_id
