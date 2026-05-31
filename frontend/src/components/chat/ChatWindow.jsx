import { useState, useRef, useEffect, useCallback } from 'react';
import BrutalButton from '../ui/BrutalButton';
import BrutalBadge from '../ui/BrutalBadge';
import CryptoDebugger from './CryptoDebugger';
import IncomingCallModal from './IncomingCallModal';
import CallOverlay from './CallOverlay';
import { encryptMessage, encryptBinary } from '../../utils/crypto';
import { useAuth } from '../../context/useAuth';
import { saveLocalMessage } from '../../utils/storage';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB limit

const TTL_OPTIONS = [
  { label: 'OFF', value: null },
  { label: '10s', value: 10 },
  { label: '30s', value: 30 },
];

/**
 * SelfDestructBubble — Wrapper that counts down TTL and removes message.
 */
function SelfDestructBubble({ ttl, messageId, onExpire, children }) {
  const [remaining, setRemaining] = useState(ttl);

  useEffect(() => {
    if (!ttl) return;
    const timer = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onExpire(messageId);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [ttl, messageId, onExpire]);

  if (!ttl) return children;

  return (
    <div className="relative">
      {children}
      <div className="absolute -top-2 -right-2 bg-vault-red text-white text-[10px] font-bold w-6 h-6 flex items-center justify-center border-2 border-vault-black animate-[pulse-dot_1s_ease-in-out_infinite]">
        {remaining}
      </div>
    </div>
  );
}

/**
 * ChatWindow — E2EE messaging with media support and self-destruct.
 */
export default function ChatWindow({
  activeContact,
  messages = [],
  setMessages,
  wsSend,
  isConnected,
  getOrDeriveSharedKey,
  onlineUsers,
  callManager,
}) {
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [keyReady, setKeyReady] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [ttl, setTtl] = useState(null); // Self-destruct TTL
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const sharedKeyRef = useRef(null);
  const { user } = useAuth();

  const resetKeyState = useCallback(() => {
    setKeyReady(false);
    setKeyError('');
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Derive shared key when active contact changes
  useEffect(() => {
    let cancelled = false;
    sharedKeyRef.current = null;

    const init = async () => {
      resetKeyState();

      if (!activeContact) {
        return;
      }

      try {
        const key = await getOrDeriveSharedKey(activeContact.id);
        if (!cancelled) {
          sharedKeyRef.current = key;
          setKeyReady(true);
          inputRef.current?.focus();
        }
      } catch (err) {
        if (!cancelled) {
          setKeyError(err.message || 'Key exchange failed');
        }
      }
    };

    init();
    return () => { cancelled = true; };
  }, [activeContact, getOrDeriveSharedKey, resetKeyState]);

  // Remove expired self-destruct messages
  const handleExpire = useCallback((messageId) => {
    if (!activeContact) return;
    setMessages((prev) => ({
      ...prev,
      [activeContact.id]: (prev[activeContact.id] || []).filter((m) => m.id !== messageId),
    }));
  }, [activeContact, setMessages]);

  // ── Send encrypted text message ──
  const handleSend = async (e) => {
    e.preventDefault();
    if (!messageInput.trim() || !sharedKeyRef.current || !isConnected) return;

    setSending(true);
    try {
      const plaintext = messageInput.trim();
      const { ciphertext, iv } = await encryptMessage(sharedKeyRef.current, plaintext);

      const payload = {
        type: 'message',
        receiver_id: activeContact.id,
        encrypted_payload: ciphertext,
        iv,
        message_type: 'TEXT',
        timestamp: new Date().toISOString(),
      };
      if (ttl) payload.ttl = ttl;

      const sent = wsSend(payload);

      if (sent) {
        const newMsg = {
          id: Date.now(),
          text: plaintext,
          sender: 'me',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          encrypted: true,
          messageType: 'TEXT',
          ttl: ttl,
        };

        // Save sent message to local IndexedDB
        await saveLocalMessage(user.id, activeContact.id, newMsg);

        setMessages((prev) => ({
          ...prev,
          [activeContact.id]: [...(prev[activeContact.id] || []), newMsg],
        }));
        setMessageInput('');
      }
    } catch (err) {
      console.error('❌ Encryption failed:', err);
    } finally {
      setSending(false);
    }
  };

  // ── Send encrypted media (image/document) ──
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !sharedKeyRef.current || !isConnected) return;

    if (file.size > MAX_FILE_SIZE) {
      alert(`File too large! Maximum is ${MAX_FILE_SIZE / 1024 / 1024}MB`);
      fileInputRef.current.value = '';
      return;
    }

    setSending(true);
    try {
      const buffer = await file.arrayBuffer();
      const { ciphertext, iv } = await encryptBinary(sharedKeyRef.current, buffer);

      const isImage = file.type.startsWith('image/');
      const messageType = isImage ? 'IMAGE' : 'DOCUMENT';

      const payload = {
        type: 'message',
        receiver_id: activeContact.id,
        encrypted_payload: ciphertext,
        iv,
        message_type: messageType,
        file_name: file.name,
        file_mime: file.type,
        timestamp: new Date().toISOString(),
      };
      if (ttl) payload.ttl = ttl;

      const sent = wsSend(payload);

      if (sent) {
        // Create local preview
        const localUrl = URL.createObjectURL(file);
        const newMsg = {
          id: Date.now(),
          sender: 'me',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          encrypted: true,
          messageType,
          mediaUrl: localUrl,
          fileName: file.name,
          fileMime: file.type,
          ttl: ttl,
        };

        // Save sent media message to local IndexedDB
        await saveLocalMessage(user.id, activeContact.id, newMsg);

        setMessages((prev) => ({
          ...prev,
          [activeContact.id]: [...(prev[activeContact.id] || []), newMsg],
        }));
      }
    } catch (err) {
      console.error('❌ Media encryption failed:', err);
    } finally {
      setSending(false);
      fileInputRef.current.value = '';
    }
  };

  // ── No active conversation — show welcome ──
  if (!activeContact) {
    return (
      <div className="flex-1 flex flex-col bg-vault-offwhite overflow-y-auto">
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="text-center animate-[fadeIn_0.4s_ease-out]">
            <div className="text-7xl mb-4">🔐</div>
            <h2 className="font-display text-2xl font-black uppercase mb-2">
              Select a Conversation
            </h2>
            <p className="text-vault-darkgray font-mono text-sm max-w-xs">
              Choose a contact from the sidebar or start a new encrypted chat.
            </p>
            <div className="mt-6 flex items-center justify-center gap-2">
              <BrutalBadge variant="yellow">ECDH P-256</BrutalBadge>
              <BrutalBadge variant="pink">AES-GCM</BrutalBadge>
              <BrutalBadge variant="green">E2EE</BrutalBadge>
            </div>
          </div>
          <div className="w-full max-w-2xl mt-6">
            <CryptoDebugger />
          </div>
        </div>
      </div>
    );
  }

  const isOnline = onlineUsers?.has(activeContact.id);

  // ── Active conversation ──
  return (
    <div className="flex-1 flex flex-col bg-vault-offwhite">
      {/* ── Chat Header ── */}
      <header className="bg-white border-b-4 border-vault-black px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-vault-pink border-3 border-vault-black flex items-center justify-center font-display font-black text-vault-black overflow-hidden flex-shrink-0">
            {activeContact.avatar_base64 ? (
              <img src={activeContact.avatar_base64} alt={activeContact.username} className="w-full h-full object-cover" />
            ) : (
              activeContact.username[0].toUpperCase()
            )}
          </div>
          <div>
            <h3 className="font-display font-bold text-base uppercase tracking-wide">
              {activeContact.username}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <BrutalBadge variant={isOnline ? 'green' : 'gray'} dot className="text-[10px]">
                {isOnline ? 'Online' : 'Offline'}
              </BrutalBadge>
              {keyReady ? (
                <BrutalBadge variant="green" className="text-[10px]">
                  🔒 E2EE
                </BrutalBadge>
              ) : keyError ? (
                <BrutalBadge variant="red" className="text-[10px]">
                  ⚠ Key Error
                </BrutalBadge>
              ) : (
                <BrutalBadge variant="yellow" className="text-[10px]">
                  ⏳ Handshake...
                </BrutalBadge>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Voice / Video Call Buttons */}
          {activeContact && onlineUsers?.has(activeContact.id) && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => callManager?.initiateCall(activeContact, 'audio')}
                disabled={!keyReady || !isConnected || callManager?.callState !== 'idle'}
                className={`border-3 border-vault-black bg-white px-3 py-2 text-[10px] font-display font-bold uppercase transition-all duration-100 ${
                  keyReady && isConnected && callManager?.callState === 'idle'
                    ? 'hover:bg-vault-yellow cursor-pointer'
                    : 'bg-vault-gray cursor-not-allowed opacity-50'
                }`}
              >
                📞 Voice
              </button>
              <button
                type="button"
                onClick={() => callManager?.initiateCall(activeContact, 'video')}
                disabled={!keyReady || !isConnected || callManager?.callState !== 'idle'}
                className={`border-3 border-vault-black bg-white px-3 py-2 text-[10px] font-display font-bold uppercase transition-all duration-100 ${
                  keyReady && isConnected && callManager?.callState === 'idle'
                    ? 'hover:bg-vault-yellow cursor-pointer'
                    : 'bg-vault-gray cursor-not-allowed opacity-50'
                }`}
              >
                🎥 Video
              </button>
            </div>
          )}

          {/* Self-Destruct Toggle */}
          <div className="flex items-center border-3 border-vault-black bg-white">
            {TTL_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => setTtl(opt.value)}
                className={`px-2 py-1 text-[10px] font-display font-bold uppercase cursor-pointer transition-colors
                  ${ttl === opt.value
                    ? opt.value ? 'bg-vault-red text-white' : 'bg-vault-black text-white'
                    : 'bg-white text-vault-black hover:bg-vault-offwhite'
                  }
                `}
              >
                {opt.value ? `💀${opt.label}` : opt.label}
              </button>
            ))}
          </div>

          {isConnected ? (
            <BrutalBadge variant="green" dot className="text-[10px]">WS</BrutalBadge>
          ) : (
            <BrutalBadge variant="red" dot className="text-[10px]">WS</BrutalBadge>
          )}
        </div>
      </header>

      {/* ── Messages Area ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {keyError && (
          <div className="bg-vault-red text-white border-3 border-vault-black p-3 font-bold text-xs uppercase tracking-wide text-center">
            ⚠ {keyError}
          </div>
        )}

        {/* Self-destruct active banner */}
        {ttl && (
          <div className="bg-vault-red/10 border-3 border-vault-red p-2 text-center">
            <span className="text-xs font-display font-bold uppercase text-vault-red">
              💀 VOID MODE ACTIVE — Messages self-destruct in {ttl}s
            </span>
          </div>
        )}

        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-60">
            <div className="text-5xl mb-3">🔑</div>
            <p className="font-display font-bold text-sm uppercase text-vault-darkgray">
              {keyReady ? 'Encrypted Channel Established' : 'Establishing Encrypted Channel...'}
            </p>
            <p className="text-xs text-vault-gray font-mono mt-1">
              {keyReady ? 'ECDH key exchange complete • AES-256-GCM active' : 'Performing ECDH key exchange...'}
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <SelfDestructBubble
              key={msg.id}
              ttl={msg.ttl}
              messageId={msg.id}
              onExpire={handleExpire}
            >
              <div className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`
                    max-w-xs md:max-w-md border-3 border-vault-black p-3
                    ${msg.sender === 'me'
                      ? 'bg-vault-yellow shadow-[3px_3px_0px_#0A0A0A]'
                      : 'bg-white shadow-[3px_3px_0px_#0A0A0A]'
                    }
                    ${msg.ttl ? 'border-vault-red' : ''}
                  `}
                >
                  {/* Text message */}
                  {msg.messageType === 'TEXT' && (
                    <p className="font-body text-sm break-words">{msg.text}</p>
                  )}

                  {/* Image message */}
                  {msg.messageType === 'IMAGE' && msg.mediaUrl && (
                    <div>
                      <img
                        src={msg.mediaUrl}
                        alt="Encrypted image"
                        className="max-w-full border-2 border-vault-black"
                        style={{ maxHeight: '240px', objectFit: 'contain' }}
                      />
                      <p className="text-[10px] font-mono text-vault-darkgray mt-1">
                        📎 {msg.fileName || 'image'}
                      </p>
                    </div>
                  )}

                  {/* Document message */}
                  {msg.messageType === 'DOCUMENT' && msg.mediaUrl && (
                    <a
                      href={msg.mediaUrl}
                      download={msg.fileName || 'document'}
                      className="flex items-center gap-2 p-2 bg-vault-offwhite border-2 border-vault-black hover:bg-vault-yellow transition-colors"
                    >
                      <span className="text-2xl">📄</span>
                      <div>
                        <p className="font-display font-bold text-xs uppercase truncate max-w-[200px]">
                          {msg.fileName || 'document'}
                        </p>
                        <p className="text-[10px] font-mono text-vault-darkgray">
                          Click to download
                        </p>
                      </div>
                    </a>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between mt-2 gap-3">
                    <span className="text-[10px] text-vault-darkgray font-mono">
                      {msg.timestamp}
                    </span>
                    <div className="flex items-center gap-1">
                      {msg.ttl && (
                        <span className="text-[10px] text-vault-red font-mono font-bold">💀</span>
                      )}
                      {msg.encrypted && (
                        <span className="text-[10px] text-vault-darkgray font-mono">🔒</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </SelfDestructBubble>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Message Input ── */}
      <form
        onSubmit={handleSend}
        className="bg-white border-t-4 border-vault-black p-4 flex items-center gap-3"
      >
        {/* File attachment */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx,.txt,.zip"
          onChange={handleFileSelect}
          className="hidden"
          id="file-upload-input"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!keyReady || !isConnected || sending}
          className={`
            w-10 h-10 border-3 border-vault-black flex items-center justify-center text-lg
            cursor-pointer transition-all duration-100
            ${keyReady && isConnected
              ? 'bg-vault-pink hover:bg-vault-yellow shadow-[2px_2px_0px_#0A0A0A] hover:shadow-[1px_1px_0px_#0A0A0A] active:shadow-none'
              : 'bg-vault-gray cursor-not-allowed opacity-50'
            }
          `}
          title="Attach file (max 5MB)"
        >
          📎
        </button>

        <input
          ref={inputRef}
          id="chat-message-input"
          type="text"
          placeholder={
            !keyReady ? 'Waiting for key exchange...'
              : !isConnected ? 'WebSocket disconnected...'
              : ttl ? `💀 Void mode (${ttl}s) — Type a message...`
              : 'Type an encrypted message...'
          }
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          className={`brutal-input focus:brutal-input-focus flex-1 ${ttl ? 'border-vault-red' : ''}`}
          autoComplete="off"
          disabled={!keyReady || !isConnected}
        />
        <BrutalButton
          type="submit"
          variant={ttl ? 'red' : 'yellow'}
          size="md"
          disabled={!messageInput.trim() || !keyReady || !isConnected || sending}
          loading={sending}
        >
          {ttl ? '💀 VOID' : '🔒 SEND'}
        </BrutalButton>
      </form>

      <IncomingCallModal
        visible={callManager?.callState === 'incoming'}
        contact={callManager?.callContact}
        callType={callManager?.callType}
        error={callManager?.callError}
        onAccept={callManager?.acceptCall}
        onReject={callManager?.rejectCall}
      />

      <CallOverlay
        visible={callManager?.callState !== 'idle'}
        state={callManager?.callState}
        callType={callManager?.callType}
        contact={callManager?.callContact}
        duration={callManager?.callDuration}
        remoteStream={callManager?.remoteStream}
        muted={callManager?.muted}
        videoEnabled={callManager?.videoEnabled}
        error={callManager?.callError}
        onHangUp={callManager?.hangUp}
        onToggleMute={callManager?.toggleMute}
        onToggleVideo={callManager?.toggleVideo}
      />
    </div>
  );
}
