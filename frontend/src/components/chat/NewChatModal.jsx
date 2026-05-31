import { useState } from 'react';
import BrutalButton from '../ui/BrutalButton';
import BrutalInput from '../ui/BrutalInput';
import BrutalCard from '../ui/BrutalCard';
import { useAuth } from '../../context/useAuth';
import { API_BASE_URL } from '../../config';

/**
 * NewChatModal — Modal to start a new encrypted conversation.
 */
export default function NewChatModal({ isOpen, onClose, onStartChat }) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { token, user } = useAuth();

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim()) {
      setError('Enter a username');
      return;
    }
    if (username.trim().toLowerCase() === user?.username?.toLowerCase()) {
      setError("You can't chat with yourself");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/users/search/${encodeURIComponent(username.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.detail || 'User not found');
        return;
      }
      const foundUser = await res.json();
      onStartChat({ id: foundUser.id, username: foundUser.username, avatar_base64: foundUser.avatar_base64, unread: 0 });
      setUsername('');
      onClose();
    } catch {
      setError('Network error — is the server running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-vault-black/60"
        onClick={onClose}
      />

      {/* Modal */}
      <BrutalCard
        shadow="lg"
        className="relative z-10 w-[92%] md:w-full md:max-w-md mx-auto md:mx-4 animate-[fadeIn_0.2s_ease-out]"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-xl font-black uppercase">
            🔐 New Encrypted Chat
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 bg-vault-red text-white border-2 border-vault-black flex items-center justify-center font-bold hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all shadow-[2px_2px_0px_#0A0A0A] cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <BrutalInput
            id="new-chat-username"
            label="Recipient Username"
            placeholder="Enter their handle..."
            value={username}
            onChange={(e) => { setUsername(e.target.value); setError(''); }}
            error={error}
            icon="👤"
          />

          <div className="bg-vault-offwhite border-3 border-vault-black p-3 mt-1">
            <p className="text-xs font-mono text-vault-darkgray leading-relaxed">
              ⚡ An <span className="font-bold text-vault-black">ECDH key exchange</span> will
              be initiated automatically. Your shared secret will be derived client-side.
            </p>
          </div>

          <div className="flex gap-3 mt-2">
            <BrutalButton
              type="button"
              variant="white"
              size="md"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </BrutalButton>
            <BrutalButton
              type="submit"
              variant="green"
              size="md"
              loading={loading}
              className="flex-1"
            >
              ✦ Start Chat
            </BrutalButton>
          </div>
        </form>
      </BrutalCard>
    </div>
  );
}
