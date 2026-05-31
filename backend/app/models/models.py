"""
SQLAlchemy Models — User, PublicKey, MessageQueue.

All models use SQLAlchemy 2.0 mapped_column style for full
PostgreSQL compatibility. SQLite works identically for dev.
"""

from datetime import datetime, timezone
from sqlalchemy import (
    String,
    Text,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    """Registered user — stores username, bcrypt-hashed password, and profile info."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    avatar_base64: Mapped[str | None] = mapped_column(Text, nullable=True)
    bio: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    public_keys: Mapped[list["PublicKey"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    sent_messages: Mapped[list["MessageQueue"]] = relationship(
        back_populates="sender", foreign_keys="MessageQueue.sender_id"
    )
    received_messages: Mapped[list["MessageQueue"]] = relationship(
        back_populates="receiver", foreign_keys="MessageQueue.receiver_id"
    )

    def __repr__(self) -> str:
        return f"<User(id={self.id}, username='{self.username}')>"


class PublicKey(Base):
    """
    Stores the user's ECDH public key in JWK format.
    The server holds public keys to facilitate key exchange —
    it NEVER touches private keys.
    """

    __tablename__ = "public_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    public_key_jwk: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="public_keys")

    def __repr__(self) -> str:
        return f"<PublicKey(id={self.id}, user_id={self.user_id})>"


class MessageQueue(Base):
    """
    Offline message queue — stores encrypted blobs for offline users.
    The backend NEVER sees plaintext. The encrypted_payload is an
    opaque ciphertext blob from the sender's AES-GCM encryption.

    Once delivered to the recipient's WebSocket, is_delivered flips
    to True and the row is eligible for deletion.
    """

    __tablename__ = "message_queue"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sender_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    receiver_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    device_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    encrypted_payload: Mapped[str] = mapped_column(Text, nullable=False)
    iv: Mapped[str] = mapped_column(String(64), nullable=True)
    message_type: Mapped[str] = mapped_column(String(20), default="TEXT", nullable=False)
    ttl: Mapped[int | None] = mapped_column(Integer, nullable=True)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_mime: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_delivered: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    sender: Mapped["User"] = relationship(
        back_populates="sent_messages", foreign_keys=[sender_id]
    )
    receiver: Mapped["User"] = relationship(
        back_populates="received_messages", foreign_keys=[receiver_id]
    )

    def __repr__(self) -> str:
        return f"<MessageQueue(id={self.id}, sender={self.sender_id}->receiver={self.receiver_id}, device={self.device_id}, delivered={self.is_delivered})>"


class UserDevice(Base):
    """
    Tracks registered/seen device IDs for each user to facilitate
    multi-device E2EE offline queueing.
    """

    __tablename__ = "user_devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    device_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    last_seen: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<UserDevice(id={self.id}, user_id={self.user_id}, device_id='{self.device_id}')>"
