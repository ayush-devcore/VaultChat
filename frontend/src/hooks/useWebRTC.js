import { useState, useEffect, useRef, useCallback } from 'react';

const STUN_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export default function useWebRTC({ localStream, localStreamRef, onRemoteStream, onIceCandidate, onConnectionStateChange, onEnded }) {
  const pcRef = useRef(null);
  const pendingIceRef = useRef([]);
  const [connectionState, setConnectionState] = useState('new');
  const [muted, setMuted] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const getCurrentStream = useCallback(() => {
    return localStreamRef?.current ?? localStream;
  }, [localStream, localStreamRef]);

  useEffect(() => {
    const stream = localStreamRef?.current ?? localStream;
    if (!stream) return;
    setMuted(stream?.getAudioTracks()[0]?.enabled === false);
    setVideoEnabled(stream?.getVideoTracks()[0]?.enabled ?? false);
  }, [localStream, localStreamRef, refreshKey]);

  const createPeerConnection = useCallback(() => {
    if (pcRef.current) return pcRef.current;

    const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        onIceCandidate?.(event.candidate);
      }
    };

    pc.ontrack = (event) => {
      onRemoteStream?.(event.streams?.[0] ?? event.stream ?? null);
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      setConnectionState(state);
      onConnectionStateChange?.(state);
      if (['disconnected', 'failed', 'closed'].includes(state)) {
        onEnded?.();
      }
    };

    pcRef.current = pc;
    return pc;
  }, [onConnectionStateChange, onEnded, onIceCandidate, onRemoteStream]);

  const updateSenders = useCallback((stream) => {
    const pc = pcRef.current;
    if (!pc || !stream) return;

    stream.getTracks().forEach((track) => {
      const existingSender = pc.getSenders().find((sender) => sender.track?.kind === track.kind);
      if (existingSender) {
        if (existingSender.track !== track) {
          existingSender.replaceTrack(track);
        }
      } else {
        pc.addTrack(track, stream);
      }
    });
  }, []);

  useEffect(() => {
    updateSenders(getCurrentStream());
  }, [getCurrentStream, updateSenders]);

  useEffect(() => {
    getCurrentStream();
  }, [getCurrentStream, refreshKey]);

  const ensureConnection = useCallback(async () => {
    const stream = getCurrentStream();
    if (!stream) {
      throw new Error('Local media stream is required for peer connection');
    }

    const pc = createPeerConnection();
    updateSenders(stream);
    return pc;
  }, [createPeerConnection, getCurrentStream, updateSenders]);

  const createOffer = useCallback(async () => {
    const pc = await ensureConnection();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    return offer;
  }, [ensureConnection]);

  const handleOffer = useCallback(async (offer) => {
    const pc = await ensureConnection();
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    if (pendingIceRef.current.length) {
      await Promise.all(
        pendingIceRef.current.map((candidate) => pc.addIceCandidate(new RTCIceCandidate(candidate)))
      );
      pendingIceRef.current = [];
    }
    return answer;
  }, [ensureConnection]);

  const handleAnswer = useCallback(async (answer) => {
    const pc = pcRef.current;
    if (!pc) {
      throw new Error('Peer connection is not initialized');
    }
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
    if (pendingIceRef.current.length) {
      await Promise.all(
        pendingIceRef.current.map((candidate) => pc.addIceCandidate(new RTCIceCandidate(candidate)))
      );
      pendingIceRef.current = [];
    }
  }, []);

  const addIceCandidate = useCallback(async (candidate) => {
    const pc = pcRef.current;
    const ice = new RTCIceCandidate(candidate);
    if (pc?.remoteDescription?.type) {
      await pc.addIceCandidate(ice);
    } else {
      pendingIceRef.current.push(candidate);
    }
  }, []);

  const hangUp = useCallback(() => {
    const pc = pcRef.current;
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
      pcRef.current = null;
    }
    pendingIceRef.current = [];
    setConnectionState('closed');
  }, []);

  const toggleMute = useCallback(() => {
    const stream = getCurrentStream();
    const audioTrack = stream?.getAudioTracks()[0];
    if (!audioTrack) return false;
    audioTrack.enabled = !audioTrack.enabled;
    setRefreshKey((prev) => prev + 1);
    return !audioTrack.enabled;
  }, [getCurrentStream]);

  const toggleVideo = useCallback(() => {
    const stream = getCurrentStream();
    const videoTrack = stream?.getVideoTracks()[0];
    if (!videoTrack) return false;
    videoTrack.enabled = !videoTrack.enabled;
    setRefreshKey((prev) => prev + 1);
    return videoTrack.enabled;
  }, [getCurrentStream]);

  return {
    connectionState,
    muted,
    videoEnabled,
    createOffer,
    handleOffer,
    handleAnswer,
    addIceCandidate,
    hangUp,
    toggleMute,
    toggleVideo,
  };
}
