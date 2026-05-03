"""
Pydantic schemas for request/response validation.
"""

from pydantic import BaseModel, Field
from datetime import datetime


# ── Auth Schemas ──

class UserCreate(BaseModel):
    """Registration request body."""
    username: str = Field(..., min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_]+$")
    password: str = Field(..., min_length=8, max_length=128)
    avatar_base64: str | None = None


class UserLogin(BaseModel):
    """Login request body."""
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class AuthResponse(BaseModel):
    """Successful auth response — returned on both register and login."""
    access_token: str
    token_type: str = "bearer"
    user_id: int
    username: str
    avatar_base64: str | None = None


class UserPublic(BaseModel):
    """Public user info (no password)."""
    id: int
    username: str
    avatar_base64: str | None = None
    bio: str | None = None
    is_active: bool

    model_config = {"from_attributes": True}


class UserProfileUpdate(BaseModel):
    """Update user profile (avatar + bio)."""
    avatar_base64: str | None = None
    bio: str | None = Field(None, max_length=200)


# ── Public Key Schemas ──

class PublicKeyUpload(BaseModel):
    """Upload a user's ECDH public key in JWK format."""
    public_key_jwk: str


class PublicKeyResponse(BaseModel):
    """Public key retrieval response."""
    id: int
    user_id: int
    public_key_jwk: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Message Schemas ──

class MessageCreate(BaseModel):
    """Send an encrypted message blob."""
    receiver_id: int
    encrypted_payload: str
    iv: str | None = None
    message_type: str = "TEXT"


class MessageResponse(BaseModel):
    """Queued message response."""
    id: int
    sender_id: int
    receiver_id: int
    encrypted_payload: str
    iv: str | None
    message_type: str = "TEXT"
    is_delivered: bool
    created_at: datetime

    model_config = {"from_attributes": True}
