"""Auth API schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    """Register request payload."""

    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    """Login request payload."""

    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=128)


class AuthUserResponse(BaseModel):
    """Public user data in auth responses."""

    user_id: str
    email: str
    roles: list[str]
    created_at: datetime | None = None


class AuthTokenResponse(BaseModel):
    """JWT login/register response."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: AuthUserResponse
