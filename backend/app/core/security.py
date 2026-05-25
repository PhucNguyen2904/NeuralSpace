"""Security utilities for JWT and one-time workspace tokens."""

import base64
import hmac
import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from jose import JWTError, jwt
from redis.asyncio import Redis

from app.config import get_settings

PASSWORD_SCHEME = "pbkdf2_sha256"
PASSWORD_ITERATIONS = 260000


@dataclass
class TokenPayload:
    """Validated JWT payload."""

    user_id: str
    email: str
    roles: list[str]
    exp: int


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """
    Create a JWT access token.

    Args:
        data: Dictionary of claims to encode
        expires_delta: Optional custom expiration time

    Returns:
        Encoded JWT token string
    """
    settings = get_settings()
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    return encoded_jwt


def verify_token(token: str) -> dict:
    """
    Verify and decode a JWT token.

    Args:
        token: JWT token string to verify

    Returns:
        Decoded token payload

    Raises:
        JWTError: If token is invalid or expired
    """
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        return payload
    except JWTError as e:
        raise JWTError(f"Invalid token: {str(e)}") from e


def verify_jwt(token: str) -> TokenPayload:
    """Verify JWT from upstream provider and return normalized payload."""
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Malformed token")
        return TokenPayload(
            user_id=user_id,
            email=payload.get("email", ""),
            roles=payload.get("roles", []),
            exp=int(payload.get("exp")),
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token",
        ) from exc


async def create_ws_token(workspace_id: str, user_id: str) -> str:
    """Create and store one-time workspace WebSocket token in Redis with 300s TTL."""
    from app.dependencies import get_redis_client

    redis_client = get_redis_client()
    token = f"wst_{workspace_id}_{secrets.token_hex(32)}"
    key = f"ws:token:{workspace_id}"
    await redis_client.set(key, token, ex=300)
    return token


async def verify_ws_token(workspace_id: str, token: str, redis: Redis) -> bool:
    """Verify one-time token and delete on success."""
    if not token.startswith(f"wst_{workspace_id}_"):
        return False
    key = f"ws:token:{workspace_id}"
    stored = await redis.get(key)
    if not stored:
        return False
    if stored.decode() != token:
        return False
    await redis.delete(key)
    return True


def generate_workspace_token() -> str:
    """
    Generate a secure random token for workspace authentication.

    Returns:
        32-byte hex string
    """
    return secrets.token_hex(32)


def hash_token(token: str) -> str:
    """
    Hash a token using SHA-256.

    Args:
        token: Token string to hash

    Returns:
        Hex-encoded SHA-256 hash
    """
    return hashlib.sha256(token.encode()).hexdigest()


def hash_password(password: str) -> str:
    """Hash password using PBKDF2-HMAC-SHA256."""
    if not password:
        raise ValueError("Password must not be empty")
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return (
        f"{PASSWORD_SCHEME}"
        f"${PASSWORD_ITERATIONS}"
        f"${base64.b64encode(salt).decode('utf-8')}"
        f"${base64.b64encode(dk).decode('utf-8')}"
    )


def verify_password(password: str, password_hash: str | None) -> bool:
    """Verify plaintext password against encoded PBKDF2 hash."""
    if not password_hash or not password:
        return False
    try:
        scheme, iterations_s, salt_b64, digest_b64 = password_hash.split("$", 3)
        if scheme != PASSWORD_SCHEME:
            return False
        iterations = int(iterations_s)
        salt = base64.b64decode(salt_b64.encode("utf-8"))
        expected_digest = base64.b64decode(digest_b64.encode("utf-8"))
        actual_digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
        return hmac.compare_digest(actual_digest, expected_digest)
    except Exception:
        return False
