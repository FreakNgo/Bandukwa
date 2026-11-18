export const MAX_ROOM_PLAYERS = 4;

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun.cloudflare.com:3478',
      ],
    },
  ],
};

export type P2PMessage =
  | { t: 'id'; id: number; from?: number }
  | { t: 'bye'; id: number; from?: number }
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
  | { t: 'k'; from?: number; k: number; v: number; w?: number; hd?: number };

interface PeerLink {
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  dcOpen: boolean;
  relayActive: boolean;
}

function waitIceComplete(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
      return;
    }
    const onState = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', onState);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', onState);
    window.setTimeout(resolve, 1200);
  });
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export class P2PManager {
  isHost = true;
  myId = 0;
  roomCode: string | null = null;
  readonly maxPlayers = MAX_ROOM_PLAYERS;

  private peers = new Map<number, PeerLink>();
  private joinPc: RTCPeerConnection | null = null;
  private hostDc: RTCDataChannel | null = null;
  private joinDcOpen = false;
  private joinRelayActive = false;
  private pollTimer: number | null = null;
  private pollingInFlight = false;
  private lastRelaySend = 0;
  private queuedJoinState: P2PMessage | null = null;
  private roomPlayerCount = 1;

  onStatus?: (msg: string) => void;
  onPeerCountChange?: (count: number) => void;
  onRoomChange?: (code: string | null, isHost: boolean) => void;
  onMessage?: (msg: P2PMessage) => void;
  onPeerLeft?: (id: number) => void;

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

  private emitStatus(msg: string): void {
    this.onStatus?.(msg);
  }

  private emitCount(): void {
    this.onPeerCountChange?.(this.connectedCount);
  }

  private emitRoom(): void {
    this.onRoomChange?.(this.roomCode, this.isHost);
  }

  send(msg: P2PMessage): void {
    if (!this.roomCode) return;

    if (this.isHost) {
      msg.from = 0;
      if (this.peers.size === 0) return;
      const serialized = JSON.stringify(msg);
      const targetId = 'to' in msg ? msg.to : undefined;
      let needsRelay = false;

      if (targetId !== undefined) {
        const p = this.peers.get(targetId);
        if (p?.dcOpen && p.dc?.readyState === 'open') {
          p.dc.send(serialized);
        } else if (p?.relayActive) {
          needsRelay = true;
        }
      } else {
        this.peers.forEach((p) => {
          if (p.dcOpen && p.dc?.readyState === 'open') {
            p.dc.send(serialized);
          } else if (p.relayActive) {
            needsRelay = true;
          }
        });
      }

      if (needsRelay) {
        this.postRelay(msg, targetId);
      }
      return;
    }

    if (this.joinDcOpen && this.hostDc?.readyState === 'open') {
      this.hostDc.send(JSON.stringify(msg));
    } else if (this.joinRelayActive) {
      this.postRelay(msg);
    }
  }

  private postRelay(msg: P2PMessage, to?: number): void {
    if (!this.roomCode) return;
    // Coalesce only our own high-rate position updates; never drop forwarded packets from other peers
    const isOwnStateBroadcast =
      msg.t === 's' && to === undefined && (msg.from === undefined || msg.from === this.myId);
    if (isOwnStateBroadcast) {
      const now = performance.now();
      if (now - this.lastRelaySend < 90) {
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

    const created = await apiJson<{ code: string; maxPlayers: number }>('/api/rooms', {
      method: 'POST',
    });
    this.roomCode = created.code;
    this.emitRoom();
    this.emitCount();
    this.emitStatus(`Room ${created.code} live (1/${MAX_ROOM_PLAYERS} players). Share code to join.`);

    this.startHostPolling(created.code);
    return created.code;
  }

  async joinRoom(rawCode: string): Promise<void> {
    const code = rawCode.replace(/\D/g, '').slice(0, 5);
    if (code.length !== 5) {
      throw new Error('Enter the 5-digit room code from the host.');
    }

    await this.leaveRoom();
    this.isHost = false;
    this.emitStatus(`Connecting to room ${code}...`);

    const joined = await apiJson<{ code: string; peerId: number; playerCount: number }>(
      `/api/rooms/${code}/join`,
      { method: 'POST' },
    );

    this.roomCode = joined.code;
    this.myId = joined.peerId;
    this.roomPlayerCount = joined.playerCount;
    this.emitRoom();

    let pc: RTCPeerConnection | null = null;
    try {
      pc = new RTCPeerConnection(ICE_CONFIG);
      this.joinPc = pc;
    } catch {
      pc = null;
    }

    let handshakeResolved = false;
    await new Promise<void>((resolve, reject) => {
      const finishOk = () => {
        if (handshakeResolved) return;
        handshakeResolved = true;
        this.emitCount();
        resolve();
      };

      const activateRelay = () => {
        if (this.joinDcOpen || this.roomCode !== code) return;
        this.joinRelayActive = true;
        this.emitStatus(`Connected to room ${code} (${this.roomPlayerCount}/${MAX_ROOM_PLAYERS}).`);
        finishOk();
      };

      // If WebRTC isn't supported or strict NAT blocks DataChannel within 2.5s, activate HTTP relay seamlessly
      const relayFallbackTimer = window.setTimeout(activateRelay, pc ? 2500 : 120);

      if (pc) {
        pc.onconnectionstatechange = () => {
          if (pc && (pc.connectionState === 'failed' || pc.connectionState === 'disconnected')) {
            window.clearTimeout(relayFallbackTimer);
            activateRelay();
          }
        };

        pc.ondatachannel = (ev) => {
          const dc = ev.channel;
          this.hostDc = dc;
          dc.onopen = () => {
            window.clearTimeout(relayFallbackTimer);
            this.joinDcOpen = true;
            this.joinRelayActive = false;
            this.emitStatus(`Connected to room ${code}!`);
            finishOk();
          };
          dc.onmessage = (msgEv) => {
            this.handleIncomingRaw(String(msgEv.data));
          };
          dc.onclose = () => {
            this.joinDcOpen = false;
            this.emitCount();
            if (this.roomCode === code) {
              this.emitStatus('Disconnected from host.');
            }
          };
        };
      }

      const startTime = performance.now();
      const pollJoin = async () => {
        if (this.roomCode !== code || this.isHost) return;
        try {
          const data = await apiJson<{
            signals: Array<{ from: number; to: number; type: 'offer' | 'answer'; sdp: RTCSessionDescriptionInit }>;
            relays: Array<{ from: number; data: P2PMessage }>;
            playerCount: number;
          }>(`/api/rooms/${code}/peer-poll?peerId=${this.myId}`);

          if (data.playerCount !== this.roomPlayerCount) {
            this.roomPlayerCount = data.playerCount;
            this.emitCount();
          }

          if (pc) {
            for (const sig of data.signals) {
              if (sig.type === 'offer') {
                await pc.setRemoteDescription(sig.sdp);
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await waitIceComplete(pc);
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
              }
            }
          }

          for (const pkt of data.relays) {
            this.handleRelayPacket(pkt.from, pkt.data);
          }

          if (this.joinRelayActive && this.queuedJoinState) {
            const q = this.queuedJoinState;
            this.queuedJoinState = null;
            this.postRelay(q);
          }

          if (!handshakeResolved && performance.now() - startTime > 12000) {
            window.clearTimeout(relayFallbackTimer);
            reject(new Error('Timed out waiting for host response.'));
            return;
          }
        } catch (err) {
          if (!handshakeResolved) {
            window.clearTimeout(relayFallbackTimer);
            reject(err instanceof Error ? err : new Error('Failed to join room.'));
            return;
          }
          if (err instanceof Error && /closed|not found/i.test(err.message)) {
            this.emitStatus(err.message);
            void this.leaveRoom();
            return;
          }
        }

        if (this.roomCode === code && !this.isHost) {
          this.pollTimer = window.setTimeout(pollJoin, this.joinDcOpen ? 1000 : this.joinRelayActive ? 110 : 180);
        }
      };

      void pollJoin();
    });
  }

  private handleIncomingRaw(raw: string): void {
    try {
      const m = JSON.parse(raw) as P2PMessage;
      if (m.t === 'id') {
        this.myId = m.id;
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
    if (msg.t === 'id') {
      this.myId = msg.id;
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
          if (this.peers.size >= MAX_ROOM_PLAYERS - 1) continue;
          await this.createOfferForPeer(code, peerId);
        }

        for (const sig of data.signals) {
          if (sig.type === 'answer') {
            const link = this.peers.get(sig.from);
            if (link && link.pc.signalingState !== 'stable') {
              await link.pc.setRemoteDescription(sig.sdp);
            }
          }
        }

        for (const pkt of data.relays) {
          const sender = this.peers.get(pkt.from);
          if (sender && !sender.dcOpen && !sender.relayActive) {
            sender.relayActive = true;
            this.emitCount();
          }
          const m = pkt.data;
          if (!m) continue;
          m.from = m.from ?? pkt.from;
          if (m.t === 'bye') {
            if (this.peers.has(m.id)) {
              const gone = this.peers.get(m.id);
              try {
                gone?.dc?.close();
                gone?.pc.close();
              } catch {
                // ignore
              }
              this.peers.delete(m.id);
              this.onPeerLeft?.(m.id);
              this.emitStatus(`Player #${m.id} left.`);
              this.emitCount();
            }
            continue;
          }
          const targetId = 'to' in m ? m.to : undefined;
          if (targetId !== undefined && targetId !== 0) {
            const dest = this.peers.get(targetId);
            if (dest?.dcOpen && dest.dc?.readyState === 'open') {
              dest.dc.send(JSON.stringify(m));
            } else if (dest?.relayActive) {
              this.postRelay(m, targetId);
            }
          } else {
            if (targetId === undefined) {
              const serialized = JSON.stringify(m);
              this.peers.forEach((peer, pid) => {
                if (pid === pkt.from) return;
                if (peer.dcOpen && peer.dc?.readyState === 'open') {
                  peer.dc.send(serialized);
                } else if (peer.relayActive) {
                  this.postRelay(m, pid);
                }
              });
            }
            this.onMessage?.(m);
          }
        }

        if (this.queuedJoinState && this.peers.size > 0) {
          const q = this.queuedJoinState;
          this.queuedJoinState = null;
          this.postRelay(q);
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
          this.pollTimer = window.setTimeout(tickHost, usingRelay ? 110 : 400);
        }
      }
    };

    void tickHost();
  }

  private async createOfferForPeer(code: string, peerId: number): Promise<void> {
    let pc: RTCPeerConnection;
    let dc: RTCDataChannel;
    try {
      pc = new RTCPeerConnection(ICE_CONFIG);
      dc = pc.createDataChannel('bandukwa');
    } catch {
      // Browser without WebRTC support: mark peer immediately on HTTP relay
      const fallbackPc = null as unknown as RTCPeerConnection;
      this.peers.set(peerId, { pc: fallbackPc, dc: null, dcOpen: false, relayActive: true });
      this.emitStatus(`Player #${peerId} joined room ${code}.`);
      this.emitCount();
      return;
    }

    const link: PeerLink = { pc, dc, dcOpen: false, relayActive: false };
    this.peers.set(peerId, link);

    // Fallback to HTTP relay if WebRTC DC doesn't open within 2.5s
    const relayTimer = window.setTimeout(() => {
      const cur = this.peers.get(peerId);
      if (cur && !cur.dcOpen) {
        cur.relayActive = true;
        this.emitStatus(`Player #${peerId} joined room ${code}.`);
        this.emitCount();
      }
    }, 2500);

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        window.clearTimeout(relayTimer);
        const cur = this.peers.get(peerId);
        if (cur && !cur.dcOpen && !cur.relayActive) {
          cur.relayActive = true;
          this.emitCount();
        }
      }
    };

    dc.onopen = () => {
      window.clearTimeout(relayTimer);
      link.dcOpen = true;
      link.relayActive = false;
      dc.send(JSON.stringify({ t: 'id', id: peerId }));
      this.emitStatus(`Player #${peerId} connected (${this.connectedCount + 1}/${MAX_ROOM_PLAYERS}).`);
      this.emitCount();
    };

    dc.onmessage = (ev) => {
      let m: P2PMessage;
      try {
        m = JSON.parse(String(ev.data)) as P2PMessage;
      } catch {
        return;
      }
      m.from = peerId;
      const targetId = 'to' in m ? m.to : undefined;
      if (targetId !== undefined && targetId !== 0) {
        const dest = this.peers.get(targetId);
        if (dest?.dcOpen && dest.dc?.readyState === 'open') {
          dest.dc.send(JSON.stringify(m));
        } else if (dest?.relayActive) {
          this.postRelay(m, targetId);
        }
      } else {
        if (targetId === undefined) {
          const serialized = JSON.stringify(m);
          this.peers.forEach((peer, pid) => {
            if (pid === peerId) return;
            if (peer.dcOpen && peer.dc?.readyState === 'open') {
              peer.dc.send(serialized);
            } else if (peer.relayActive) {
              this.postRelay(m, pid);
            }
          });
        }
        this.onMessage?.(m);
      }
    };

    dc.onclose = () => {
      window.clearTimeout(relayTimer);
      if (!this.peers.has(peerId)) return;
      this.peers.delete(peerId);
      this.onPeerLeft?.(peerId);
      this.send({ t: 'bye', id: peerId });
      this.emitStatus(`Player #${peerId} left.`);
      this.emitCount();
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitIceComplete(pc);
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
      window.clearTimeout(relayTimer);
      link.relayActive = true;
      this.emitCount();
    }
  }

  async leaveRoom(): Promise<void> {
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    const oldCode = this.roomCode;
    const oldId = this.myId;
    this.roomCode = null;
    this.joinDcOpen = false;
    this.joinRelayActive = false;
    this.roomPlayerCount = 1;

    this.peers.forEach(({ pc, dc }) => {
      try {
        dc?.close();
        pc.close();
      } catch {
        // ignore close errors
      }
    });
    this.peers.clear();

    try {
      this.hostDc?.close();
      this.joinPc?.close();
    } catch {
      // ignore close errors
    }
    this.hostDc = null;
    this.joinPc = null;

    if (oldCode) {
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
