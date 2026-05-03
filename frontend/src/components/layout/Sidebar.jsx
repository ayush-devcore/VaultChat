import { useAuth } from '../../context/AuthContext';
import BrutalButton from '../ui/BrutalButton';
import BrutalBadge from '../ui/BrutalBadge';

/**
 * Sidebar — Chat contacts list with Neo-Brutalist styling.
 */
export default function Sidebar({ contacts = [], activeContact, onSelectContact, onNewChat, wsStatus, onlineUsers }) {
  const { user, logout, cryptoReady } = useAuth();

  return (
    <aside className="w-80 h-full bg-white border-r-4 border-vault-black flex flex-col">
      {/* Header */}
      <div className="bg-vault-black text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-vault-yellow border-2 border-white flex items-center justify-center font-display font-black text-vault-black text-lg overflow-hidden flex-shrink-0">
            {user?.avatar_base64 ? (
              <img src={user.avatar_base64} alt={user.username} className="w-full h-full object-cover" />
            ) : (
              user?.username?.[0]?.toUpperCase() || '?'
            )}
          </div>
          <div>
            <h2 className="font-display font-bold text-sm uppercase tracking-wider">
              {user?.username || 'User'}
            </h2>
            <BrutalBadge variant="green" dot className="text-[10px] mt-0.5 border-white/30">
              Online
            </BrutalBadge>
          </div>
        </div>
        <button
          onClick={logout}
          className="text-vault-gray hover:text-white transition-colors text-xl cursor-pointer"
          title="Logout"
          id="sidebar-logout-btn"
        >
          ⏻
        </button>
      </div>

      {/* Search / New Chat */}
      <div className="p-3 border-b-3 border-vault-black bg-vault-offwhite">
        <BrutalButton
          variant="pink"
          size="sm"
          fullWidth
          onClick={onNewChat}
          icon="+"
        >
          New Encrypted Chat
        </BrutalButton>
      </div>

      {/* Contact List */}
      <div className="flex-1 overflow-y-auto">
        {contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <div className="text-4xl mb-3">🔐</div>
            <p className="font-display font-bold text-sm uppercase text-vault-darkgray">
              No Conversations Yet
            </p>
            <p className="text-xs text-vault-gray mt-1 font-mono">
              Start a new encrypted chat above
            </p>
          </div>
        ) : (
          <ul className="divide-y-3 divide-vault-black">
            {contacts.map((contact) => (
              <li key={contact.id}>
                <button
                  id={`contact-${contact.id}`}
                  onClick={() => onSelectContact(contact)}
                  className={`
                    w-full text-left p-4 flex items-center gap-3 cursor-pointer
                    transition-all duration-100
                    ${activeContact?.id === contact.id
                      ? 'bg-vault-yellow'
                      : 'bg-white hover:bg-vault-offwhite'
                    }
                  `}
                >
                  {/* Avatar */}
                  <div className={`
                    w-11 h-11 flex-shrink-0 border-3 border-vault-black flex items-center justify-center overflow-hidden
                    font-display font-black text-base
                    ${activeContact?.id === contact.id ? 'bg-vault-black text-vault-yellow' : 'bg-vault-pink text-vault-black'}
                  `}>
                    {contact.avatar_base64 ? (
                      <img src={contact.avatar_base64} alt={contact.username} className="w-full h-full object-cover" />
                    ) : (
                      contact.username[0].toUpperCase()
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-display font-bold text-sm uppercase truncate">
                        {contact.username}
                      </span>
                      {contact.unread > 0 && (
                        <span className="bg-vault-red text-white text-xs font-bold w-5 h-5 flex items-center justify-center border-2 border-vault-black">
                          {contact.unread}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        onlineUsers?.has(contact.id) ? 'bg-vault-green' : 'bg-vault-gray'
                      }`} />
                      <p className="text-xs text-vault-darkgray truncate font-mono">
                        {contact.lastMessage || '🔒 Encrypted message'}
                      </p>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Security Footer */}
      <div className="p-3 border-t-3 border-vault-black bg-vault-offwhite">
        <div className="flex items-center justify-center gap-3">
          <div className="flex items-center gap-1">
            <span className="text-xs font-mono text-vault-darkgray">
              {cryptoReady ? '🛡️ E2EE' : '⏳ Init'}
            </span>
            <span className={`w-2 h-2 rounded-full animate-[pulse-dot_1.5s_ease-in-out_infinite] ${
              cryptoReady ? 'bg-vault-green' : 'bg-vault-yellow'
            }`} />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs font-mono text-vault-darkgray">
              {wsStatus === 'connected' ? '🔌 WS' : wsStatus === 'connecting' ? '🔄 WS' : '❌ WS'}
            </span>
            <span className={`w-2 h-2 rounded-full ${
              wsStatus === 'connected' ? 'bg-vault-green animate-[pulse-dot_1.5s_ease-in-out_infinite]'
                : wsStatus === 'connecting' ? 'bg-vault-yellow animate-[pulse-dot_0.8s_ease-in-out_infinite]'
                : 'bg-vault-red'
            }`} />
          </div>
        </div>
      </div>
    </aside>
  );
}
