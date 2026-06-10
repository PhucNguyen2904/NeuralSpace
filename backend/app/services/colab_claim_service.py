"""One-time Google Colab claim-code lifecycle."""

from __future__ import annotations

import hashlib
import json
import re
import secrets

from redis.asyncio import Redis

CLAIM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CLAIM_GROUP_LENGTH = 4
CLAIM_GROUP_COUNT = 3
CREATE_CLAIM_SCRIPT = """
local previous_hash = redis.call('GET', KEYS[1])
if previous_hash then
    redis.call('DEL', ARGV[1] .. previous_hash)
end
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[4])
redis.call('SET', KEYS[1], ARGV[3], 'EX', ARGV[4])
return 1
"""


class ColabClaimService:
    @staticmethod
    def generate_code() -> str:
        groups = [
            "".join(secrets.choice(CLAIM_ALPHABET) for _ in range(CLAIM_GROUP_LENGTH))
            for _ in range(CLAIM_GROUP_COUNT)
        ]
        return f"NS-{'-'.join(groups)}"

    @staticmethod
    def normalize_code(code: str) -> str:
        compact = re.sub(r"[^A-Za-z0-9]", "", code).upper()
        if compact.startswith("NS"):
            compact = compact[2:]
        if len(compact) != CLAIM_GROUP_LENGTH * CLAIM_GROUP_COUNT:
            return ""
        groups = [
            compact[index:index + CLAIM_GROUP_LENGTH]
            for index in range(0, len(compact), CLAIM_GROUP_LENGTH)
        ]
        return f"NS-{'-'.join(groups)}"

    @staticmethod
    def claim_hash(code: str) -> str:
        return hashlib.sha256(code.encode("utf-8")).hexdigest()

    @staticmethod
    def claim_key(claim_hash: str) -> str:
        return f"colab:claim:{claim_hash}"

    @staticmethod
    def active_key(user_id: str, workspace_id: str) -> str:
        return f"colab:claim:active:{user_id}:{workspace_id}"

    @classmethod
    async def create(
        cls,
        redis: Redis,
        *,
        session_id: str,
        workspace_id: str,
        user_id: str,
        expires_in: int,
    ) -> str:
        claim_code = cls.generate_code()
        claim_hash = cls.claim_hash(claim_code)
        active_key = cls.active_key(user_id, workspace_id)
        value = json.dumps(
            {"session_id": session_id, "workspace_id": workspace_id, "user_id": user_id},
            separators=(",", ":"),
        )
        await redis.eval(
            CREATE_CLAIM_SCRIPT,
            2,
            active_key,
            cls.claim_key(claim_hash),
            "colab:claim:",
            value,
            claim_hash,
            expires_in,
        )
        return claim_code

    @classmethod
    async def consume(cls, redis: Redis, code: str) -> dict[str, str] | None:
        normalized = cls.normalize_code(code)
        if not normalized:
            return None
        raw = await redis.getdel(cls.claim_key(cls.claim_hash(normalized)))
        if not raw:
            return None
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        return json.loads(raw)
