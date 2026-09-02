import { useEffect, useRef, useState } from 'react';
import { api, getToken } from './api';

function wsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const token = getToken();
  // Same-origin: dev goes through the Vite proxy (:6001 -> :6000), prod through
  // the reverse proxy. Connecting straight to :6000 is blocked by browsers
  // (ERR_UNSAFE_PORT — 6000 is on Chromium's restricted list).
  return `${proto}://${window.location.host}/ws?token=${encodeURIComponent(
    token || ''
  )}`;
}

// Opens a WebSocket to the API and invokes onEvent(data) for every pushed
// frame ({ type: 'message' | 'settlement' | 'ready' | ... }). Reconnects with
// capped backoff. Returns `connected` so callers can run a fallback poll only
// while the socket is down.
export function useRealtime(onEvent) {
  const [connected, setConnected] = useState(false);
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;

  useEffect(() => {
    let ws;
    let retry = 0;
    let reconnectTimer;
    let pingTimer;
    let closed = false;

    const connect = () => {
      ws = new WebSocket(wsUrl());

      ws.onopen = () => {
        retry = 0;
        setConnected(true);
        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('ping');
        }, 25000);
      };

      ws.onmessage = (evt) => {
        if (evt.data === 'pong') return;
        try {
          cbRef.current?.(JSON.parse(evt.data));
        } catch {
          /* ignore malformed frame */
        }
      };

      ws.onclose = () => {
        setConnected(false);
        clearInterval(pingTimer);
        if (closed) return;
        retry += 1;
        // The browser hides the WS handshake's HTTP status, so a dead socket
        // could be an expired token. After a few misses, probe via REST —
        // api() auto-logs-out on 401, or succeeds (then it's just a proxy blip).
        if (retry === 3) api('/auth/me').catch(() => {});
        const delay = Math.min(1000 * 2 ** retry, 15000);
        reconnectTimer = setTimeout(connect, delay);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      closed = true;
      clearTimeout(reconnectTimer);
      clearInterval(pingTimer);
      ws?.close();
    };
  }, []);

  return connected;
}
