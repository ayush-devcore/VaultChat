"""
User & Public Key Router — user lookup and ECDH public key exchange.

These endpoints facilitate the client-side key exchange:
1. User A uploads their public key after generation
2. User B fetches User A's public key to derive the shared secret
3. The server NEVER sees private keys
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.models import User, PublicKey
from app.schemas.schemas import (
    UserPublic,
    PublicKeyUpload,
    PublicKeyResponse,
)
from app.auth import get_current_user

router = APIRouter(prefix="/api/users", tags=["Users & Keys"])


@router.get("/me", response_model=UserPublic)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user's info."""
    return current_user


@router.get("/search/{username}", response_model=UserPublic)
async def search_user(
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Search for a user by exact username.
    Used when starting a new chat — verifies the recipient exists.
    """
    result = await db.execute(
        select(User).where(User.username == username)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return user


@router.post("/keys", response_model=PublicKeyResponse, status_code=status.HTTP_201_CREATED)
async def upload_public_key(
    key_data: PublicKeyUpload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload the current user's ECDH public key (JWK format).
    Replaces any existing key for this user.
    """
    # Delete existing key if present (one key per user)
    result = await db.execute(
        select(PublicKey).where(PublicKey.user_id == current_user.id)
    )
    existing_key = result.scalar_one_or_none()
    if existing_key:
        await db.delete(existing_key)

    # Store new key
    new_key = PublicKey(
        user_id=current_user.id,
        public_key_jwk=key_data.public_key_jwk,
    )
    db.add(new_key)
    await db.commit()
    await db.refresh(new_key)

    return new_key


@router.get("/keys/{user_id}", response_model=PublicKeyResponse)
async def get_public_key(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Fetch another user's public key for ECDH key exchange.
    This is how clients derive the shared AES secret.
    """
    result = await db.execute(
        select(PublicKey).where(PublicKey.user_id == user_id)
    )
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Public key not found for this user",
        )
    return key
