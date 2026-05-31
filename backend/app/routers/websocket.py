"""
WebSocket Router — Real-time encrypted message relay.

ConnectionManager class:
- Maps user_id → {device_id: WebSocket} active connections
- Routes encrypted payloads between connected clients across all active devices
- Queues messages for offline devices in MessageQueue
- Delivers queued messages upon device reconnection

IMPORTANT: The server NEVER decrypts messages. It only relays
opaque ciphertext blobs between authenticated clients.
"""

import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.database import AsyncSessionLocal
from app.models.models import MessageQueue, User, UserDevice
from app.auth import decode_access_token

logger = logging.getLogger("vaultchat.websocket")

router = APIRouter(tags=["WebSocket"])


class ConnectionManager:
    """
    Manages active WebSocket connections keyed by user_id and device_id.

    Design:
    - Each user can have MULTIPLE active WebSocket connections (one per device/tab)
    - On connect: authenticate JWT → store connection → deliver queued messages for device
    - On message: relay to recipient devices, and sender's other devices
    - On disconnect: remove only the specific device from active connections
    """

    def __init__(self):
        # Maps user_id -> {device_id: WebSocket}
        self.active_connections: dict[int, dict[str, WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: int, device_id: str):
        """Accept WebSocket and register the user's specific device connection."""
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = {}
        self.active_connections[user_id][device_id] = websocket
        logger.info(
            f"User {user_id} device '{device_id}' connected. "
            f"Active devices for user: {len(self.active_connections[user_id])}. "
            f"Total active users: {len(self.active_connections)}"
        )

    def disconnect(self, user_id: int, device_id: str):
        """Remove user's specific device WebSocket connection."""
        if user_id in self.active_connections:
            self.active_connections[user_id].pop(device_id, None)
            if not self.active_connections[user_id]:
                self.active_connections.pop(user_id, None)
        logger.info(
            f"User {user_id} device '{device_id}' disconnected. "
            f"Active users: {len(self.active_connections)}"
        )

    def is_online(self, user_id: int) -> bool:
        """Check if a user has at least one active WebSocket connection."""
        return user_id in self.active_connections and len(self.active_connections[user_id]) > 0

    async def send_to_user(self, user_id: int, message: dict, target_device_id: str | None = None) -> bool:
        """
        Send a JSON message to a specific user.
        If target_device_id is specified, sends to that specific device.
        Otherwise, broadcasts to all active devices of the user.
        Returns True if delivered to at least one device, False if all target devices are offline.
        """
        devices = self.active_connections.get(user_id)
        if not devices:
            return False

        if target_device_id:
            ws = devices.get(target_device_id)
            if ws:
                try:
                    await ws.send_json(message)
                    return True
                except Exception:
                    self.disconnect(user_id, target_device_id)
                    return False
            return False

        # Broadcast to all active devices of the user
        delivered_any = False
        broken_devices = []
        for dev_id, ws in list(devices.items()):
            try:
                await ws.send_json(message)
                delivered_any = True
            except Exception:
                broken_devices.append(dev_id)

        for dev_id in broken_devices:
            self.disconnect(user_id, dev_id)

        return delivered_any

    async def broadcast(self, message: dict, exclude_user_id: int | None = None):
        """Broadcast a message to all connected devices (optional user exclusion)."""
        for user_id, devices in list(self.active_connections.items()):
            if user_id == exclude_user_id:
                continue
            broken_devices = []
            for dev_id, ws in list(devices.items()):
                try:
                    await ws.send_json(message)
                except Exception:
                    broken_devices.append(dev_id)
            for dev_id in broken_devices:
                self.disconnect(user_id, dev_id)

    async def deliver_queued_messages(self, user_id: int, device_id: str):
        """
        On reconnection of a specific device, deliver all undelivered messages for this device_id.
        Marks them as delivered after successful send.
        """
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(MessageQueue).where(
                    MessageQueue.receiver_id == user_id,
                    MessageQueue.device_id == device_id,
                    MessageQueue.is_delivered == False,
                ).order_by(MessageQueue.created_at.asc())
            )
            queued_messages = result.scalars().all()

            for msg in queued_messages:
                payload = {
                    "type": "message",
                    "message_id": msg.id,
                    "sender_id": msg.sender_id,
                    "receiver_id": msg.receiver_id,
                    "encrypted_payload": msg.encrypted_payload,
                    "iv": msg.iv,
                    "message_type": msg.message_type,
                    "ttl": msg.ttl,
                    "file_name": msg.file_name,
                    "file_mime": msg.file_mime,
                    "timestamp": msg.created_at.isoformat(),
                    "queued": True,
                }
                delivered = await self.send_to_user(user_id, payload, target_device_id=device_id)
                if delivered:
                    msg.is_delivered = True

            await db.commit()
            if queued_messages:
                logger.info(
                    f"Delivered {len(queued_messages)} queued messages to user {user_id} device '{device_id}'"
                )


# Singleton connection manager
manager = ConnectionManager()


@router.websocket("/ws/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str, device_id: str | None = None):
    """
    WebSocket endpoint — authenticates via JWT token in URL path.
    Supports multi-device connection tracking through optional device_id query param.
    """
    if not device_id:
        device_id = "default_device"

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

    # Upsert the UserDevice registry
    async with AsyncSessionLocal() as db:
        try:
            device_result = await db.execute(
                select(UserDevice).where(
                    UserDevice.user_id == user_id,
                    UserDevice.device_id == device_id
                )
            )
            existing_device = device_result.scalar_one_or_none()
            if not existing_device:
                new_device = UserDevice(user_id=user_id, device_id=device_id)
                db.add(new_device)
            else:
                from datetime import datetime, timezone
                existing_device.last_seen = datetime.now(timezone.utc)
            await db.commit()
        except Exception as e:
            logger.error(f"Failed to register device '{device_id}' for user {user_id}: {e}")

    # Connect and register specific device
    await manager.connect(websocket, user_id, device_id)

    try:
        # Notify other users this user is online
        await manager.broadcast(
            {"type": "user_online", "user_id": user_id},
            exclude_user_id=user_id,
        )

        # Deliver any queued messages specifically for this device
        await manager.deliver_queued_messages(user_id, device_id)

        # Message loop
        while True:
            try:
                data = await websocket.receive_json()
                await handle_message(data, user_id, sending_device_id=device_id)
            except WebSocketDisconnect:
                # Re-raise to trigger disconnect block
                raise
            except Exception as e:
                logger.error(f"Error handling message for user {user_id}: {e}")
                try:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Failed to process message."
                    })
                except Exception:
                    pass

    except WebSocketDisconnect:
        manager.disconnect(user_id, device_id)
        # Notify others this user went offline ONLY if they have NO more active devices
        if not manager.is_online(user_id):
            await manager.broadcast(
                {"type": "user_offline", "user_id": user_id},
                exclude_user_id=user_id,
            )
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id} device '{device_id}': {e}")
        manager.disconnect(user_id, device_id)


async def handle_message(data: dict, sender_id: int, sending_device_id: str):
    """
    Route an incoming WebSocket message based on its type.

    Supported message types:
    - "message": Encrypted chat message → relay to all recipient devices, and sender's other devices
    - "typing":  Typing indicator → relay (no storage)
    - "read":    Read receipt → relay (no storage)
    """
    msg_type = data.get("type")

    if msg_type == "message":
        receiver_id = data.get("receiver_id")
        encrypted_payload = data.get("encrypted_payload", "")
        iv = data.get("iv")
        message_type = data.get("message_type", "TEXT")
        ttl = data.get("ttl")
        file_name = data.get("file_name")
        file_mime = data.get("file_mime")

        if not receiver_id or not encrypted_payload:
            return

        outgoing = {
            "type": "message",
            "sender_id": sender_id,
            "receiver_id": receiver_id,
            "encrypted_payload": encrypted_payload,
            "iv": iv,
            "message_type": message_type,
            "timestamp": data.get("timestamp"),
            "ttl": ttl,
            "file_name": file_name,
            "file_mime": file_mime,
        }

        # 1. Fetch all known devices for the receiver
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(UserDevice).where(UserDevice.user_id == receiver_id)
            )
            receiver_devices = result.scalars().all()

        # Fallback: if receiver has no devices, register "default_device"
        if not receiver_devices:
            async with AsyncSessionLocal() as db:
                default_device = UserDevice(user_id=receiver_id, device_id="default_device")
                db.add(default_device)
                await db.commit()
                receiver_devices = [default_device]

        # 2. Deliver to all devices of receiver
        any_receiver_online = False
        for dev in receiver_devices:
            delivered = await manager.send_to_user(receiver_id, outgoing, target_device_id=dev.device_id)
            if delivered:
                any_receiver_online = True
            else:
                # Device is offline — queue in MessageQueue for this specific device
                async with AsyncSessionLocal() as db:
                    queued_msg = MessageQueue(
                        sender_id=sender_id,
                        receiver_id=receiver_id,
                        device_id=dev.device_id,
                        encrypted_payload=encrypted_payload,
                        iv=iv,
                        message_type=message_type,
                        ttl=ttl,
                        file_name=file_name,
                        file_mime=file_mime,
                    )
                    db.add(queued_msg)
                    await db.commit()

        # 3. Sync to all OTHER devices of the sender
        async with AsyncSessionLocal() as db:
            sender_result = await db.execute(
                select(UserDevice).where(UserDevice.user_id == sender_id)
            )
            sender_devices = sender_result.scalars().all()

        for dev in sender_devices:
            if dev.device_id == sending_device_id:
                continue
            
            delivered = await manager.send_to_user(sender_id, outgoing, target_device_id=dev.device_id)
            if not delivered:
                # Sender's secondary device is offline — queue in MessageQueue for offline sync
                async with AsyncSessionLocal() as db:
                    queued_msg = MessageQueue(
                        sender_id=sender_id,
                        receiver_id=sender_id,
                        device_id=dev.device_id,
                        encrypted_payload=encrypted_payload,
                        iv=iv,
                        message_type=message_type,
                        ttl=ttl,
                        file_name=file_name,
                        file_mime=file_mime,
                    )
                    db.add(queued_msg)
                    await db.commit()

        # 4. Send delivery confirmation specifically to the sending device
        await manager.send_to_user(sender_id, {
            "type": "delivery_status",
            "receiver_id": receiver_id,
            "status": "delivered" if any_receiver_online else "queued",
        }, target_device_id=sending_device_id)

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

