"""Auth API schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    """Register request payload."""

    name: str = Field(min_length=2, max_length=128)
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
    full_name: str | None = None
    roles: list[str]
    created_at: datetime | None = None


class AuthTokenResponse(BaseModel):
    """JWT login/register response."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_expires_in: int
    user: AuthUserResponse


class RefreshTokenRequest(BaseModel):
    refresh_token: str | None = None
