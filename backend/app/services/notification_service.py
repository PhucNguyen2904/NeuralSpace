"""
Notification service — Redis pub/sub push notifications to the frontend.

Architecture note:
──────────────────
We use Redis Pub/Sub as the message bus between the backend GC workers and the
FastAPI SSE (Server-Sent Events) endpoint.  The flow is:

    GC worker  ──PUBLISH──>  Redis channel  ──SUBSCRIBE──>  SSE endpoint  ──>  Browser

Why Redis Pub/Sub (and not a queue)?
  • Notifications are ephemeral — if no client is listening right now, there is
    nothing useful to do with the message.  A queue would accumulate stale events.
  • Pub/Sub fire-and-forget semantics perfectly match "warn the user if they are
    connected; otherwise don't block".
  • One Redis channel per workspace keeps subscriptions scoped and easy to clean up.

Channel naming convention:
  workspace:events:{workspace_id}   ← all workspace lifecycle events
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from redis.asyncio import Redis

from app.core.logging import get_logger

logger = get_logger(__name__)

# Channel prefix used by both publisher (here) and subscriber (SSE router).
WORKSPACE_EVENTS_CHANNEL = "workspace:events:{workspace_id}"


def _channel(workspace_id: str) -> str:
    """Return the Redis pub/sub channel name for a given workspace."""
    return WORKSPACE_EVENTS_CHANNEL.format(workspace_id=workspace_id)


class NotificationService:
    """Redis pub/sub publisher for workspace lifecycle events."""

    @staticmethod
    async def notify_idle_warning(
        redis: Redis,
        workspace_id: str,
        minutes_left: int,
    ) -> None:
        """
        Publish an IDLE_WARNING event to the workspace channel.

        The frontend SSE subscriber receives this and can display a countdown
        banner: "Workspace will be closed in N minutes due to inactivity".

        Args:
            redis:        Async Redis client.
            workspace_id: Workspace identifier.
            minutes_left: Minutes remaining before the workspace is killed.
        """
        payload = {
            "type": "IDLE_WARNING",
            "workspace_id": workspace_id,
            "minutes_left": minutes_left,
            "message": (
                f"Workspace sẽ bị đóng sau {minutes_left} phút do không hoạt động"
            ),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        channel = _channel(workspace_id)
        await redis.publish(channel, json.dumps(payload))
        logger.info(
            "Published IDLE_WARNING notification",
            workspace_id=workspace_id,
            minutes_left=minutes_left,
            channel=channel,
        )

    @staticmethod
    async def notify_workspace_killed(
        redis: Redis,
        workspace_id: str,
    ) -> None:
        """
        Publish a WORKSPACE_KILLED event to the workspace channel.

        The frontend should redirect to the workspace list or show a "session
        ended" message when it receives this event.

        Args:
            redis:        Async Redis client.
            workspace_id: Workspace identifier.
        """
        payload = {
            "type": "WORKSPACE_KILLED",
            "workspace_id": workspace_id,
            "message": "Workspace đã bị đóng do không hoạt động",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        channel = _channel(workspace_id)
        await redis.publish(channel, json.dumps(payload))
        logger.info(
            "Published WORKSPACE_KILLED notification",
            workspace_id=workspace_id,
            channel=channel,
        )

    @staticmethod
    async def notify_workspace_started(
        redis: Redis,
        workspace_id: str,
        access_url: str,
    ) -> None:
        """
        Publish a WORKSPACE_STARTED event (e.g. after provisioning completes).

        Allows the frontend to automatically redirect to the Jupyter environment
        without polling.

        Args:
            redis:        Async Redis client.
            workspace_id: Workspace identifier.
            access_url:   URL to the running Jupyter server.
        """
        payload = {
            "type": "WORKSPACE_STARTED",
            "workspace_id": workspace_id,
            "access_url": access_url,
            "message": "Workspace đã sẵn sàng",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        channel = _channel(workspace_id)
        await redis.publish(channel, json.dumps(payload))
        logger.info(
            "Published WORKSPACE_STARTED notification",
            workspace_id=workspace_id,
            channel=channel,
        )

    @staticmethod
    async def notify_custom(
        redis: Redis,
        workspace_id: str,
        event_type: str,
        payload: dict,
    ) -> None:
        """
        Publish an arbitrary typed event to the workspace channel.

        Args:
            redis:        Async Redis client.
            workspace_id: Workspace identifier.
            event_type:   String event type (e.g. "QUOTA_WARNING").
            payload:      Additional data to include in the message.
        """
        message = {
            "type": event_type,
            "workspace_id": workspace_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            **payload,
        }
        channel = _channel(workspace_id)
        await redis.publish(channel, json.dumps(message))
        logger.debug(
            "Published custom notification",
            workspace_id=workspace_id,
            event_type=event_type,
            channel=channel,
        )
