import jwt from 'jsonwebtoken';
import { WebSocketServer } from 'ws';
import { config } from './db.js';
import { bus, Events } from './services/events.js';

// Attaches a WebSocket server on /ws to the given HTTP server.
// Auth: browsers connect with ?token=<jwt> (same token as the REST API).
// The server pushes { type: 'message' | 'settlement', ... } frames; the
// client reacts by refetching, so search/filter state stays authoritative.
export function attachRealtime(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const { pathname, searchParams } = new URL(req.url, 'http://localhost');
    if (pathname !== '/ws') return;

    const token = searchParams.get('token');
    let user;
    try {
      user = jwt.verify(token || '', config.jwtSecret);
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.user = user;
      ws.isAlive = true;
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'ready' }));
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.on('message', (raw) => {
      // Only reply to pings; clients don't otherwise send data.
      if (String(raw) === 'ping') ws.send('pong');
    });
  });

  const broadcast = (payload) => {
    const frame = JSON.stringify(payload);
    for (const ws of wss.clients) {
      if (ws.readyState === ws.OPEN) ws.send(frame);
    }
  };

  const onMessage = (data) => broadcast({ type: Events.MESSAGE, ...data });
  const onSettlement = (data) => broadcast({ type: Events.SETTLEMENT, ...data });
  bus.on(Events.MESSAGE, onMessage);
  bus.on(Events.SETTLEMENT, onSettlement);

  // Drop dead connections so wss.clients stays accurate.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeat);
    bus.off(Events.MESSAGE, onMessage);
    bus.off(Events.SETTLEMENT, onSettlement);
  });

  console.log('[realtime] websocket server ready on /ws');
  return wss;
}
