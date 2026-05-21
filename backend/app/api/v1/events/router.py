"""
Server-Sent Events (SSE) endpoint for real-time workspace notifications.

Why SSE instead of WebSocket?
──────────────────────────────
Both SSE and WebSocket can stream data from server to client in real time.
We chose SSE for this use-case for the following reasons:

1. **Unidirectional flow is sufficient.**
   Workspace lifecycle notifications (IDLE_WARNING, WORKSPACE_KILLED, etc.) are
   purely server → client.  The client does not need to send data back over the
   same channel — it uses regular REST calls (heartbeat, stop) for that.
   WebSocket's full-duplex capability is unnecessary complexity here.

2. **HTTP-native transport.**
   SSE uses plain HTTP/1.1 (or HTTP/2 with multiplexing).  This means:
   • No special firewall/proxy configuration needed — it traverses the same
     port 443 as any other HTTPS request.
   • Works through corporate proxies that block WebSocket upgrades.
   • Standard FastAPI `StreamingResponse` — no extra library required.

3. **Auto-reconnect built into the browser.**
   The EventSource API reconnects automatically on connection loss (with
   exponential back-off).  Implementing equivalent behaviour for WebSocket
   requires custom client-side code.

4. **Per-client cleanup is simple.**
   When the client disconnects, the generator raises `asyncio.CancelledError`
   (or the request body closes), allowing us to cleanly unsubscribe from Redis
   without any explicit close handshake.

5. **Stateless on the server side.**
   Each SSE connection is an independent long-lived GET request.  Horizontal
   scaling is trivial — any backend instance can serve any client, because the
   shared state lives in Redis Pub/Sub.

Tradeoffs accepted:
  • SSE does not support binary payloads (we only send JSON → fine).
  • SSE over HTTP/1.1 uses one connection per stream (HTTP/2 multiplexes).
  • IE 11 does not support EventSource (not a target browser for this product).
"""

from __future__ import annotations

import asyncio
import json
from typing import AsyncGenerator

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import WorkspaceNotFoundError, WorkspaceNotOwnedError
from app.core.logging import get_logger
from app.dependencies import UserContext, get_current_user, get_db, get_redis
from app.repositories.workspace_repository import WorkspaceRepository
from app.services.notification_service import WORKSPACE_EVENTS_CHANNEL

logger = get_logger(__name__)

router = APIRouter(prefix="/workspaces", tags=["events"])

# How often to send a no-op heartbeat ping to keep the connection alive through
# load balancers and proxies that terminate idle connections.
SSE_HEARTBEAT_INTERVAL: int = 30  # seconds


def _sse_event(data: dict | str, event: str | None = None, id: str | None = None) -> str:
    """
    Format a single Server-Sent Event frame.

    SSE wire format (per the W3C spec):
        id: <optional-event-id>\\n
        event: <optional-event-type>\\n
        data: <json-payload>\\n
        \\n                          ← blank line terminates the event
    """
    lines: list[str] = []
    if id is not None:
        lines.append(f"id: {id}")
    if event is not None:
        lines.append(f"event: {event}")
    payload = json.dumps(data) if isinstance(data, dict) else data
    lines.append(f"data: {payload}")
    lines.append("")   # blank line = event terminator
    lines.append("")   # extra blank for readability
    return "\n".join(lines)


async def _workspace_event_stream(
    workspace_id: str,
    redis: aioredis.Redis,
    request: Request,
) -> AsyncGenerator[str, None]:
    """
    Async generator that:
      1. Subscribes to the workspace's Redis Pub/Sub channel.
      2. Yields SSE-formatted frames for each published message.
      3. Yields a heartbeat ping every SSE_HEARTBEAT_INTERVAL seconds to keep
         the connection alive.
      4. Unsubscribes and cleans up when the client disconnects.

    The generator is consumed by FastAPI's StreamingResponse.
    """
    channel_name = WORKSPACE_EVENTS_CHANNEL.format(workspace_id=workspace_id)

    # Create a dedicated pubsub connection for this subscriber.
    # Each SSE client gets its own subscription so that disconnecting one
    # client does not affect other clients listening to the same workspace.
    pubsub = redis.pubsub()
    await pubsub.subscribe(channel_name)
    logger.info(
        "SSE client subscribed",
        workspace_id=workspace_id,
        channel=channel_name,
    )

    # Send an initial "connected" event so the client knows the stream is live.
    yield _sse_event(
        data={"type": "CONNECTED", "workspace_id": workspace_id},
        event="connected",
    )

    try:
        while True:
            # Check if the HTTP client has disconnected.
            if await request.is_disconnected():
                logger.info(
                    "SSE client disconnected — closing stream",
                    workspace_id=workspace_id,
                )
                break

            # Poll Redis pub/sub with a short timeout so we can also send
            # periodic heartbeats without blocking indefinitely.
            try:
                message = await asyncio.wait_for(
                    pubsub.get_message(ignore_subscribe_messages=True, timeout=0.1),
                    timeout=SSE_HEARTBEAT_INTERVAL,
                )
            except asyncio.TimeoutError:
                # No message within SSE_HEARTBEAT_INTERVAL → send heartbeat ping.
                # The SSE comment syntax ": ping" is ignored by the EventSource API
                # but keeps the TCP connection alive through proxies.
                yield ": ping\n\n"
                continue

            if message is None:
                # pubsub.get_message returned None (no message yet) — brief yield
                # to avoid a tight spin loop that would pin the CPU.
                await asyncio.sleep(0.05)
                continue

            if message.get("type") == "message":
                raw_data = message.get("data", "")
                if isinstance(raw_data, bytes):
                    raw_data = raw_data.decode()
                try:
                    parsed = json.loads(raw_data)
                    event_type = parsed.get("type", "message").lower()
                    yield _sse_event(data=parsed, event=event_type)

                    # If the workspace has been killed, close the stream — there
                    # will be no more events for this workspace.
                    if parsed.get("type") == "WORKSPACE_KILLED":
                        logger.info(
                            "WORKSPACE_KILLED received — closing SSE stream",
                            workspace_id=workspace_id,
                        )
                        break
                except json.JSONDecodeError:
                    # Malformed message — forward as raw string, don't crash stream.
                    yield _sse_event(data={"raw": raw_data, "type": "unknown"})

    except asyncio.CancelledError:
        # FastAPI cancels the generator when the client disconnects.
        logger.info(
            "SSE stream generator cancelled (client disconnected)",
            workspace_id=workspace_id,
        )
    finally:
        # Always unsubscribe to release the Redis connection back to the pool.
        try:
            await pubsub.unsubscribe(channel_name)
            await pubsub.aclose()
        except Exception as exc:
            logger.warning(
                "Error while cleaning up pubsub subscription",
                workspace_id=workspace_id,
                error=str(exc),
            )
        logger.info(
            "SSE subscription cleaned up",
            workspace_id=workspace_id,
            channel=channel_name,
        )


@router.get(
    "/{id}/events",
    summary="Stream workspace lifecycle events via SSE",
    description=(
        "Opens a Server-Sent Events stream for the given workspace.  "
        "Emits IDLE_WARNING, WORKSPACE_KILLED, and WORKSPACE_STARTED events "
        "published by the GC and provisioning systems via Redis Pub/Sub.  "
        "The connection is kept alive with a heartbeat comment every 30 seconds."
    ),
    response_class=StreamingResponse,
)
async def stream_workspace_events(
    id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    current_user: UserContext = Depends(get_current_user),
) -> StreamingResponse:
    """
    GET /api/v1/workspaces/{id}/events

    Auth + ownership verification is performed before opening the stream so
    that unauthenticated or unauthorized clients receive a normal HTTP 401/403
    rather than a half-open SSE stream.

    Response headers:
      Content-Type:      text/event-stream
      Cache-Control:     no-cache
      X-Accel-Buffering: no   ← disables nginx output buffering (critical for SSE)
    """
    # Verify the workspace exists and belongs to the requesting user.
    try:
        workspace = await WorkspaceRepository.get_by_id(db, id)
        if workspace is None:
            raise WorkspaceNotFoundError(workspace_id=id)
        if not workspace.is_owned_by(current_user.user_id):
            raise WorkspaceNotOwnedError(workspace_id=id, user_id=current_user.user_id)
    except WorkspaceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from exc
    except WorkspaceNotOwnedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=exc.message) from exc

    logger.info(
        "Opening SSE stream",
        workspace_id=id,
        user_id=current_user.user_id,
    )

    return StreamingResponse(
        _workspace_event_stream(workspace_id=id, redis=redis, request=request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # Disable nginx proxy buffering
            "Connection": "keep-alive",
        },
    )
