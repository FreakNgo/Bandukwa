import {
  WssMqttClient,
  generateRoomCodeForBroker,
} from './wssRelay';

export const MAX_ROOM_PLAYERS = 4;

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun.cloudflare.com:3478',
        'stun:stun.stunprotocol.org:3478',
      ],
    },
  ],
  iceCandidatePoolSize: 2,
};

export type P2PMessage =
  | { t: 'id'; id: number; from?: number; count?: number }
  | { t: 'rc'; count: number; from?: number }
  | { t: 'bye'; id: number; from?: number }
  | { t: 'ping'; ts: number; from?: number }
  | { t: 'pong'; ts: number; to?: number; from?: number }
  | {
      t: 's';
      from?: number;
      n: string;
      p: [number, number, number];
      r: number;
      q: number;
      w: number;
      sl: number;
      hp: number;
      kl?: number;
      dt?: number;
    }
  | {
      t: 'f';
      from?: number;
      m: [number, number, number];
      e: [number, number, number];
      w: number;
      h: number;
      n?: [number, number, number];
    }
  | { t: 'g'; from?: number; p: [number, number, number]; v: [number, number, number] }
  | { t: 'h'; from?: number; to: number; d: number; hd: number; w?: number }
  | { t: 'k'; from?: number; k: number; v: number; w?: number; hd?: number }
  | { t: 'lob'; from?: number; n: string; card: number; rdy: number; inGame: number }
  | { t: 'launch'; from?: number }
  | { t: 'chat'; from?: number; n: string; txt: string; ts: number };

interface PeerLink {
  pc: RTCPeerConnection | null;
  dc: RTCDataChannel | null;
  fastDc: RTCDataChannel | null;
  dcOpen: boolean;
  relayActive: boolean;
  cid?: string;
  lastSeen?: number;
}

type CloudHostPacket =
  | { k: 'join'; cid: string }
  | { k: 'sig'; cid: string; sdp: RTCSessionDescriptionInit }
  | { k: 'msg'; cid: string; from: number; d: P2PMessage }
  | { k: 'hb'; cid: string; from: number }
  | { k: 'bye'; cid: string; id: number };

type CloudPeerPacket =
  | { k: 'welcome'; id: number; count: number }
  | { k: 'full' }
  | { k: 'rc'; count: number }
  | { k: 'sig'; sdp: RTCSessionDescriptionInit }
  | { k: 'msg'; d: P2PMessage }
  | { k: 'bye'; id: number };

function waitIceComplete(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
      return;
    }
    let done = false;
    let srflxTimer: number | null = null;
    const finish = () => {
      if (done) return;
      done = true;
      pc.removeEventListener('icegatheringstatechange', onState);
      pc.removeEventListener('icecandidate', onCand);
      clearTimeout(hardTimer);
      if (srflxTimer !== null) clearTimeout(srflxTimer);
      resolve();
    };
    const onState = () => {
      if (pc.iceGatheringState === 'complete') finish();
    };
    const onCand = (ev: RTCPeerConnectionIceEvent) => {
      const cand = ev.candidate?.candidate || '';
      if (cand.includes('srflx') && srflxTimer === null) {
        // Give 120ms for any extra candidates, then send immediately for faster handshake
        srflxTimer = window.setTimeout(finish, 120);
      }
    };
    pc.addEventListener('icegatheringstatechange', onState);
    pc.addEventListener('icecandidate', onCand);
    const hardTimer = window.setTimeout(finish, 480);
  });
}

class ApiHttpError extends Error {
  status: number;
  hasJsonError: boolean;
  constructor(status: number, hasJsonError: boolean, message: string) {
    super(message);
    this.status = status;
    this.hasJsonError = hasJsonError;
  }
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    throw new ApiHttpError(0, false, err instanceof Error ? err.message : 'Network error');
  }

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = (isJson ? await res.json().catch(() => ({})) : {}) as T & { error?: string };

  if (!res.ok) {
    const hasJsonError = typeof data?.error === 'string' && data.error.length > 0;
    throw new ApiHttpError(res.status, hasJsonError, data.error || `Request failed (${res.status})`);
  }

  if (!isJson) {
    throw new ApiHttpError(404, false, 'Backend API not available');
  }

  return data;
}

function pickChannelForMessage(link: PeerLink, msg: P2PMessage): RTCDataChannel | null {
  const isUnreliableOk = msg.t === 's' || msg.t === 'ping' || msg.t === 'pong';
  if (isUnreliableOk && link.fastDc?.readyState === 'open') {
    return link.fastDc;
  }
  if (link.dc?.readyState === 'open') {
    return link.dc;
  }
  return null;
}

function dcSend(ch: RTCDataChannel | null | undefined, raw: string): boolean {
  if (!ch || ch.readyState !== 'open') return false;
  try {
    ch.send(raw);
    return true;
  } catch {
    return false;
  }
}

export class P2PManager {
  isHost = true;
  myId = 0;
  roomCode: string | null = null;
  pingMs: number | null = null;
  readonly maxPlayers = MAX_ROOM_PLAYERS;

  private peers = new Map<number, PeerLink>();
  private joinPc: RTCPeerConnection | null = null;
  private hostDc: RTCDataChannel | null = null;
  private hostFastDc: RTCDataChannel | null = null;
  private joinDcOpen = false;
  private joinRelayActive = false;
  private pollTimer: number | null = null;
  private pollingInFlight = false;
  private lastRelaySend = 0;
  private queuedJoinState: P2PMessage | null = null;
  private cloudStateFlushTimer: number | null = null;
  private pingTimer: number | null = null;
  private pingBootTimer: number | null = null;
  private roomPlayerCount = 1;

  // Cloud WSS relay + WebRTC state
  private usingCloud = false;
  private cloudClient: WssMqttClient | null = null;
  private cloudClientId = '';
  private cloudCidToPeerId = new Map<string, number>();
  private cloudNextPeerId = 1;
  private cloudHeartbeatTimer: number | null = null;
  private joinPollCancelled = false;

  onStatus?: (msg: string) => void;
  onPeerCountChange?: (count: number) => void;
  onRoomChange?: (code: string | null, isHost: boolean) => void;
  onMessage?: (msg: P2PMessage) => void;
  onPeerLeft?: (id: number) => void;
  onPingChange?: (pingMs: number | null) => void;

  get connectedCount(): number {
    if (!this.roomCode) return 0;
    if (this.isHost) {
      let count = 0;
      this.peers.forEach((p) => {
        if (p.dcOpen || p.relayActive) count++;
      });
      return count;
    }
    if (!this.joinDcOpen && !this.joinRelayActive) return 0;
    return Math.max(1, this.roomPlayerCount - 1);
  }

  get netMode(): 'solo' | 'p2p' | 'relay' {
    if (!this.roomCode) return 'solo';
    if (this.isHost) {
      let hasDirect = false;
      this.peers.forEach((p) => {
        if (p.dcOpen) hasDirect = true;
      });
      return hasDirect ? 'p2p' : 'relay';
    }
    return this.joinDcOpen ? 'p2p' : 'relay';
  }

  private emitStatus(msg: string): void {
    this.onStatus?.(msg);
  }

  private emitCount(): void {
    this.onPeerCountChange?.(this.connectedCount);
  }

  private emitRoom(): void {
    this.onRoomChange?.(this.roomCode, this.isHost);
  }

  private updatePingSample(sampleMs: number): void {
    const clamped = Math.max(1, Math.min(999, Math.round(sampleMs)));
    this.pingMs =
      this.pingMs === null ? clamped : Math.round(this.pingMs * 0.55 + clamped * 0.45);
    this.onPingChange?.(this.pingMs);
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    const probe = () => {
      if (!this.roomCode || this.connectedCount === 0) return;
      const now = performance.now();
      if (this.isHost) {
        // Measure RTT to first active peer directly
        for (const [pid, link] of this.peers.entries()) {
          if (!link.dcOpen && !link.relayActive) continue;
          const pingMsg: P2PMessage = { t: 'ping', ts: now, from: 0 };
          const ch = pickChannelForMessage(link, pingMsg);
          if (dcSend(ch, JSON.stringify(pingMsg))) {
            // sent over WebRTC
          } else if (this.usingCloud) {
            this.publishCloudToPeer(pid, pingMsg);
          } else {
            this.postHttpRelay(pingMsg, pid);
          }
          break;
        }
      } else {
        this.send({ t: 'ping', ts: now });
      }
    };
    this.pingBootTimer = window.setTimeout(probe, 250);
    this.pingTimer = window.setInterval(probe, 1200);
  }

  private stopPingLoop(): void {
    if (this.pingBootTimer !== null) {
      clearTimeout(this.pingBootTimer);
      this.pingBootTimer = null;
    }
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.pingMs = null;
    this.onPingChange?.(null);
  }

  send(msg: P2PMessage): void {
    if (!this.roomCode) return;

    if (this.isHost) {
      msg.from = 0;
      if (this.peers.size === 0) return;
      const serialized = JSON.stringify(msg);
      const targetId = 'to' in msg ? msg.to : undefined;

      if (targetId !== undefined) {
        const p = this.peers.get(targetId);
        if (!p) return;
        const ch = pickChannelForMessage(p, msg);
        if (!dcSend(ch, serialized) && p.relayActive) {
          if (this.usingCloud) {
            this.publishCloudToPeer(targetId, msg);
          } else {
            this.postHttpRelay(msg, targetId);
          }
        }
        return;
      }

      const httpRelayTargets: number[] = [];
      const cloudRelayTargets: number[] = [];
      this.peers.forEach((p, pid) => {
        const ch = pickChannelForMessage(p, msg);
        if (dcSend(ch, serialized)) return;
        if (p.relayActive) {
          if (this.usingCloud) {
            cloudRelayTargets.push(pid);
          } else {
            httpRelayTargets.push(pid);
          }
        }
      });

      if (cloudRelayTargets.length > 0) {
        this.publishCloudHostBroadcast(msg, cloudRelayTargets);
      } else if (httpRelayTargets.length > 0) {
        if (httpRelayTargets.length === this.peers.size) {
          this.postHttpRelay(msg);
        } else {
          for (const pid of httpRelayTargets) {
            this.postHttpRelay(msg, pid);
          }
        }
      }
      return;
    }

    const useFast =
      (msg.t === 's' || msg.t === 'ping' || msg.t === 'pong') &&
      this.hostFastDc?.readyState === 'open';

    if (useFast && dcSend(this.hostFastDc, JSON.stringify(msg))) {
      return;
    }
    if (this.joinDcOpen && dcSend(this.hostDc, JSON.stringify(msg))) {
      return;
    }
    if (this.joinRelayActive) {
      if (this.usingCloud) {
        this.publishCloudToHost(msg);
      } else {
        this.postHttpRelay(msg);
      }
    }
  }

  private publishCloudToHost(msg: P2PMessage): void {
    if (!this.roomCode || !this.cloudClient?.isOpen) return;
    if (msg.t === 's') {
      const now = performance.now();
      if (now - this.lastRelaySend < 60) {
        this.queuedJoinState = msg;
        if (this.cloudStateFlushTimer === null) {
          this.cloudStateFlushTimer = window.setTimeout(() => {
            this.cloudStateFlushTimer = null;
            if (this.queuedJoinState && this.usingCloud && !this.isHost) {
              const q = this.queuedJoinState;
              this.queuedJoinState = null;
              this.publishCloudToHost(q);
            }
          }, 64);
        }
        return;
      }
      this.lastRelaySend = now;
    }
    const pkt: CloudHostPacket = {
      k: 'msg',
      cid: this.cloudClientId,
      from: this.myId,
      d: msg,
    };
    this.cloudClient.publish(`bandukwa/v2/${this.roomCode}/host`, JSON.stringify(pkt));
  }

  private publishCloudHostBroadcast(msg: P2PMessage, targetPeerIds: number[]): void {
    if (!this.roomCode || !this.cloudClient?.isOpen) return;
    const isOwnState = msg.t === 's' && (msg.from === undefined || msg.from === 0);
    if (isOwnState) {
      const now = performance.now();
      if (now - this.lastRelaySend < 60) {
        this.queuedJoinState = msg;
        if (this.cloudStateFlushTimer === null) {
          this.cloudStateFlushTimer = window.setTimeout(() => {
            this.cloudStateFlushTimer = null;
            if (this.queuedJoinState && this.usingCloud && this.isHost) {
              const q = this.queuedJoinState;
              this.queuedJoinState = null;
              const targets: number[] = [];
              this.peers.forEach((p, pid) => {
                if (!p.dcOpen && p.relayActive) targets.push(pid);
              });
              if (targets.length > 0) {
                this.publishCloudHostBroadcast(q, targets);
              }
            }
          }, 64);
        }
        return;
      }
      this.lastRelaySend = now;
    }
    const payload = JSON.stringify({ k: 'msg', d: msg } satisfies CloudPeerPacket);
    for (const pid of targetPeerIds) {
      const link = this.peers.get(pid);
      if (link?.cid) {
        this.cloudClient.publish(`bandukwa/v2/${this.roomCode}/p/${link.cid}`, payload);
      }
    }
  }

  private publishCloudToPeer(targetId: number, msg: P2PMessage): void {
    if (!this.roomCode || !this.cloudClient?.isOpen) return;
    const link = this.peers.get(targetId);
    if (!link?.cid) return;
    const payload = JSON.stringify({ k: 'msg', d: msg } satisfies CloudPeerPacket);
    this.cloudClient.publish(`bandukwa/v2/${this.roomCode}/p/${link.cid}`, payload);
  }

  private postHttpRelay(msg: P2PMessage, to?: number): void {
    if (!this.roomCode) return;
    const isOwnStateBroadcast =
      msg.t === 's' && to === undefined && (msg.from === undefined || msg.from === this.myId);
    if (isOwnStateBroadcast) {
      const now = performance.now();
      if (now - this.lastRelaySend < 45) {
        this.queuedJoinState = msg;
        return;
      }
      this.lastRelaySend = now;
    }
    const code = this.roomCode;
    fetch(`/api/rooms/${code}/relay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: msg.from ?? this.myId, to, data: msg }),
    }).catch(() => {
      // ignore transient relay errors
    });
  }

  async hostRoom(): Promise<string> {
    await this.leaveRoom();
    this.isHost = true;
    this.myId = 0;
    this.roomPlayerCount = 1;
    this.emitStatus('Creating 4-player arena room...');

    try {
      const created = await apiJson<{ code: string; maxPlayers: number }>('/api/rooms', {
        method: 'POST',
      });
      this.usingCloud = false;
      this.roomCode = created.code;
      this.emitRoom();
      this.emitCount();
      this.emitStatus(`Room ${created.code} live (1/${MAX_ROOM_PLAYERS} players). Share code to join.`);

      this.startHostPolling(created.code);
      this.startPingLoop();
      return created.code;
    } catch (err) {
      if (
        err instanceof ApiHttpError &&
        (err.status === 405 || err.status === 0 || !err.hasJsonError)
      ) {
        return this.hostRoomViaCloud();
      }
      throw err;
    }
  }

  async joinRoom(rawCode: string): Promise<void> {
    const code = rawCode.replace(/\D/g, '').slice(0, 5);
    if (code.length !== 5) {
      throw new Error('Enter the 5-digit room code from the host.');
    }

    await this.leaveRoom();
    this.isHost = false;
    this.emitStatus(`Connecting to room ${code}...`);

    let joined: { code: string; peerId: number; playerCount: number };
    try {
      joined = await apiJson<{ code: string; peerId: number; playerCount: number }>(
        `/api/rooms/${code}/join`,
        { method: 'POST' },
      );
    } catch (err) {
      if (
        err instanceof ApiHttpError &&
        (err.status === 405 || err.status === 0 || !err.hasJsonError)
      ) {
        return this.joinRoomViaCloud(code);
      }
      throw err;
    }

    this.usingCloud = false;
    this.joinPollCancelled = false;
    this.roomCode = joined.code;
    this.myId = joined.peerId;
    this.roomPlayerCount = joined.playerCount;
    // Enable relay immediately so lobby cards, chat, launch & ping work with zero 1.6s drop window
    this.joinRelayActive = true;
    this.joinDcOpen = false;
    this.emitRoom();
    this.emitCount();
    this.startPingLoop();
    this.emitStatus(`Connected to room ${code} (${this.roomPlayerCount}/${MAX_ROOM_PLAYERS}).`);

    let pc: RTCPeerConnection | null = null;
    try {
      pc = new RTCPeerConnection(ICE_CONFIG);
      this.joinPc = pc;
    } catch {
      pc = null;
    }

    if (pc) {
      pc.onconnectionstatechange = () => {
        if (this.roomCode !== code) return;
        if (pc && (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed')) {
          this.joinDcOpen = false;
          this.joinRelayActive = true;
          this.emitCount();
        }
      };

      pc.ondatachannel = (ev) => {
        const dc = ev.channel;
        if (dc.label === 'bandukwa-fast') {
          this.hostFastDc = dc;
          dc.onmessage = (msgEv) => this.handleIncomingRaw(String(msgEv.data));
          return;
        }
        this.hostDc = dc;
        dc.onopen = () => {
          if (this.roomCode !== code) return;
          this.joinDcOpen = true;
          this.joinRelayActive = false;
          this.emitCount();
          this.emitStatus(`Connected to room ${code} (Direct P2P)!`);
        };
        dc.onmessage = (msgEv) => {
          this.handleIncomingRaw(String(msgEv.data));
        };
        dc.onclose = () => {
          this.joinDcOpen = false;
          if (this.roomCode === code) {
            this.joinRelayActive = true;
            this.emitCount();
            this.emitStatus(`Switched to relay in room ${code}.`);
          }
        };
      };
    }

    const pollJoin = async () => {
      if (this.joinPollCancelled || this.roomCode !== code || this.isHost) return;
      try {
        const data = await apiJson<{
          signals: Array<{ from: number; to: number; type: 'offer' | 'answer'; sdp: RTCSessionDescriptionInit }>;
          relays: Array<{ from: number; data: P2PMessage }>;
          playerCount: number;
        }>(`/api/rooms/${code}/peer-poll?peerId=${this.myId}`);

        if (this.joinPollCancelled || this.roomCode !== code) return;

        if (data.playerCount !== this.roomPlayerCount) {
          this.roomPlayerCount = data.playerCount;
          this.emitCount();
        }

        if (pc) {
          for (const sig of data.signals) {
            if (sig.type === 'offer') {
              try {
                await pc.setRemoteDescription(sig.sdp);
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await waitIceComplete(pc);
                if (this.roomCode !== code || this.joinPollCancelled) return;
                await apiJson(`/api/rooms/${code}/signal`, {
                  method: 'POST',
                  body: JSON.stringify({
                    from: this.myId,
                    to: 0,
                    type: 'answer',
                    sdp: {
                      type: pc.localDescription?.type ?? 'answer',
                      sdp: pc.localDescription?.sdp ?? '',
                    },
                  }),
                });
              } catch {
                // Keep relay active cleanly if WebRTC negotiation fails on strict NAT
                this.joinDcOpen = false;
                this.joinRelayActive = true;
              }
            }
          }
        }

        for (const pkt of data.relays) {
          this.handleRelayPacket(pkt.from, pkt.data);
        }

        if (this.joinRelayActive && this.queuedJoinState) {
          const q = this.queuedJoinState;
          this.queuedJoinState = null;
          this.postHttpRelay(q);
        }
      } catch (err) {
        if (err instanceof ApiHttpError && err.status === 404) {
          this.emitStatus(err.message || 'Host closed the room.');
          void this.leaveRoom();
          return;
        }
      }

      if (!this.joinPollCancelled && this.roomCode === code && !this.isHost) {
        // 16ms HTTP relay polling for sub-50ms LAN/same-region relay response; 900ms when WebRTC P2P is active
        this.pollTimer = window.setTimeout(pollJoin, this.joinDcOpen ? 900 : 16);
      }
    };

    void pollJoin();
  }

  private handleIncomingRaw(raw: string): void {
    try {
      const m = JSON.parse(raw) as P2PMessage;
      if (m.t === 'ping') {
        this.send({ t: 'pong', ts: m.ts, to: m.from ?? 0 });
        return;
      }
      if (m.t === 'pong') {
        this.updatePingSample(performance.now() - m.ts);
        return;
      }
      if (m.t === 'id') {
        this.myId = m.id;
        if (typeof m.count === 'number') {
          this.roomPlayerCount = m.count;
          this.emitCount();
        }
      } else if (m.t === 'rc') {
        this.roomPlayerCount = m.count;
        this.emitCount();
      } else if (m.t === 'bye') {
        this.onPeerLeft?.(m.id);
      } else {
        this.onMessage?.(m);
      }
    } catch {
      // ignore malformed packet
    }
  }

  private handleRelayPacket(from: number, msg: P2PMessage): void {
    if (!msg || typeof msg !== 'object') return;
    msg.from = msg.from ?? from;
    if (msg.t === 'ping') {
      this.send({ t: 'pong', ts: msg.ts, to: msg.from });
      return;
    }
    if (msg.t === 'pong') {
      this.updatePingSample(performance.now() - msg.ts);
      return;
    }
    if (msg.t === 'id') {
      this.myId = msg.id;
      if (typeof msg.count === 'number') {
        this.roomPlayerCount = msg.count;
        this.emitCount();
      }
      return;
    }
    if (msg.t === 'rc') {
      this.roomPlayerCount = msg.count;
      this.emitCount();
      return;
    }
    if (msg.t === 'bye') {
      this.onPeerLeft?.(msg.id);
      return;
    }
    this.onMessage?.(msg);
  }

  private startHostPolling(code: string): void {
    const tickHost = async () => {
      if (this.roomCode !== code || !this.isHost || this.pollingInFlight) return;
      this.pollingInFlight = true;
      try {
        const data = await apiJson<{
          joins: number[];
          signals: Array<{ from: number; to: number; type: 'offer' | 'answer'; sdp: RTCSessionDescriptionInit }>;
          relays: Array<{ from: number; data: P2PMessage }>;
          playerCount: number;
        }>(`/api/rooms/${code}/host-poll`);

        for (const peerId of data.joins) {
          if (this.peers.size >= MAX_ROOM_PLAYERS - 1 || this.peers.has(peerId)) continue;
          await this.createOfferForPeer(code, peerId);
        }

        for (const sig of data.signals) {
          if (sig.type === 'answer') {
            const link = this.peers.get(sig.from);
            if (link?.pc && link.pc.signalingState !== 'stable') {
              link.lastSeen = Date.now();
              try {
                await link.pc.setRemoteDescription(sig.sdp);
              } catch {
                // Keep HTTP relay active cleanly on signaling mismatch
                link.relayActive = true;
              }
            }
          }
        }

        for (const pkt of data.relays) {
          const sender = this.peers.get(pkt.from);
          if (sender) {
            sender.lastSeen = Date.now();
            if (!sender.dcOpen && !sender.relayActive) {
              sender.relayActive = true;
              this.emitCount();
            }
          }
          const m = pkt.data;
          if (!m) continue;
          m.from = m.from ?? pkt.from;
          if (m.t === 'bye') {
            this.dropHostPeer(m.id);
            continue;
          }
          this.routeHostMessage(pkt.from, m);
        }

        if (this.queuedJoinState && this.peers.size > 0) {
          const q = this.queuedJoinState;
          this.queuedJoinState = null;
          this.postHttpRelay(q);
        }
      } catch {
        // retry next tick
      } finally {
        this.pollingInFlight = false;
        if (this.roomCode === code && this.isHost) {
          let usingRelay = false;
          this.peers.forEach((p) => {
            if (p.relayActive && !p.dcOpen) usingRelay = true;
          });
          const intervalMs = usingRelay ? 16 : this.peers.size === 0 ? 75 : 280;
          this.pollTimer = window.setTimeout(tickHost, intervalMs);
        }
      }
    };

    if (this.cloudHeartbeatTimer !== null) {
      clearInterval(this.cloudHeartbeatTimer);
    }
    this.cloudHeartbeatTimer = window.setInterval(() => {
      if (this.usingCloud || !this.isHost || this.roomCode !== code) return;
      const now = Date.now();
      const stale: number[] = [];
      this.peers.forEach((link, pid) => {
        if (!link.dcOpen && link.lastSeen && now - link.lastSeen > 25_000) {
          stale.push(pid);
        }
      });
      stale.forEach((pid) => this.dropHostPeer(pid));
    }, 6000);

    void tickHost();
  }

  private routeHostMessage(senderId: number, m: P2PMessage): void {
    m.from = senderId;
    if (m.t === 'ping') {
      const pong: P2PMessage = { t: 'pong', ts: m.ts, to: senderId, from: 0 };
      const dest = this.peers.get(senderId);
      if (dest) {
        const ch = pickChannelForMessage(dest, pong);
        if (dcSend(ch, JSON.stringify(pong))) return;
        if (dest.relayActive) {
          if (this.usingCloud) {
            this.publishCloudToPeer(senderId, pong);
          } else {
            this.postHttpRelay(pong, senderId);
          }
        }
      }
      return;
    }
    if (m.t === 'pong') {
      this.updatePingSample(performance.now() - m.ts);
      return;
    }

    const targetId = 'to' in m ? m.to : undefined;
    if (targetId !== undefined && targetId !== 0) {
      const dest = this.peers.get(targetId);
      if (dest) {
        const ch = pickChannelForMessage(dest, m);
        if (dcSend(ch, JSON.stringify(m))) return;
        if (dest.relayActive) {
          if (this.usingCloud) {
            this.publishCloudToPeer(targetId, m);
          } else {
            this.postHttpRelay(m, targetId);
          }
        }
      }
      return;
    }

    if (targetId === undefined) {
      const serialized = JSON.stringify(m);
      const cloudTargets: number[] = [];
      this.peers.forEach((peer, pid) => {
        if (pid === senderId) return;
        const ch = pickChannelForMessage(peer, m);
        if (dcSend(ch, serialized)) return;
        if (peer.relayActive) {
          if (this.usingCloud) {
            cloudTargets.push(pid);
          } else {
            this.postHttpRelay(m, pid);
          }
        }
      });
      if (cloudTargets.length > 0) {
        this.publishCloudHostBroadcast(m, cloudTargets);
      }
    }
    this.onMessage?.(m);
  }

  private dropHostPeer(peerId: number): void {
    const gone = this.peers.get(peerId);
    if (!gone) return;
    try {
      gone.fastDc?.close();
      gone.dc?.close();
      gone.pc?.close();
    } catch {
      // ignore
    }
    if (gone.cid) {
      this.cloudCidToPeerId.delete(gone.cid);
    }
    this.peers.delete(peerId);
    this.onPeerLeft?.(peerId);

    if (this.peers.size === 0) {
      this.pingMs = null;
      this.onPingChange?.(null);
    }

    const total = 1 + this.peers.size;
    this.roomPlayerCount = total;
    const byePkt: P2PMessage = { t: 'bye', id: peerId, from: 0 };

    if (this.usingCloud) {
      const countPkt = JSON.stringify({ k: 'rc', count: total } satisfies CloudPeerPacket);
      this.peers.forEach((p, pid) => {
        if (p.dcOpen && dcSend(p.dc, JSON.stringify(byePkt))) {
          dcSend(p.dc, JSON.stringify({ t: 'rc', count: total }));
        } else if (p.cid && this.cloudClient?.isOpen && this.roomCode) {
          this.publishCloudToPeer(pid, byePkt);
          this.cloudClient.publish(`bandukwa/v2/${this.roomCode}/p/${p.cid}`, countPkt);
        }
      });
    } else if (this.roomCode && this.peers.size > 0) {
      this.send(byePkt);
    }

    this.emitStatus(`Player #${peerId} left.`);
    this.emitCount();
  }

  private async createOfferForPeer(code: string, peerId: number): Promise<void> {
    let pc: RTCPeerConnection;
    let dc: RTCDataChannel;
    let fastDc: RTCDataChannel;
    try {
      pc = new RTCPeerConnection(ICE_CONFIG);
      dc = pc.createDataChannel('bandukwa', { ordered: true });
      fastDc = pc.createDataChannel('bandukwa-fast', { ordered: false, maxRetransmits: 0 });
    } catch {
      this.peers.set(peerId, {
        pc: null,
        dc: null,
        fastDc: null,
        dcOpen: false,
        relayActive: true,
        lastSeen: Date.now(),
      });
      this.emitStatus(`Player #${peerId} joined room ${code}.`);
      this.emitCount();
      return;
    }

    // Enable relay immediately during ICE negotiation so lobby cards, chat & launch never drop
    const link: PeerLink = {
      pc,
      dc,
      fastDc,
      dcOpen: false,
      relayActive: true,
      lastSeen: Date.now(),
    };
    this.peers.set(peerId, link);
    this.emitStatus(`Player #${peerId} joined room ${code} (${this.peers.size + 1}/${MAX_ROOM_PLAYERS}).`);
    this.emitCount();

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        const cur = this.peers.get(peerId);
        if (cur) {
          cur.dcOpen = false;
          cur.relayActive = true;
          this.emitCount();
        }
      }
    };

    fastDc.onmessage = (ev) => {
      let m: P2PMessage;
      try {
        m = JSON.parse(String(ev.data)) as P2PMessage;
      } catch {
        return;
      }
      link.lastSeen = Date.now();
      this.routeHostMessage(peerId, m);
    };

    dc.onopen = () => {
      if (!this.peers.has(peerId)) return;
      link.dcOpen = true;
      link.relayActive = false;
      link.lastSeen = Date.now();
      dcSend(dc, JSON.stringify({ t: 'id', id: peerId, count: 1 + this.peers.size }));
      this.emitStatus(`Player #${peerId} connected Direct P2P (${this.peers.size + 1}/${MAX_ROOM_PLAYERS}).`);
      this.emitCount();
    };

    dc.onmessage = (ev) => {
      let m: P2PMessage;
      try {
        m = JSON.parse(String(ev.data)) as P2PMessage;
      } catch {
        return;
      }
      link.lastSeen = Date.now();
      this.routeHostMessage(peerId, m);
    };

    dc.onclose = () => {
      if (!this.peers.has(peerId)) return;
      link.dcOpen = false;
      link.relayActive = true;
      this.emitCount();
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitIceComplete(pc);
      if (this.roomCode !== code || !this.peers.has(peerId)) return;
      await apiJson(`/api/rooms/${code}/signal`, {
        method: 'POST',
        body: JSON.stringify({
          from: 0,
          to: peerId,
          type: 'offer',
          sdp: {
            type: pc.localDescription?.type ?? 'offer',
            sdp: pc.localDescription?.sdp ?? '',
          },
        }),
      });
    } catch {
      link.relayActive = true;
      this.emitCount();
    }
  }

  private async hostRoomViaCloud(): Promise<string> {
    const { client, brokerIdx } = await WssMqttClient.connectAnyBroker();
    const code = generateRoomCodeForBroker(brokerIdx);
    const hostTopic = `bandukwa/v2/${code}/host`;

    this.cloudClient = client;
    this.usingCloud = true;
    this.isHost = true;
    this.myId = 0;
    this.cloudNextPeerId = 1;
    this.cloudCidToPeerId.clear();
    this.roomPlayerCount = 1;
    this.roomCode = code;

    await client.subscribe(hostTopic);

    client.onClose = () => {
      if (this.roomCode === code && this.usingCloud) {
        this.emitStatus('Disconnected from multiplayer relay.');
      }
    };

    client.onMessage = (_topic, rawPayload) => {
      let pkt: CloudHostPacket;
      try {
        pkt = JSON.parse(rawPayload) as CloudHostPacket;
      } catch {
        return;
      }
      if (!pkt || typeof pkt !== 'object') return;

      if (pkt.k === 'join') {
        this.handleCloudJoin(code, client, pkt.cid);
        return;
      }

      if (pkt.k === 'hb') {
        const link = this.peers.get(pkt.from);
        if (link) link.lastSeen = Date.now();
        return;
      }

      if (pkt.k === 'bye') {
        const pid = this.cloudCidToPeerId.get(pkt.cid) ?? pkt.id;
        this.dropHostPeer(pid);
        return;
      }

      if (pkt.k === 'sig') {
        const pid = this.cloudCidToPeerId.get(pkt.cid);
        if (pid !== undefined) {
          const link = this.peers.get(pid);
          if (link?.pc && link.pc.signalingState !== 'stable') {
            link.pc.setRemoteDescription(pkt.sdp).catch(() => {
              // stay on WSS relay
            });
          }
        }
        return;
      }

      if (pkt.k === 'msg') {
        const pid = this.cloudCidToPeerId.get(pkt.cid) ?? pkt.from;
        const link = this.peers.get(pid);
        if (link) {
          link.lastSeen = Date.now();
          this.routeHostMessage(pid, pkt.d);
        }
      }
    };

    this.cloudHeartbeatTimer = window.setInterval(() => {
      if (!this.usingCloud || !this.isHost) return;
      const now = Date.now();
      const stale: number[] = [];
      this.peers.forEach((link, pid) => {
        if (!link.dcOpen && link.lastSeen && now - link.lastSeen > 25_000) {
          stale.push(pid);
        }
      });
      stale.forEach((pid) => this.dropHostPeer(pid));
    }, 6000);

    this.emitRoom();
    this.emitCount();
    this.startPingLoop();
    this.emitStatus(`Room ${code} live (1/${MAX_ROOM_PLAYERS} players). Share code to join.`);
    return code;
  }

  private handleCloudJoin(code: string, client: WssMqttClient, cid: string): void {
    const existingId = this.cloudCidToPeerId.get(cid);
    const peerTopic = `bandukwa/v2/${code}/p/${cid}`;

    if (existingId !== undefined) {
      const link = this.peers.get(existingId);
      if (link) link.lastSeen = Date.now();
      const total = 1 + this.peers.size;
      client.publish(peerTopic, JSON.stringify({ k: 'welcome', id: existingId, count: total } satisfies CloudPeerPacket));
      return;
    }

    if (this.peers.size >= MAX_ROOM_PLAYERS - 1) {
      client.publish(peerTopic, JSON.stringify({ k: 'full' } satisfies CloudPeerPacket));
      return;
    }

    const peerId = this.cloudNextPeerId++;
    this.cloudCidToPeerId.set(cid, peerId);

    const link: PeerLink = {
      pc: null,
      dc: null,
      fastDc: null,
      dcOpen: false,
      relayActive: true,
      cid,
      lastSeen: Date.now(),
    };
    this.peers.set(peerId, link);

    const total = 1 + this.peers.size;
    this.roomPlayerCount = total;

    client.publish(peerTopic, JSON.stringify({ k: 'welcome', id: peerId, count: total } satisfies CloudPeerPacket));

    const countPkt = JSON.stringify({ k: 'rc', count: total } satisfies CloudPeerPacket);
    this.peers.forEach((other, pid) => {
      if (pid === peerId) return;
      if (other.dcOpen && dcSend(other.dc, JSON.stringify({ t: 'rc', count: total }))) {
        return;
      }
      if (other.cid) {
        client.publish(`bandukwa/v2/${code}/p/${other.cid}`, countPkt);
      }
    });

    this.emitStatus(`Player #${peerId} joined (${total}/${MAX_ROOM_PLAYERS}).`);
    this.emitCount();

    void this.tryUpgradeCloudPeerWebRTC(code, client, peerId, cid, link);
  }

  private async tryUpgradeCloudPeerWebRTC(
    code: string,
    client: WssMqttClient,
    peerId: number,
    cid: string,
    link: PeerLink,
  ): Promise<void> {
    let pc: RTCPeerConnection;
    let dc: RTCDataChannel;
    let fastDc: RTCDataChannel;
    try {
      pc = new RTCPeerConnection(ICE_CONFIG);
      dc = pc.createDataChannel('bandukwa', { ordered: true });
      fastDc = pc.createDataChannel('bandukwa-fast', { ordered: false, maxRetransmits: 0 });
    } catch {
      return;
    }
    link.pc = pc;
    link.dc = dc;
    link.fastDc = fastDc;

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        if (!this.peers.has(peerId)) return;
        link.dcOpen = false;
        if (client.isOpen) {
          link.relayActive = true;
          this.emitCount();
        }
      }
    };

    fastDc.onmessage = (ev) => {
      let m: P2PMessage;
      try {
        m = JSON.parse(String(ev.data)) as P2PMessage;
      } catch {
        return;
      }
      link.lastSeen = Date.now();
      this.routeHostMessage(peerId, m);
    };

    dc.onopen = () => {
      if (!this.peers.has(peerId)) return;
      link.dcOpen = true;
      link.relayActive = false;
      dcSend(dc, JSON.stringify({ t: 'id', id: peerId, count: 1 + this.peers.size }));
      this.emitCount();
    };

    dc.onmessage = (ev) => {
      let m: P2PMessage;
      try {
        m = JSON.parse(String(ev.data)) as P2PMessage;
      } catch {
        return;
      }
      link.lastSeen = Date.now();
      this.routeHostMessage(peerId, m);
    };

    dc.onclose = () => {
      if (!this.peers.has(peerId)) return;
      link.dcOpen = false;
      if (client.isOpen) {
        link.relayActive = true;
        this.emitCount();
      } else {
        this.dropHostPeer(peerId);
      }
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitIceComplete(pc);
      if (!client.isOpen || !this.peers.has(peerId)) return;
      const sigPkt: CloudPeerPacket = {
        k: 'sig',
        sdp: {
          type: pc.localDescription?.type ?? 'offer',
          sdp: pc.localDescription?.sdp ?? '',
        },
      };
      client.publish(`bandukwa/v2/${code}/p/${cid}`, JSON.stringify(sigPkt));
    } catch {
      // Remain on WSS relay
    }
  }

  private async joinRoomViaCloud(code: string): Promise<void> {
    const client = await WssMqttClient.connectForRoom(code, 6500);
    const cid = Math.random().toString(36).slice(2, 10);
    const hostTopic = `bandukwa/v2/${code}/host`;
    const myTopic = `bandukwa/v2/${code}/p/${cid}`;

    this.cloudClient = client;
    this.cloudClientId = cid;
    this.usingCloud = true;
    this.isHost = false;

    await client.subscribe(myTopic);

    let pc: RTCPeerConnection | null = null;
    try {
      pc = new RTCPeerConnection(ICE_CONFIG);
      this.joinPc = pc;
      pc.onconnectionstatechange = () => {
        if (this.roomCode !== code || !pc) return;
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
          this.joinDcOpen = false;
          if (client.isOpen) {
            this.joinRelayActive = true;
            this.emitCount();
          }
        }
      };
      pc.ondatachannel = (ev) => {
        const dc = ev.channel;
        if (dc.label === 'bandukwa-fast') {
          this.hostFastDc = dc;
          dc.onmessage = (msgEv) => this.handleIncomingRaw(String(msgEv.data));
          return;
        }
        this.hostDc = dc;
        dc.onopen = () => {
          if (this.roomCode !== code) return;
          this.joinDcOpen = true;
          this.joinRelayActive = false;
          this.emitCount();
        };
        dc.onmessage = (msgEv) => {
          this.handleIncomingRaw(String(msgEv.data));
        };
        dc.onclose = () => {
          this.joinDcOpen = false;
          if (this.roomCode === code && client.isOpen) {
            this.joinRelayActive = true;
            this.emitCount();
          }
        };
      };
    } catch {
      pc = null;
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let retryTimer: number | null = null;
      let timeoutTimer: number | null = null;

      const cleanupTimers = () => {
        if (retryTimer !== null) {
          clearInterval(retryTimer);
          retryTimer = null;
        }
        if (timeoutTimer !== null) {
          clearTimeout(timeoutTimer);
          timeoutTimer = null;
        }
      };

      const fail = (msg: string) => {
        if (settled) return;
        settled = true;
        cleanupTimers();
        void this.leaveRoom();
        reject(new Error(msg));
      };

      client.onClose = () => {
        if (!settled) {
          fail('Disconnected from multiplayer relay.');
          return;
        }
        this.joinDcOpen = false;
        this.joinRelayActive = false;
        this.emitCount();
        if (this.roomCode === code) {
          this.emitStatus('Disconnected from host.');
        }
      };

      client.onMessage = (_topic, rawPayload) => {
        let pkt: CloudPeerPacket;
        try {
          pkt = JSON.parse(rawPayload) as CloudPeerPacket;
        } catch {
          return;
        }
        if (!pkt || typeof pkt !== 'object') return;

        if (pkt.k === 'full') {
          fail(`Room is full (${MAX_ROOM_PLAYERS}/${MAX_ROOM_PLAYERS} players).`);
          return;
        }

        if (pkt.k === 'welcome') {
          this.roomCode = code;
          this.myId = pkt.id;
          this.roomPlayerCount = pkt.count;
          this.joinRelayActive = true;
          if (!settled) {
            settled = true;
            cleanupTimers();
            this.emitRoom();
            this.emitCount();
            this.startPingLoop();
            this.emitStatus(`Connected to room ${code} (${pkt.count}/${MAX_ROOM_PLAYERS}).`);

            this.cloudHeartbeatTimer = window.setInterval(() => {
              if (this.usingCloud && !this.isHost && this.roomCode === code && client.isOpen) {
                client.publish(
                  hostTopic,
                  JSON.stringify({ k: 'hb', cid, from: this.myId } satisfies CloudHostPacket),
                );
              }
            }, 6000);

            resolve();
          }
          return;
        }

        if (pkt.k === 'rc') {
          this.roomPlayerCount = pkt.count;
          this.emitCount();
          return;
        }

        if (pkt.k === 'bye') {
          this.onPeerLeft?.(pkt.id);
          if (pkt.id === 0) {
            void this.leaveRoom().then(() => {
              this.emitStatus('Host closed the room.');
            });
          }
          return;
        }

        if (pkt.k === 'sig' && pc) {
          void (async () => {
            try {
              await pc.setRemoteDescription(pkt.sdp);
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await waitIceComplete(pc);
              if (client.isOpen && this.roomCode === code) {
                client.publish(
                  hostTopic,
                  JSON.stringify({
                    k: 'sig',
                    cid,
                    sdp: {
                      type: pc.localDescription?.type ?? 'answer',
                      sdp: pc.localDescription?.sdp ?? '',
                    },
                  } satisfies CloudHostPacket),
                );
              }
            } catch {
              // Stay on WSS relay
            }
          })();
          return;
        }

        if (pkt.k === 'msg') {
          this.handleRelayPacket(pkt.d.from ?? 0, pkt.d);
        }
      };

      const sendJoin = () => {
        if (!settled && client.isOpen) {
          client.publish(hostTopic, JSON.stringify({ k: 'join', cid } satisfies CloudHostPacket));
        }
      };

      sendJoin();
      retryTimer = window.setInterval(sendJoin, 650);
      timeoutTimer = window.setTimeout(() => {
        fail('Room not found or host is offline. Check the 5-digit code.');
      }, 6000);
    });
  }

  async leaveRoom(): Promise<void> {
    this.joinPollCancelled = true;
    this.stopPingLoop();
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.cloudHeartbeatTimer !== null) {
      clearInterval(this.cloudHeartbeatTimer);
      this.cloudHeartbeatTimer = null;
    }
    if (this.cloudStateFlushTimer !== null) {
      clearTimeout(this.cloudStateFlushTimer);
      this.cloudStateFlushTimer = null;
    }

    const oldCode = this.roomCode;
    const oldId = this.myId;
    const wasCloud = this.usingCloud;
    const wasHost = this.isHost;

    if (wasCloud && oldCode && this.cloudClient?.isOpen) {
      if (!wasHost) {
        this.cloudClient.publish(
          `bandukwa/v2/${oldCode}/host`,
          JSON.stringify({ k: 'bye', cid: this.cloudClientId, id: oldId } satisfies CloudHostPacket),
        );
      } else {
        this.peers.forEach((p) => {
          if (p.cid) {
            this.cloudClient?.publish(
              `bandukwa/v2/${oldCode}/p/${p.cid}`,
              JSON.stringify({ k: 'bye', id: 0 } satisfies CloudPeerPacket),
            );
          }
        });
      }
    }

    this.roomCode = null;
    this.usingCloud = false;
    this.joinDcOpen = false;
    this.joinRelayActive = false;
    this.roomPlayerCount = 1;
    this.queuedJoinState = null;
    this.cloudNextPeerId = 1;
    this.cloudCidToPeerId.clear();

    try {
      this.cloudClient?.close();
    } catch {
      // ignore
    }
    this.cloudClient = null;

    this.peers.forEach(({ pc, dc, fastDc }) => {
      try {
        fastDc?.close();
        dc?.close();
        pc?.close();
      } catch {
        // ignore close errors
      }
    });
    this.peers.clear();

    try {
      this.hostFastDc?.close();
      this.hostDc?.close();
      this.joinPc?.close();
    } catch {
      // ignore close errors
    }
    this.hostFastDc = null;
    this.hostDc = null;
    this.joinPc = null;

    if (oldCode && !wasCloud) {
      fetch(`/api/rooms/${oldCode}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peerId: oldId }),
        keepalive: true,
      }).catch(() => {});
    }

    this.emitRoom();
    this.emitCount();
  }

  dispose(): void {
    void this.leaveRoom();
  }
}
