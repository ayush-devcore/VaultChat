"""
Database configuration — SQLite for local dev, PostgreSQL-ready.

To switch to PostgreSQL later, change DATABASE_URL to:
  postgresql+asyncpg://user:password@host:5432/vaultchat
"""

import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

# Read DATABASE_URL from environment (default to SQLite for local dev)
raw_url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./vaultchat.db")

# Neon.tech provides 'postgres://', but SQLAlchemy requires 'postgresql+asyncpg://'
if raw_url.startswith("postgres://"):
    DATABASE_URL = raw_url.replace("postgres://", "postgresql+asyncpg://", 1)
else:
    DATABASE_URL = raw_url

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    # SQLite needs this; PostgreSQL ignores it
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


async def get_db():
    """FastAPI dependency — yields an async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """Create all tables. Called on app startup."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
