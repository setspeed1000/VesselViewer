/**
 * Sources that decode raw aisstream-format messages in the browser:
 * the built-in simulator, and a direct connection to aisstream.io.
 */
import { parseAisStreamMessage, SUBSCRIBED_MESSAGE_TYPES } from '../../shared/aisstream.js';
import type { UpstreamState } from '../../shared/protocol.js';
import { AisSimulator } from '../../shared/simulator.js';
import type { Vessel } from '../../shared/vessel.js';
import type { SourceKind } from '../core/settings.js';
import type { World } from '../core/world.js';
import type { DataSource } from './types.js';

/** Produces raw aisstream-format messages. */
interface RawFeed {
  start(onMessage: (raw: unknown) => void, onState: (state: UpstreamState, message?: string) => void): void;
  stop(): void;
}

const STATUS_INTERVAL_MS = 2_000;
const PRUNE_INTERVAL_MS = 60_000;

class LocalSource implements DataSource {
  private timers: ReturnType<typeof setInterval>[] = [];
  private messages = 0;
  private lastRateAt = 0;
  private rate = 0;
  private state: UpstreamState = 'connecting';
  private message: string | undefined;

  constructor(
    readonly kind: SourceKind,
    private readonly world: World,
    private readonly feed: RawFeed,
  ) {}

  start(): void {
    this.world.clockOffsetMs = 0;
    this.lastRateAt = Date.now();
    this.feed.start(
      (raw) => this.ingest(raw),
      (state, message) => {
        this.state = state;
        this.message = message;
        this.publishStatus();
      },
    );
    this.timers.push(
      setInterval(() => this.publishStatus(), STATUS_INTERVAL_MS),
      setInterval(() => {
        if (this.world.store.prune().length > 0) this.world.notifyVessels();
      }, PRUNE_INTERVAL_MS),
    );
  }

  stop(): void {
    this.feed.stop();
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }

  setViewport(): void {
    // Local sources hold the full subscription; the renderer culls off-screen vessels.
  }

  setSelected(): void {}

  requestTrack(mmsi: number): void {
    this.world.emit('track', mmsi);
  }

  search(query: string): Promise<Vessel[]> {
    return Promise.resolve(this.world.store.search(query));
  }

  private ingest(raw: unknown): void {
    this.messages++;
    const now = Date.now();
    let changed = false;
    for (const update of parseAisStreamMessage(raw, now)) {
      if (this.world.store.apply(update, now)) changed = true;
    }
    if (changed) {
      this.world.store.takeChanges();
      this.world.notifyVessels();
    }
  }

  private publishStatus(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRateAt) / 1000;
    if (elapsed >= 1) {
      this.rate = Math.round(this.messages / elapsed);
      this.messages = 0;
      this.lastRateAt = now;
    }
    this.world.setStatus({
      kind: this.kind,
      state: this.state,
      simulated: this.kind === 'simulator',
      message: this.message,
      messagesPerSecond: this.rate,
      totalVessels: this.world.store.size,
    });
  }
}

// ------------------------------------------------------------------ simulator

export function createSimulatorSource(world: World, vesselCount = 400): DataSource {
  const sim = new AisSimulator({ vesselCount });
  return new LocalSource('simulator', world, {
    start(onMessage, onState) {
      onState('connected', 'Simulated traffic, not real ships');
      sim.start(onMessage);
    },
    stop() {
      sim.stop();
    },
  });
}

// ------------------------------------------------------------------ aisstream direct

const AISSTREAM_URL = 'wss://stream.aisstream.io/v0/stream';
const STALL_TIMEOUT_MS = 60_000;
const MIN_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;
const ERROR_BACKOFF_MS = 5 * 60_000;

/**
 * Connects the browser straight to aisstream.io with a key held in
 * localStorage. Whole-world subscription; the map culls what is off-screen.
 */
export function createDirectSource(world: World, apiKey: string): DataSource {
  let ws: WebSocket | undefined;
  let stopped = true;
  let backoff = MIN_BACKOFF_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  const decoder = new TextDecoder();

  const feed: RawFeed = {
    start(onMessage, onState) {
      stopped = false;
      const connect = () => {
        onState('connecting', 'Connecting to aisstream.io…');
        let gotData = false;
        let serverError: string | undefined;
        const socket = new WebSocket(AISSTREAM_URL);
        socket.binaryType = 'arraybuffer';
        ws = socket;

        const armStall = () => {
          clearTimeout(stallTimer);
          stallTimer = setTimeout(() => socket.close(), STALL_TIMEOUT_MS);
        };

        socket.onopen = () => {
          // Must be sent within 3 seconds of the connection opening.
          socket.send(
            JSON.stringify({
              APIKey: apiKey,
              BoundingBoxes: [[[-90, -180], [90, 180]]],
              FilterMessageTypes: SUBSCRIBED_MESSAGE_TYPES,
            }),
          );
          armStall();
        };

        socket.onmessage = (event: MessageEvent) => {
          const text = typeof event.data === 'string' ? event.data : decoder.decode(event.data as ArrayBuffer);
          let msg: unknown;
          try {
            msg = JSON.parse(text);
          } catch {
            return;
          }
          if (typeof msg !== 'object' || msg === null) return;
          const error = (msg as { error?: unknown }).error;
          if (typeof error === 'string') {
            serverError = error;
            onState('error', `aisstream.io: ${error}`);
            return;
          }
          armStall();
          if (!gotData) {
            gotData = true;
            backoff = MIN_BACKOFF_MS;
            onState('connected', 'Live data from aisstream.io');
          }
          if ('MessageType' in msg) onMessage(msg);
        };

        socket.onclose = (event: CloseEvent) => {
          clearTimeout(stallTimer);
          if (ws !== socket) return;
          ws = undefined;
          if (stopped) return;
          let delay = backoff;
          backoff = Math.min(MAX_BACKOFF_MS, backoff * 2);
          if (serverError) {
            delay = ERROR_BACKOFF_MS;
            onState('error', `aisstream.io: ${serverError}. Retrying in 5 minutes.`);
          } else if (!gotData) {
            onState(
              'error',
              `aisstream.io closed the connection before sending data (code ${event.code}). ` +
                'Check the API key. If this keeps happening, aisstream may be refusing ' +
                'browser connections: use a relay server instead (see Settings).',
            );
          } else {
            onState('disconnected', 'Connection lost, reconnecting…');
          }
          reconnectTimer = setTimeout(connect, delay * (0.8 + Math.random() * 0.4));
        };
      };
      connect();
    },
    stop() {
      stopped = true;
      clearTimeout(reconnectTimer);
      clearTimeout(stallTimer);
      ws?.close(1000);
      ws = undefined;
    },
  };
  return new LocalSource('direct', world, feed);
}
