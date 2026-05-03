"""
WebSocket Router — Real-time encrypted message relay.

ConnectionManager class:
- Maps user_id → active WebSocket connections
- Routes encrypted payloads between connected clients
- Queues messages for offline users in MessageQueue
- Delivers queued messages upon reconnection

IMPORTANT: The server NEVER decrypts messages. It only relays
opaque ciphertext blobs between authenticated clients.
"""

import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.database import AsyncSessionLocal
from app.models.models import MessageQueue, User
from app.auth import decode_access_token

logger = logging.getLogger("vaultchat.websocket")

router = APIRouter(tags=["WebSocket"])


class ConnectionManager:
    """
    Manages active WebSocket connections keyed by user_id.

    Design:
    - Each user can have ONE active WebSocket at a time
    - On connect: authenticate JWT → store connection → deliver queued messages
    - On message: relay to recipient if online, else queue in DB
    - On disconnect: remove from active connections
    """

    def __init__(self):
        self.active_connections: dict[int, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        """Accept WebSocket and register the user's connection."""
        await websocket.accept()
        self.active_connections[user_id] = websocket
        logger.info(f"User {user_id} connected. Active: {len(self.active_connections)}")

    def disconnect(self, user_id: int):
        """Remove user's WebSocket connection."""
        self.active_connections.pop(user_id, None)
        logger.info(f"User {user_id} disconnected. Active: {len(self.active_connections)}")

    def is_online(self, user_id: int) -> bool:
        """Check if a user has an active WebSocket connection."""
        return user_id in self.active_connections

    async def send_to_user(self, user_id: int, message: dict) -> bool:
        """
        Send a JSON message to a specific user.
        Returns True if delivered, False if user is offline.
        """
        ws = self.active_connections.get(user_id)
        if ws:
            try:
                await ws.send_json(message)
                return True
            except Exception:
                self.disconnect(user_id)
                return False
        return False

    async def broadcast(self, message: dict, exclude_user_id: int | None = None):
        """Broadcast a message to all connected users (optional exclusion)."""
        for user_id, ws in list(self.active_connections.items()):
            if user_id == exclude_user_id:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(user_id)

    async def deliver_queued_messages(self, user_id: int):
        """
        On reconnection, deliver all undelivered messages for this user.
        Marks them as delivered after successful send.
        """
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(MessageQueue).where(
                    MessageQueue.receiver_id == user_id,
                    MessageQueue.is_delivered == False,
                ).order_by(MessageQueue.created_at.asc())
            )
            queued_messages = result.scalars().all()

            for msg in queued_messages:
                payload = {
                    "type": "message",
                    "message_id": msg.id,
                    "sender_id": msg.sender_id,
                    "encrypted_payload": msg.encrypted_payload,
                    "iv": msg.iv,
                    "timestamp": msg.created_at.isoformat(),
                    "queued": True,
                }
                delivered = await self.send_to_user(user_id, payload)
                if delivered:
                    msg.is_delivered = True

            await db.commit()
            if queued_messages:
                logger.info(
                    f"Delivered {len(queued_messages)} queued messages to user {user_id}"
                )


# Singleton connection manager
manager = ConnectionManager()


@router.websocket("/ws/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str):
    """
    WebSocket endpoint — authenticates via JWT token in URL path.

    Protocol:
    1. Client connects to /ws/{jwt_token}
    2. Server validates token, extracts user_id
    3. Server delivers any queued messages
    4. Client sends JSON messages: { type, receiver_id, encrypted_payload, iv }
    5. Server relays to recipient or queues for offline delivery
    """
    # Authenticate via JWT
    try:
        payload = decode_access_token(token)
        user_id = int(payload.get("sub", 0))
        if not user_id:
            await websocket.close(code=4001, reason="Invalid token")
            return
    except Exception:
        await websocket.close(code=4001, reason="Authentication failed")
        return

    # Connect and deliver queued messages
    await manager.connect(websocket, user_id)

    try:
        # Notify other users this user is online
        await manager.broadcast(
            {"type": "user_online", "user_id": user_id},
            exclude_user_id=user_id,
        )

        # Deliver any queued messages from offline period
        await manager.deliver_queued_messages(user_id)

        # Message loop
        while True:
            data = await websocket.receive_json()
            await handle_message(data, user_id)

    except WebSocketDisconnect:
        manager.disconnect(user_id)
        # Notify others this user went offline
        await manager.broadcast(
            {"type": "user_offline", "user_id": user_id},
            exclude_user_id=user_id,
        )
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
        manager.disconnect(user_id)


async def handle_message(data: dict, sender_id: int):
    """
    Route an incoming WebSocket message based on its type.

    Supported message types:
    - "message": Encrypted chat message → relay or queue
    - "typing":  Typing indicator → relay (no storage)
    - "read":    Read receipt → relay (no storage)
    """
    msg_type = data.get("type")

    if msg_type == "message":
        receiver_id = data.get("receiver_id")
        encrypted_payload = data.get("encrypted_payload", "")
        iv = data.get("iv")
        message_type = data.get("message_type", "TEXT")

        if not receiver_id or not encrypted_payload:
            return

        outgoing = {
            "type": "message",
            "sender_id": sender_id,
            "encrypted_payload": encrypted_payload,
            "iv": iv,
            "message_type": message_type,
            "timestamp": data.get("timestamp"),
            "ttl": data.get("ttl"),
            "file_name": data.get("file_name"),
            "file_mime": data.get("file_mime"),
        }

        # Try to deliver directly
        delivered = await manager.send_to_user(receiver_id, outgoing)

        if not delivered:
            # User is offline — queue the encrypted blob in DB
            async with AsyncSessionLocal() as db:
                queued_msg = MessageQueue(
                    sender_id=sender_id,
                    receiver_id=receiver_id,
                    encrypted_payload=encrypted_payload,
                    iv=iv,
                    message_type=message_type,
                )
                db.add(queued_msg)
                await db.commit()
                logger.info(
                    f"Queued message from user {sender_id} to offline user {receiver_id}"
                )

        # Send delivery confirmation to sender
        await manager.send_to_user(sender_id, {
            "type": "delivery_status",
            "receiver_id": receiver_id,
            "status": "delivered" if delivered else "queued",
        })

    elif msg_type == "typing":
        receiver_id = data.get("receiver_id")
        if receiver_id:
            await manager.send_to_user(receiver_id, {
                "type": "typing",
                "sender_id": sender_id,
            })

    elif msg_type == "read":
        receiver_id = data.get("receiver_id")
        message_id = data.get("message_id")
        if receiver_id:
            await manager.send_to_user(receiver_id, {
                "type": "read",
                "sender_id": sender_id,
                "message_id": message_id,
            })
