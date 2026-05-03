import { useState, useCallback, useRef } from 'react';
import Sidebar from '../components/layout/Sidebar';
import ChatWindow from '../components/chat/ChatWindow';
import NewChatModal from '../components/chat/NewChatModal';
import { useAuth } from '../context/AuthContext';
import useWebSocket from '../hooks/useWebSocket';
import {
  importPublicKey,
  importPrivateKey,
  deriveSharedSecret,
  decryptMessage,
  decryptBinary,
} from '../utils/crypto';
import { getPrivateKey } from '../utils/storage';
import { API_BASE_URL } from '../config';

/**
 * ChatDashboard — Main chat interface.
 * Manages WebSocket connection, contact list, message state,
 * and ECDH key exchange orchestration.
 */
export default function ChatDashboard() {
  const [contacts, setContacts] = useState([]);
  const [activeContact, setActiveContact] = useState(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [messages, setMessages] = useState({}); // { [contactId]: [msg, msg, ...] }
  const [onlineUsers, setOnlineUsers] = useState(new Set());

  const { user, token } = useAuth();

  // Shared key cache (in-memory CryptoKey objects, not serializable)
  const sharedKeysRef = useRef({});

  /**
   * Get or derive the shared AES-GCM key for a given partner.
   */
  const getOrDeriveSharedKey = useCallback(async (partnerId) => {
    // Check in-memory cache first
    if (sharedKeysRef.current[partnerId]) {
      return sharedKeysRef.current[partnerId];
    }

    // Load our private key from IndexedDB
    const privateKeyJwk = await getPrivateKey(user.id);
    if (!privateKeyJwk) {
      throw new Error('Private key not found in IndexedDB');
    }
    const privateKey = await importPrivateKey(privateKeyJwk);

    // Fetch partner's public key from server (with retry for race conditions)
    let keyData = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await fetch(`${API_BASE_URL}/users/keys/${partnerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        keyData = await res.json();
        break;
      }

      if (attempt < 3) {
        console.log(`⏳ Partner key not ready, retrying in 1.5s (attempt ${attempt}/3)...`);
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    if (!keyData) {
      throw new Error(`Public key not found for user ${partnerId} — they may not have completed registration`);
    }

    const foreignPublicKey = await importPublicKey(keyData.public_key_jwk);

    // Derive shared secret
    const sharedKey = await deriveSharedSecret(privateKey, foreignPublicKey);

    // Cache in memory
    sharedKeysRef.current[partnerId] = sharedKey;
    console.log(`🤝 Shared secret derived for user ${partnerId}`);

    return sharedKey;
  }, [user, token]);

  /**
   * Handle incoming WebSocket messages.
   */
  const handleWsMessage = useCallback(async (data) => {
    switch (data.type) {
      case 'message': {
        const senderId = data.sender_id;
        const msgType = data.message_type || 'TEXT';
        try {
          const sharedKey = await getOrDeriveSharedKey(senderId);
          const ts = data.timestamp
            ? new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          let newMsg;

          if (msgType === 'IMAGE' || msgType === 'DOCUMENT') {
            // Decrypt binary media
            const decryptedBuffer = await decryptBinary(sharedKey, data.encrypted_payload, data.iv);
            const mimeType = msgType === 'IMAGE' ? (data.file_mime || 'image/png') : (data.file_mime || 'application/octet-stream');
            const blob = new Blob([decryptedBuffer], { type: mimeType });
            const objectUrl = URL.createObjectURL(blob);

            newMsg = {
              id: data.message_id || Date.now(),
              sender: 'them',
              senderId,
              timestamp: ts,
              encrypted: true,
              messageType: msgType,
              mediaUrl: objectUrl,
              fileName: data.file_name || 'file',
              fileMime: mimeType,
              ttl: data.ttl || null,
            };
          } else {
            // Decrypt text message
            const plaintext = await decryptMessage(sharedKey, data.encrypted_payload, data.iv);
            newMsg = {
              id: data.message_id || Date.now(),
              text: plaintext,
              sender: 'them',
              senderId,
              timestamp: ts,
              encrypted: true,
              messageType: 'TEXT',
              ttl: data.ttl || null,
            };
          }

          setMessages((prev) => ({
            ...prev,
            [senderId]: [...(prev[senderId] || []), newMsg],
          }));

          // If sender is not in contacts yet, add them
          setContacts((prev) => {
            if (!prev.find((c) => c.id === senderId)) {
              return [{ id: senderId, username: `user_${senderId}`, unread: 1 }, ...prev];
            }
            return prev.map((c) =>
              c.id === senderId ? { ...c, unread: (c.unread || 0) + 1 } : c
            );
          });
        } catch (err) {
          console.error('❌ Failed to decrypt message:', err);
        }
        break;
      }

      case 'delivery_status': {
        console.log(`📨 Delivery: ${data.status} to user ${data.receiver_id}`);
        break;
      }

      case 'user_online': {
        setOnlineUsers((prev) => new Set(prev).add(data.user_id));
        break;
      }

      case 'user_offline': {
        setOnlineUsers((prev) => {
          const next = new Set(prev);
          next.delete(data.user_id);
          return next;
        });
        break;
      }

      case 'typing': {
        // Could add typing indicators in future
        break;
      }

      default:
        console.log('Unknown WS message type:', data.type);
    }
  }, [getOrDeriveSharedKey]);

  // Connect WebSocket
  const { status: wsStatus, send: wsSend, isConnected } = useWebSocket(token, handleWsMessage);

  const handleNewChat = (contact) => {
    if (!contacts.find((c) => c.id === contact.id)) {
      setContacts((prev) => [contact, ...prev]);
    }
    setActiveContact(contact);
  };

  const handleSelectContact = (contact) => {
    setActiveContact(contact);
    // Clear unread count
    setContacts((prev) =>
      prev.map((c) => (c.id === contact.id ? { ...c, unread: 0 } : c))
    );
  };

  return (
    <div className="h-screen flex flex-col md:flex-row overflow-hidden">
      <Sidebar
        contacts={contacts}
        activeContact={activeContact}
        onSelectContact={handleSelectContact}
        onNewChat={() => setShowNewChat(true)}
        wsStatus={wsStatus}
        onlineUsers={onlineUsers}
      />
      <ChatWindow
        activeContact={activeContact}
        messages={messages[activeContact?.id] || []}
        setMessages={setMessages}
        wsSend={wsSend}
        isConnected={isConnected}
        getOrDeriveSharedKey={getOrDeriveSharedKey}
        onlineUsers={onlineUsers}
      />
      <NewChatModal
        isOpen={showNewChat}
        onClose={() => setShowNewChat(false)}
        onStartChat={handleNewChat}
      />
    </div>
  );
}
