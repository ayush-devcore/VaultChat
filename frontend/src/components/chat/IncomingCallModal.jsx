import BrutalButton from '../ui/BrutalButton';

export default function IncomingCallModal({ visible, contact, callType, error, onAccept, onReject }) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-vault-black/80" />
      <div className="relative z-10 w-[92%] max-w-md bg-white border-4 border-vault-black shadow-[8px_8px_0px_#0A0A0A] p-6 animate-[slideInRight_0.25s_ease-out]">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 bg-vault-pink border-3 border-vault-black flex items-center justify-center font-display font-black text-2xl overflow-hidden">
            {contact?.avatar_base64 ? (
              <img src={contact.avatar_base64} alt={contact.username} className="w-full h-full object-cover" />
            ) : (
              contact?.username?.[0]?.toUpperCase() || '📞'
            )}
          </div>
          <div>
            <p className="font-display font-black text-lg uppercase tracking-wide">
              {contact?.username || 'Incoming Call'}
            </p>
            <p className="text-xs font-mono text-vault-darkgray mt-1 uppercase tracking-wider">
              {callType === 'video' ? 'Secure video call' : 'Secure voice call'}
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-vault-red text-white border-3 border-vault-black p-3 mb-4 text-xs uppercase tracking-wide">
            {error}
          </div>
        )}

        <div className="bg-vault-offwhite border-3 border-vault-black p-4 mb-4 text-sm font-mono text-vault-darkgray">
          Incoming encrypted call. Answer to begin a peer-to-peer secure connection.
        </div>

        <div className="grid grid-cols-2 gap-3">
          <BrutalButton variant="green" size="md" onClick={onAccept}>
            Accept
          </BrutalButton>
          <BrutalButton variant="red" size="md" onClick={onReject}>
            Decline
          </BrutalButton>
        </div>
      </div>
    </div>
  );
}
