export interface BrokerDef {
  url: string;
  username?: string;
  password?: string;
  port443: boolean;
}

export const BROKER_DEFS: readonly BrokerDef[] = [
  // Port 443 standard HTTPS/WSS port — works across strict mobile carriers, firewalls, and WebViews
  { url: 'wss://public.cloud.shiftr.io', username: 'public', password: 'public', port443: true },
  // Fast global WebSocket MQTT relays
  { url: 'wss://broker.emqx.io:8084/mqtt', port443: false },
  { url: 'wss://broker.hivemq.com:8884/mqtt', port443: false },
];

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encodeVarInt(n: number): number[] {
  const out: number[] = [];
  let x = n;
  do {
    let digit = x % 128;
    x = Math.floor(x / 128);
    if (x > 0) digit |= 0x80;
    out.push(digit);
  } while (x > 0);
  return out;
}

function encodeUtf8Field(str: string): Uint8Array<ArrayBuffer> {
  const bytes = encoder.encode(str);
  const out = new Uint8Array(new ArrayBuffer(2 + bytes.length));
  out[0] = (bytes.length >> 8) & 0xff;
  out[1] = bytes.length & 0xff;
  out.set(bytes, 2);
  return out;
}

function concatBytes(parts: ReadonlyArray<Uint8Array>): Uint8Array<ArrayBuffer> {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function buildPacket(headerByte: number, body: Uint8Array): Uint8Array<ArrayBuffer> {
  const rem = encodeVarInt(body.length);
  const out = new Uint8Array(new ArrayBuffer(1 + rem.length + body.length));
  out[0] = headerByte;
  out.set(rem, 1);
  out.set(body, 1 + rem.length);
  return out;
}

export function generateFiveDigitRoomCode(): string {
  return String(Math.floor(10000 + Math.random() * 90000));
}

export class WssMqttClient {
  private ws: WebSocket | null = null;
  private rxBuf: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(0));
  private nextPacketId = 1;
  private subWaiters = new Map<number, () => void>();
  private pingTimer: number | null = null;
  private closed = false;

  onMessage?: (topic: string, payload: string) => void;
  onClose?: () => void;

  get isOpen(): boolean {
    return !this.closed && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  connect(
    url: string,
    timeoutMs = 12000,
    auth?: { username?: string; password?: string },
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let ws: WebSocket;
      try {
        ws = new WebSocket(url, 'mqtt');
      } catch (err) {
        reject(err instanceof Error ? err : new Error('WebSocket unavailable.'));
        return;
      }
      ws.binaryType = 'arraybuffer';
      this.ws = ws;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.close();
        reject(new Error('Multiplayer relay connection timed out.'));
      }, timeoutMs) as unknown as number;

      const finishErr = (msg: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.close();
        reject(new Error(msg));
      };

      ws.onopen = () => {
        const clientId = `bw_${Math.random().toString(36).slice(2, 12)}`;
        const hasAuth = Boolean(auth?.username && auth?.password);
        const flags = hasAuth ? 0xc2 : 0x02;
        const varHeader = new Uint8Array([
          0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, // "MQTT"
          0x04, // Protocol Level 4 (3.1.1)
          flags,
          0x00, 0x1e, // Keep Alive 30s
        ]);
        const parts: Uint8Array[] = [varHeader, encodeUtf8Field(clientId)];
        if (hasAuth && auth?.username && auth?.password) {
          parts.push(encodeUtf8Field(auth.username), encodeUtf8Field(auth.password));
        }
        try {
          ws.send(buildPacket(0x10, concatBytes(parts)));
        } catch {
          finishErr('Failed to send relay handshake.');
        }
      };

      ws.onmessage = (ev) => {
        const chunk =
          ev.data instanceof ArrayBuffer
            ? new Uint8Array(ev.data)
            : typeof ev.data === 'string'
              ? encoder.encode(ev.data)
              : null;
        if (!chunk) return;

        this.rxBuf = concatBytes([this.rxBuf, chunk]);
        this.processRx((connAckCode) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (connAckCode !== 0) {
            this.close();
            reject(new Error(`Relay rejected connection (${connAckCode}).`));
            return;
          }
          this.pingTimer = setInterval(() => {
            if (this.isOpen) {
              try {
                this.ws?.send(new Uint8Array([0xc0, 0x00]));
              } catch {
                // ignore
              }
            }
          }, 15_000) as unknown as number;
          resolve();
        });
      };

      ws.onerror = () => {
        finishErr('Unable to reach multiplayer relay.');
      };

      ws.onclose = () => {
        if (!settled) {
          finishErr('Multiplayer relay closed unexpectedly.');
          return;
        }
        this.cleanupTimers();
        if (!this.closed) {
          this.closed = true;
          this.onClose?.();
        }
      };
    });
  }

  subscribe(topic: string, timeoutMs = 6000): Promise<void> {
    if (!this.isOpen || !this.ws) {
      return Promise.reject(new Error('Relay socket not connected.'));
    }
    const packetId = this.nextPacketId;
    this.nextPacketId = (this.nextPacketId % 65534) + 1;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.subWaiters.delete(packetId);
        reject(new Error('Timed out subscribing to room channel.'));
      }, timeoutMs);

      this.subWaiters.set(packetId, () => {
        clearTimeout(timer);
        resolve();
      });

      const body = concatBytes([
        new Uint8Array([(packetId >> 8) & 0xff, packetId & 0xff]),
        encodeUtf8Field(topic),
        new Uint8Array([0x00]),
      ]);
      try {
        this.ws?.send(buildPacket(0x82, body));
      } catch {
        clearTimeout(timer);
        this.subWaiters.delete(packetId);
        reject(new Error('Failed to subscribe to room channel.'));
      }
    });
  }

  publish(topic: string, payload: string): void {
    if (!this.isOpen || !this.ws) return;
    const body = concatBytes([encodeUtf8Field(topic), encoder.encode(payload)]);
    try {
      this.ws.send(buildPacket(0x30, body));
    } catch {
      // ignore send race on close
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.cleanupTimers();
    this.subWaiters.clear();
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(new Uint8Array([0xe0, 0x00]));
        }
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  private cleanupTimers(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private processRx(onConnAck: (code: number) => void): void {
    let offset = 0;
    while (offset + 2 <= this.rxBuf.length) {
      const header = this.rxBuf[offset];
      const pktType = (header >> 4) & 0x0f;

      let pos = offset + 1;
      let multiplier = 1;
      let remaining = 0;
      let varLenComplete = false;
      while (pos < this.rxBuf.length) {
        const b = this.rxBuf[pos++];
        remaining += (b & 0x7f) * multiplier;
        multiplier *= 128;
        if ((b & 0x80) === 0) {
          varLenComplete = true;
          break;
        }
        if (multiplier > 128 * 128 * 128) {
          break;
        }
      }

      if (!varLenComplete || pos + remaining > this.rxBuf.length) {
        break;
      }

      const bodyStart = pos;
      const bodyEnd = pos + remaining;

      if (pktType === 2 && remaining >= 2) {
        // CONNACK
        onConnAck(this.rxBuf[bodyStart + 1]);
      } else if (pktType === 9 && remaining >= 2) {
        // SUBACK
        const pid = (this.rxBuf[bodyStart] << 8) | this.rxBuf[bodyStart + 1];
        const resolveSub = this.subWaiters.get(pid);
        if (resolveSub) {
          this.subWaiters.delete(pid);
          resolveSub();
        }
      } else if (pktType === 3 && remaining >= 2) {
        // PUBLISH
        const topicLen = (this.rxBuf[bodyStart] << 8) | this.rxBuf[bodyStart + 1];
        let cursor = bodyStart + 2;
        if (cursor + topicLen <= bodyEnd) {
          const topic = decoder.decode(this.rxBuf.subarray(cursor, cursor + topicLen));
          cursor += topicLen;
          const qos = (header >> 1) & 0x03;
          if (qos > 0 && cursor + 2 <= bodyEnd) {
            const pidHi = this.rxBuf[cursor];
            const pidLo = this.rxBuf[cursor + 1];
            cursor += 2;
            if (qos === 1 && this.isOpen) {
              this.ws?.send(new Uint8Array([0x40, 0x02, pidHi, pidLo]));
            }
          }
          const payload = decoder.decode(this.rxBuf.subarray(cursor, bodyEnd));
          this.onMessage?.(topic, payload);
        }
      }

      offset = bodyEnd;
    }

    if (offset > 0) {
      this.rxBuf = this.rxBuf.subarray(offset);
    }
  }
}

/**
 * Multi-broker host hub:
 * - Connects to Port-443 (shiftr.io) + :8084 (EMQX) + :8884 (HiveMQ) in parallel.
 * - Resolves immediately on the FIRST healthy broker so room creation takes ~0.5-1.5s.
 * - Silently attaches the remaining brokers in the background so mobile peers restricted
 *   to Port 443 can ALWAYS reach hosts on desktop (and vice versa).
 */
export class WssRelayHub {
  private clients = new Map<number, WssMqttClient>();
  private closed = false;

  onMessage?: (brokerIdx: number, topic: string, payload: string) => void;
  onAllClosed?: () => void;

  get isOpen(): boolean {
    if (this.closed) return false;
    for (const c of this.clients.values()) {
      if (c.isOpen) return true;
    }
    return false;
  }

  async startHost(hostTopic: string, timeoutMs = 12000): Promise<void> {
    const attempts = BROKER_DEFS.map(async (def, idx) => {
      const client = new WssMqttClient();
      await client.connect(def.url, timeoutMs, def);
      if (this.closed) {
        client.close();
        throw new Error('Closed');
      }
      client.onMessage = (topic, payload) => {
        if (!this.closed) {
          this.onMessage?.(idx, topic, payload);
        }
      };
      client.onClose = () => {
        this.clients.delete(idx);
        if (!this.closed && !this.isOpen) {
          this.onAllClosed?.();
        }
      };
      await client.subscribe(hostTopic, 6000);
      if (this.closed) {
        client.close();
        throw new Error('Closed');
      }
      this.clients.set(idx, client);
      return idx;
    });

    try {
      await Promise.any(attempts);
    } catch {
      this.close();
      throw new Error('Unable to reach multiplayer servers. Check your internet connection.');
    }
  }

  publish(brokerIdx: number | undefined, topic: string, payload: string): void {
    if (this.closed) return;
    if (brokerIdx !== undefined) {
      const preferred = this.clients.get(brokerIdx);
      if (preferred?.isOpen) {
        preferred.publish(topic, payload);
        return;
      }
    }
    for (const c of this.clients.values()) {
      if (c.isOpen) {
        c.publish(topic, payload);
        return;
      }
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.clients.forEach((c) => c.close());
    this.clients.clear();
  }
}
