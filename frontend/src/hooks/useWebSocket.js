import { useState, useEffect, useRef, useCallback } from 'react';
import { WS_BASE_URL } from '../config';

/**
 * ═══════════════════════════════════════════════════════════════
 * useWebSocket — Custom React hook for WebSocket connection.
 * ═══════════════════════════════════════════════════════════════
 *
 * Manages the WebSocket lifecycle:
 *   - Connects using JWT token in the URL path
 *   - Tracks connection status (connecting / connected / disconnected)
 *   - Auto-reconnects with exponential backoff
 *   - Exposes send() and onMessage callback
 */

/**
 * @param {string|null} token - JWT token for authentication
 * @param {function} onMessage - Callback for incoming messages
 * @returns {{ status, send, isConnected }}
 */
export default function useWebSocket(token, onMessage) {
  const [status, setStatus] = useState('disconnected'); // connecting | connected | disconnected
  const wsRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const maxReconnectAttempts = 10;

  // Keep the callback ref fresh without re-triggering effects
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connect = useCallback(() => {
    if (!token) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    setStatus('connecting');
    console.log('🔌 WebSocket connecting...');

    const ws = new WebSocket(`${WS_BASE_URL}/${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      reconnectAttemptRef.current = 0;
      console.log('✅ WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessageRef.current?.(data);
      } catch (err) {
        console.error('❌ Failed to parse WebSocket message:', err);
      }
    };

    ws.onclose = (event) => {
      setStatus('disconnected');
      console.log(`🔌 WebSocket closed (code: ${event.code})`);

      // Don't reconnect on auth failures (4001)
      if (event.code === 4001) {
        console.error('❌ WebSocket auth failed — not reconnecting');
        return;
      }

      // Exponential backoff reconnect
      if (reconnectAttemptRef.current < maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000);
        reconnectAttemptRef.current++;
        console.log(`🔄 Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current})...`);
        reconnectTimerRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
    };
  }, [token]);

  // Connect when token becomes available
  useEffect(() => {
    if (token) {
      connect();
    }

    return () => {
      // Cleanup on unmount
      clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [token, connect]);

  /**
   * Send a JSON message over the WebSocket.
   * @param {object} data - Message payload
   */
  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }
    console.warn('⚠️ WebSocket not connected — message not sent');
    return false;
  }, []);

  return {
    status,
    send,
    isConnected: status === 'connected',
  };
}
