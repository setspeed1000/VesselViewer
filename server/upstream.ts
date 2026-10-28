/**
 * Maintains one WebSocket connection to aisstream.io with automatic reconnect.
 * See https://github.com/aisstream/example for the reference clients.
 */
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { SUBSCRIBED_MESSAGE_TYPES } from '../shared/aisstream.js';
import type { UpstreamState } from '../shared/protocol.js';

export interface UpstreamOptions {
  url: string;
  apiKey: string;
  boundingBoxes: number[][][];
}

interface UpstreamEvents {
  message: [raw: unknown, receivedAt: number];
  state: [state: UpstreamState, error?: string];
}

/** Reconnect if the global feed is silent this long. */
const STALL_TIMEOUT_MS = 60_000;
const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;
/** Back off much longer when aisstream rejects the API key. */
const AUTH_BACKOFF_MS = 5 * 60_000;

export class AisStreamUpstream extends EventEmitter<UpstreamEvents> {
  state: UpstreamState = 'disconnected';
  lastError: string | undefined;
  private ws: WebSocket | undefined;
  private backoffMs = MIN_BACKOFF_MS;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private stallTimer: NodeJS.Timeout | undefined;
  private stopped = false;
  private authFailed = false;

  constructor(private readonly options: UpstreamOptions) {
    super();
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.stallTimer);
    this.ws?.close(1000);
    this.ws = undefined;
  }

  private setState(state: UpstreamState, error?: string): void {
    this.state = state;
    if (error !== undefined) this.lastError = error;
    this.emit('state', state, error);
  }

  private connect(): void {
    this.authFailed = false;
    this.setState('connecting');
    // aisstream requires permessage-deflate to serve full bandwidth.
    const ws = new WebSocket(this.options.url, { perMessageDeflate: true, handshakeTimeout: 15_000 });
    this.ws = ws;

    ws.on('open', () => {
      // The subscription must be sent within 3 seconds of opening.
      ws.send(
        JSON.stringify({
          APIKey: this.options.apiKey,
          BoundingBoxes: this.options.boundingBoxes,
          FilterMessageTypes: SUBSCRIBED_MESSAGE_TYPES,
        }),
      );
      this.armStallTimer();
    });

    ws.on('message', (data) => {
      const receivedAt = Date.now();
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (typeof parsed !== 'object' || parsed === null) return;
      const error = (parsed as { error?: unknown }).error;
      if (typeof error === 'string') {
        this.authFailed = /api ?key/i.test(error);
        this.setState('error', `aisstream: ${error}`);
        return;
      }
      if (this.state !== 'connected') {
        this.backoffMs = MIN_BACKOFF_MS;
        this.lastError = undefined;
        this.setState('connected');
      }
      this.armStallTimer();
      // The first frame may be a subscription confirmation rather than AIS data.
      if ('MessageType' in parsed) this.emit('message', parsed, receivedAt);
    });

    ws.on('error', (err) => {
      this.lastError = err.message;
    });

    ws.on('close', (code, reason) => {
      clearTimeout(this.stallTimer);
      if (this.ws !== ws) return;
      this.ws = undefined;
      if (this.stopped) {
        this.setState('disconnected');
        return;
      }
      const why = reason.toString() || this.lastError || `closed (${code})`;
      this.setState(this.authFailed ? 'error' : 'disconnected', why);
      this.scheduleReconnect();
    });
  }

  private armStallTimer(): void {
    clearTimeout(this.stallTimer);
    this.stallTimer = setTimeout(() => {
      this.lastError = `no data for ${STALL_TIMEOUT_MS / 1000}s`;
      this.ws?.terminate();
    }, STALL_TIMEOUT_MS);
  }

  private scheduleReconnect(): void {
    const delay = this.authFailed ? AUTH_BACKOFF_MS : this.backoffMs;
    this.backoffMs = Math.min(MAX_BACKOFF_MS, this.backoffMs * 2);
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), delay * (0.8 + Math.random() * 0.4));
  }
}
