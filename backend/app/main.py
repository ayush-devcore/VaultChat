"""
VaultChat — Backend Entry Point
E2EE Real-Time Chat Application

Zero-trust architecture: the server relays encrypted blobs
but NEVER has access to plaintext messages or private keys.
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.routers import auth, users, websocket

# ── Logging ──

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)-20s | %(levelname)-7s | %(message)s",
)
logger = logging.getLogger("vaultchat")


# ── App Lifecycle ──

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create DB tables. Shutdown: cleanup."""
    logger.info("🔐 VaultChat API starting up...")
    await init_db()
    logger.info("✅ Database tables created/verified")
    logger.info("🚀 VaultChat API is ready")
    yield
    logger.info("🛑 VaultChat API shutting down...")


# ── FastAPI App ──

app = FastAPI(
    title="VaultChat API",
    description="Zero-trust E2EE messaging backend — the server NEVER sees plaintext.",
    version="0.2.0",
    lifespan=lifespan,
)

import os

# ── CORS ──
allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
allowed_origins = [origin.strip() for origin in allowed_origins_str.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register Routers ──

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(websocket.router)


# ── Health Check ──

@app.get("/api/health", tags=["System"])
async def health_check():
    """Health check endpoint."""
    return {
        "status": "operational",
        "service": "VaultChat API",
        "version": "0.2.0",
        "e2ee": True,
        "endpoints": {
            "auth": "/api/auth/{register,login}",
            "users": "/api/users/{me,search,keys}",
            "websocket": "/ws/{token}",
        },
    }
