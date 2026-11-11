/**
 * Deskmate — Body Doubling WebSocket Relay Server
 *
 * Lightweight, zero-configuration WebSocket relay for synchronized focus
 * sessions and hand-glow presence between friends.
 */

import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';

const PORT = process.env.PORT || 8080;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', service: 'deskmate-relay' }));
});

const wss = new WebSocketServer({ server });

interface ClientSession {
  ws: WebSocket;
  room: string;
  clientName: string;
  lastActive: number;
}

const clients = new Map<WebSocket, ClientSession>();

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      const now = Date.now();

      if (msg.type === 'join') {
        const room = String(msg.room || 'DEFAULT').toUpperCase();
        const clientName = String(msg.clientName || 'Partner');
        clients.set(ws, { ws, room, clientName, lastActive: now });

        // Notify other peers in this room
        for (const [otherWs, session] of clients.entries()) {
          if (otherWs !== ws && session.room === room && otherWs.readyState === WebSocket.OPEN) {
            otherWs.send(JSON.stringify({ type: 'peer_joined', clientName }));
            ws.send(JSON.stringify({ type: 'peer_joined', clientName: session.clientName }));
          }
        }
      } else if (msg.type === 'presence_sync') {
        const session = clients.get(ws);
        if (session) {
          session.lastActive = now;
          // Broadcast presence update to peers in the same room
          for (const [otherWs, otherSession] of clients.entries()) {
            if (otherWs !== ws && otherSession.room === session.room && otherWs.readyState === WebSocket.OPEN) {
              otherWs.send(JSON.stringify({
                type: 'presence_sync',
                isFocusing: msg.isFocusing,
                remainingSeconds: msg.remainingSeconds,
                handPosition: msg.handPosition,
              }));
            }
          }
        }
      }
    } catch {
      // ignore malformed message
    }
  });

  ws.on('close', () => {
    const session = clients.get(ws);
    if (session) {
      clients.delete(ws);
      // Notify remaining room peers
      for (const [otherWs, otherSession] of clients.entries()) {
        if (otherSession.room === session.room && otherWs.readyState === WebSocket.OPEN) {
          otherWs.send(JSON.stringify({ type: 'peer_left', clientName: session.clientName }));
        }
      }
    }
  });
});

// 30-second idle check sweep
setInterval(() => {
  const now = Date.now();
  for (const [ws, session] of clients.entries()) {
    if (now - session.lastActive > 45000) {
      ws.terminate();
      clients.delete(ws);
    }
  }
}, 15000);

server.listen(PORT, () => {
  console.log(`[Deskmate Relay] Server listening on ws://localhost:${PORT}`);
});
