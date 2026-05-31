import { useEffect, useRef } from 'react';
import BrutalButton from '../ui/BrutalButton';
import BrutalBadge from '../ui/BrutalBadge';

export default function CallOverlay({
  visible,
  state,
  callType,
  contact,
  duration,
  remoteStream,
  muted,
  videoEnabled,
  error,
  onHangUp,
  onToggleMute,
  onToggleVideo,
}) {
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream || null;
    }
  }, [remoteStream]);

  if (!visible) return null;

  const formatDuration = () => {
    const minutes = Math.floor(duration / 60);
    const seconds = String(duration % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  const statusText =
    state === 'outgoing'
      ? 'Dialing...' 
      : state === 'incoming'
        ? 'Ringing...' 
        : 'In Call';

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center pointer-events-none">
      <div className="absolute inset-0 bg-vault-black/70 backdrop-blur-sm" />
      <div className="relative z-50 mb-6 w-[92%] max-w-3xl pointer-events-auto bg-white border-4 border-vault-black shadow-[8px_8px_0px_#0A0A0A] p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-display font-black uppercase text-base tracking-wide">{contact?.username || 'Vault Call'}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <BrutalBadge variant={state === 'active' ? 'green' : 'yellow'} className="text-[10px]">
                {statusText}
              </BrutalBadge>
              <span className="text-xs font-mono text-vault-darkgray">{callType === 'video' ? 'Video' : 'Voice'}</span>
              {state === 'active' && (
                <span className="text-xs font-mono text-vault-darkgray">{formatDuration()}</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <BrutalButton
              variant={muted ? 'red' : 'blue'}
              size="sm"
              onClick={onToggleMute}
              disabled={state !== 'active'}
            >
              {muted ? 'Unmute' : 'Mute'}
            </BrutalButton>
            <BrutalButton
              variant={videoEnabled ? 'green' : 'white'}
              size="sm"
              onClick={onToggleVideo}
              disabled={state !== 'active' || callType !== 'video'}
            >
              {videoEnabled ? 'Video On' : 'Video Off'}
            </BrutalButton>
            <BrutalButton variant="red" size="sm" onClick={onHangUp}>
              End Call
            </BrutalButton>
          </div>
        </div>

        {error && (
          <div className="mt-4 bg-vault-red text-white border-3 border-vault-black p-3 text-xs uppercase tracking-wide">
            {error}
          </div>
        )}

        {callType === 'video' ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="bg-vault-black border-3 border-vault-black overflow-hidden h-56 rounded-sm">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            </div>
            <div className="bg-vault-offwhite border-3 border-vault-black p-4 h-56 flex flex-col justify-center">
              <p className="font-display font-bold uppercase text-xs text-vault-darkgray mb-2">Session state</p>
              <p className="text-sm font-mono leading-relaxed text-vault-black">
                {state === 'active'
                  ? 'Peer connection established. Your audio/video stream is encrypted end-to-end.'
                  : 'Waiting for the remote party to join and complete the secure handshake.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-4 bg-vault-offwhite border-3 border-vault-black p-4 text-sm font-mono text-vault-darkgray">
            Secure audio call is live. All signaling is encrypted end-to-end with AES-256-GCM.
          </div>
        )}
      </div>
    </div>
  );
}
