import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const MAX_PLAYERS = 4;
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;

interface SignalMessage {
  from: number;
  to: number;
  type: 'offer' | 'answer';
  sdp: RTCSessionDescriptionInit;
}

interface RelayPacket {
  from: number;
  data: unknown;
}

interface RoomState {
  code: string;
  createdAt: number;
  lastActiveAt: number;
  nextPeerId: number;
  peers: Set<number>;
  pendingJoins: number[];
  hostSignals: SignalMessage[];
  peerSignals: Map<number, SignalMessage[]>;
  hostRelayQueue: RelayPacket[];
  peerRelayQueues: Map<number, RelayPacket[]>;
}

const rooms = new Map<string, RoomState>();

function generateFiveDigitCode(): string {
  for (let i = 0; i < 64; i++) {
    const code = String(Math.floor(10000 + Math.random() * 90000));
    if (!rooms.has(code)) return code;
  }
  return String(Math.floor(10000 + Math.random() * 90000));
}

// Periodic cleanup for expired rooms
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (now - room.lastActiveAt > ROOM_TTL_MS) {
      rooms.delete(code);
    }
  }
}, 60_000).unref();

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '512kb' }));

  // Create a 5-digit multiplayer room (4 players max: Host + 3 peers)
  app.post('/api/rooms', (_req, res) => {
    const code = generateFiveDigitCode();
    const now = Date.now();
    rooms.set(code, {
      code,
      createdAt: now,
      lastActiveAt: now,
      nextPeerId: 1,
      peers: new Set<number>(),
      pendingJoins: [],
      hostSignals: [],
      peerSignals: new Map(),
      hostRelayQueue: [],
      peerRelayQueues: new Map(),
    });
    res.json({ code, maxPlayers: MAX_PLAYERS });
  });

  // Query room status
  app.get('/api/rooms/:code', (req, res) => {
    const room = rooms.get(String(req.params.code).trim());
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    room.lastActiveAt = Date.now();
    const playerCount = 1 + room.peers.size;
    res.json({
      code: room.code,
      playerCount,
      maxPlayers: MAX_PLAYERS,
      full: playerCount >= MAX_PLAYERS,
    });
  });

  // Join a 5-digit room (assigns peerId 1..3 up to 4 total players)
  app.post('/api/rooms/:code/join', (req, res) => {
    const room = rooms.get(String(req.params.code).trim());
    if (!room) {
      res.status(404).json({ error: 'Room code not found. Check the 5-digit code.' });
      return;
    }
    room.lastActiveAt = Date.now();
    if (1 + room.peers.size >= MAX_PLAYERS) {
      res.status(409).json({ error: `Room is full (${MAX_PLAYERS}/${MAX_PLAYERS} players).` });
      return;
    }
    const peerId = room.nextPeerId++;
    room.peers.add(peerId);
    room.pendingJoins.push(peerId);
    room.peerSignals.set(peerId, []);
    room.peerRelayQueues.set(peerId, []);
    res.json({
      code: room.code,
      peerId,
      playerCount: 1 + room.peers.size,
      maxPlayers: MAX_PLAYERS,
    });
  });

  // Host polls for new joiners, WebRTC answers, and relay fallback packets
  app.get('/api/rooms/:code/host-poll', (req, res) => {
    const room = rooms.get(String(req.params.code).trim());
    if (!room) {
      res.status(404).json({ error: 'Room expired' });
      return;
    }
    room.lastActiveAt = Date.now();
    const joins = room.pendingJoins.splice(0);
    const signals = room.hostSignals.splice(0);
    const relays = room.hostRelayQueue.splice(0);
    res.json({
      joins,
      signals,
      relays,
      playerCount: 1 + room.peers.size,
    });
  });

  // Joining peer polls for Host's WebRTC offer and relay fallback packets
  app.get('/api/rooms/:code/peer-poll', (req, res) => {
    const room = rooms.get(String(req.params.code).trim());
    if (!room) {
      res.status(404).json({ error: 'Host closed the room.' });
      return;
    }
    room.lastActiveAt = Date.now();
    const peerId = Number(req.query.peerId);
    const signals = room.peerSignals.get(peerId)?.splice(0) ?? [];
    const relays = room.peerRelayQueues.get(peerId)?.splice(0) ?? [];
    res.json({
      signals,
      relays,
      playerCount: 1 + room.peers.size,
    });
  });

  // Exchange WebRTC offer/answer
  app.post('/api/rooms/:code/signal', (req, res) => {
    const room = rooms.get(String(req.params.code).trim());
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    room.lastActiveAt = Date.now();
    const msg = req.body as SignalMessage;
    if (msg.to === 0) {
      room.hostSignals.push(msg);
    } else {
      const q = room.peerSignals.get(msg.to);
      if (q) q.push(msg);
    }
    res.json({ ok: true });
  });

  // Seamless HTTP relay fallback when strict NAT blocks direct WebRTC DataChannel
  app.post('/api/rooms/:code/relay', (req, res) => {
    const room = rooms.get(String(req.params.code).trim());
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    room.lastActiveAt = Date.now();
    const { from, to, data } = req.body as { from: number; to?: number; data: unknown };
    if (to !== undefined) {
      if (to === 0) {
        room.hostRelayQueue.push({ from, data });
      } else {
        const q = room.peerRelayQueues.get(to);
        if (q) q.push({ from, data });
      }
    } else if (from !== 0) {
      room.hostRelayQueue.push({ from, data });
    } else {
      room.peerRelayQueues.forEach((q) => {
        q.push({ from: 0, data });
      });
    }
    res.json({ ok: true });
  });

  // Leave / close room
  app.post('/api/rooms/:code/leave', (req, res) => {
    const room = rooms.get(String(req.params.code).trim());
    if (room) {
      const peerId = Number((req.body as { peerId?: number }).peerId ?? -1);
      if (peerId === 0) {
        rooms.delete(room.code);
      } else if (peerId > 0) {
        room.peers.delete(peerId);
        room.pendingJoins = room.pendingJoins.filter((id) => id !== peerId);
        room.peerSignals.delete(peerId);
        room.peerRelayQueues.delete(peerId);
        const byePkt: RelayPacket = { from: peerId, data: { t: 'bye', id: peerId, from: peerId } };
        room.hostRelayQueue.push(byePkt);
        room.peerRelayQueues.forEach((q) => {
          q.push(byePkt);
        });
      }
    }
    res.json({ ok: true });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  // Ensure dist check doesn't fail if static path exists
  void fs.existsSync;

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Bandukwa server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Bandukwa server:', err);
  process.exit(1);
});
