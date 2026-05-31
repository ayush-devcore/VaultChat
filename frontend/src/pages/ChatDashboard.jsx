import { useState, useCallback, useRef, useEffect } from 'react';
import Sidebar from '../components/layout/Sidebar';
import ChatWindow from '../components/chat/ChatWindow';
import NewChatModal from '../components/chat/NewChatModal';
import { useAuth } from '../context/useAuth';
import useWebSocket from '../hooks/useWebSocket';
import useCallManager from '../hooks/useCallManager';
import {
  importPublicKey,
  importPrivateKey,
  deriveSharedSecret,
  decryptMessage,
  decryptBinary,
} from '../utils/crypto';
import { getPrivateKey, saveSharedSecret, getSharedSecret, saveLocalMessage, getLocalMessages } from '../utils/storage';
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

  // Request Notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Load message history from IndexedDB when active contact changes
  useEffect(() => {
    if (!activeContact || !user) return;
    
    const loadHistory = async () => {
      try {
        const history = await getLocalMessages(user.id, activeContact.id);
        setMessages((prev) => ({
          ...prev,
          [activeContact.id]: history,
        }));
      } catch (err) {
        console.error('❌ Failed to load chat history from IndexedDB:', err);
      }
    };
    
    loadHistory();
  }, [activeContact, user]);

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

    // Check if partner's public key is already cached in IndexedDB
    let partnerPublicKeyJwk = await getSharedSecret(user.id, partnerId);
    
    if (!partnerPublicKeyJwk) {
      console.log(`🌐 Fetching partner ${partnerId} public key from server...`);
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

      partnerPublicKeyJwk = keyData.public_key_jwk;
      // Cache partner's public key in IndexedDB for future instant derivations
      await saveSharedSecret(user.id, partnerId, partnerPublicKeyJwk);
      console.log(`💾 Partner ${partnerId} public key saved to IndexedDB`);
    } else {
      console.log(`⚡ Instant E2EE handshake: partner ${partnerId} public key loaded from IndexedDB cache`);
    }

    const foreignPublicKey = await importPublicKey(partnerPublicKeyJwk);

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
  const callManagerRef = useRef(null);

  const handleWsMessage = useCallback(async (data) => {
    if (data.type?.startsWith('call_') && callManagerRef.current) {
      await callManagerRef.current.handleCallSignal(data);
      return;
    }

    switch (data.type) {
      case 'message': {
        const senderId = data.sender_id;
        const receiverId = data.receiver_id;
        const msgType = data.message_type || 'TEXT';
        const partnerId = senderId === user.id ? receiverId : senderId;

        try {
          const sharedKey = await getOrDeriveSharedKey(partnerId);
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
              sender: senderId === user.id ? 'me' : 'them',
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
              sender: senderId === user.id ? 'me' : 'them',
              senderId,
              timestamp: ts,
              encrypted: true,
              messageType: 'TEXT',
              ttl: data.ttl || null,
            };
          }

          // Save received/synced message to local IndexedDB
          await saveLocalMessage(user.id, partnerId, newMsg);

          setMessages((prev) => ({
            ...prev,
            [partnerId]: [...(prev[partnerId] || []), newMsg],
          }));

          // If partner is not in contacts yet, add them
          setContacts((prev) => {
            if (!prev.find((c) => c.id === partnerId)) {
              return [{ id: partnerId, username: `user_${partnerId}`, unread: senderId === user.id ? 0 : 1 }, ...prev];
            }
            return prev.map((c) =>
              c.id === partnerId
                ? { ...c, unread: senderId === user.id ? (c.unread || 0) : (c.unread || 0) + 1 }
                : c
            );
          });

          // Trigger a Web Notification if the app is in the background and not sent by us
          if (senderId !== user.id && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
            new Notification('VØID', {
              body: 'New Encrypted Message',
              icon: '/pwa-192x192.svg',
            });
          }
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
  }, [getOrDeriveSharedKey, user]);

  // Connect WebSocket
  const { status: wsStatus, send: wsSend, isConnected } = useWebSocket(token, handleWsMessage);
  const callManager = useCallManager({ wsSend, getOrDeriveSharedKey, user });

  useEffect(() => {
    callManagerRef.current = callManager;
  }, [callManager]);

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
        callManager={callManager}
      />
      <NewChatModal
        isOpen={showNewChat}
        onClose={() => setShowNewChat(false)}
        onStartChat={handleNewChat}
      />
    </div>
  );
}
