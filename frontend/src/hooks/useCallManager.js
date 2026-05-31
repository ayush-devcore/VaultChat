import { useState, useRef, useEffect, useCallback } from 'react';
import useWebRTC from './useWebRTC';
import { encryptMessage, decryptMessage } from '../utils/crypto';

const MAX_CALL_DURATION_SECONDS = 60 * 60; // 1 hour ceiling

function buildContact(partnerId, username) {
  return {
    id: partnerId,
    username: username || `user_${partnerId}`,
    avatar_base64: null,
  };
}

function getMediaConstraints(callType) {
  return {
    audio: true,
    video: callType === 'video' ? { width: 1280, height: 720 } : false,
  };
}

export default function useCallManager({ wsSend, getOrDeriveSharedKey, user }) {
  const [callState, setCallState] = useState('idle');
  const [callType, setCallType] = useState('audio');
  const [callContact, setCallContact] = useState(null);
  const [callError, setCallError] = useState('');
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callDuration, setCallDuration] = useState(0);

  const localStreamRef = useRef(null);
  const incomingOfferRef = useRef(null);
  const durationTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const startDurationTimer = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
    }
    setCallDuration(0);
    durationTimerRef.current = setInterval(() => {
      setCallDuration((prev) => Math.min(prev + 1, MAX_CALL_DURATION_SECONDS));
    }, 1000);
  }, []);

  const stopDurationTimer = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }, []);

  const cleanupMedia = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
  }, []);

  const sendSignal = useCallback(async (type, partnerId, payload = {}, signalCallType = callType) => {
    if (!wsSend || !user) {
      throw new Error('WebSocket is not available');
    }

    const sharedKey = await getOrDeriveSharedKey(partnerId);
    const encryptedPayload = await encryptMessage(sharedKey, JSON.stringify(payload || {}));

    wsSend({
      type,
      from: user.id,
      to: partnerId,
      callType: signalCallType,
      payload: encryptedPayload,
    });
  }, [callType, getOrDeriveSharedKey, user, wsSend]);

  const onIceCandidate = useCallback(async (candidate) => {
    if (!callContact?.id) return;
    try {
      await sendSignal('call_ice', callContact.id, { candidate });
    } catch (err) {
      console.error('Failed to send ICE candidate:', err);
    }
  }, [callContact, sendSignal]);

  const onConnectionStateChange = useCallback((state) => {
    if (state === 'connected') {
      setCallState('active');
      setCallError('');
      startDurationTimer();
    }

    if (state === 'failed' || state === 'disconnected') {
      setCallError('Call connection interrupted');
    }
  }, [startDurationTimer]);

  const onCallEnded = useCallback(() => {
    stopDurationTimer();
  }, [stopDurationTimer]);

  const {
    createOffer,
    handleOffer,
    handleAnswer,
    addIceCandidate,
    hangUp: hangUpPeerConnection,
    toggleMute,
    toggleVideo,
    muted,
    videoEnabled,
  } = useWebRTC({
    localStream,
    localStreamRef,
    onRemoteStream: setRemoteStream,
    onIceCandidate,
    onConnectionStateChange,
    onEnded: onCallEnded,
  });

  const resetCallState = useCallback(() => {
    cleanupMedia();
    hangUpPeerConnection();
    setCallState('idle');
    setCallContact(null);
    setCallType('audio');
    setCallError('');
    incomingOfferRef.current = null;
    stopDurationTimer();
    setCallDuration(0);
  }, [cleanupMedia, hangUpPeerConnection, stopDurationTimer]);

  const initiateCall = useCallback(async (contact, requestedCallType = 'audio') => {
    if (!contact?.id) return;

    setCallContact(contact);
    setCallType(requestedCallType);
    setCallError('');
    setCallState('outgoing');

    try {
      const stream = await navigator.mediaDevices.getUserMedia(getMediaConstraints(requestedCallType));
      localStreamRef.current = stream;
      setLocalStream(stream);

      const offer = await createOffer();
      await sendSignal('call_offer', contact.id, { sdp: offer }, requestedCallType);
    } catch (err) {
      console.error('Call initiation failed:', err);
      setCallError(
        err?.name === 'NotAllowedError'
          ? 'Microphone or camera permission denied. Grant access to proceed with the call.'
          : err?.message || 'Unable to start the call.'
      );
    }
  }, [createOffer, sendSignal]);

  const acceptCall = useCallback(async () => {
    if (!incomingOfferRef.current || !callContact?.id) return;

    setCallError('');
    setCallState('active');

    try {
      const stream = await navigator.mediaDevices.getUserMedia(getMediaConstraints(callType));
      localStreamRef.current = stream;
      setLocalStream(stream);

      const answer = await handleOffer(incomingOfferRef.current);
      await sendSignal('call_answer', callContact.id, { sdp: answer });
    } catch (err) {
      console.error('Accept call failed:', err);
      setCallError(
        err?.name === 'NotAllowedError'
          ? 'Microphone or camera permission denied. Grant access to answer the call.'
          : err?.message || 'Unable to join the call.'
      );
    }
  }, [callContact, callType, handleOffer, sendSignal]);

  const rejectCall = useCallback(async () => {
    if (callContact?.id) {
      try {
        await sendSignal('call_rejected', callContact.id, {}, callType);
      } catch (err) {
        console.error('Failed to send call rejection:', err);
      }
    }
    resetCallState();
  }, [callContact, callType, resetCallState, sendSignal]);

  const hangUp = useCallback(async () => {
    if (callContact?.id) {
      try {
        await sendSignal('call_ended', callContact.id, {}, callType);
      } catch (err) {
        console.error('Failed to send call ended signal:', err);
      }
    }
    resetCallState();
  }, [callContact, callType, resetCallState, sendSignal]);

  const handleIncomingCallSignal = useCallback(async (data) => {
    if (!data?.from) return;

    const partnerId = data.from;
    const caller = buildContact(partnerId, data.username || data.caller_username);
    const signalType = data.type;
    let decryptedPayload = {};

    try {
      const sharedKey = await getOrDeriveSharedKey(partnerId);
      if (data.payload?.ciphertext) {
        const json = await decryptMessage(sharedKey, data.payload.ciphertext, data.payload.iv);
        decryptedPayload = JSON.parse(json || '{}');
      }
    } catch (err) {
      console.error('Failed to decrypt call signal:', err);
      setCallError('Encrypted call handshake failed');
      return;
    }

    switch (signalType) {
      case 'call_offer': {
        if (callState !== 'idle') {
          await sendSignal('call_rejected', partnerId, {}, data.callType || callType);
          return;
        }

        incomingOfferRef.current = decryptedPayload.sdp;
        setCallType(data.callType || 'audio');
        setCallContact(caller);
        setCallError('');
        setCallState('incoming');
        break;
      }

      case 'call_answer': {
        if (callState !== 'outgoing') return;
        await handleAnswer(decryptedPayload.sdp);
        setCallState('active');
        break;
      }

      case 'call_ice': {
        if (!decryptedPayload.candidate) return;
        await addIceCandidate(decryptedPayload.candidate);
        break;
      }

      case 'call_rejected': {
        setCallError('The recipient declined your call.');
        resetCallState();
        break;
      }

      case 'call_ended': {
        setCallError('Call ended.');
        resetCallState();
        break;
      }

      default:
        break;
    }
  }, [addIceCandidate, callState, callType, getOrDeriveSharedKey, handleAnswer, resetCallState, sendSignal]);

  return {
    callState,
    callType,
    callContact,
    callError,
    remoteStream,
    localStream,
    callDuration,
    muted,
    videoEnabled,
    initiateCall,
    acceptCall,
    rejectCall,
    hangUp,
    toggleMute,
    toggleVideo,
    handleCallSignal: handleIncomingCallSignal,
  };
}
