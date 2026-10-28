/**
 * Connects to a VesselViewer relay server (server/index.ts), which holds the
 * aisstream API key and streams only the vessels inside the current viewport.
 */
import { bboxContains, padBBox, type BBox } from '../../shared/geo.js';
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from '../../shared/protocol.js';
import type { Vessel } from '../../shared/vessel.js';
import type { World } from '../core/world.js';
import type { DataSource } from './types.js';

const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const SEARCH_TIMEOUT_MS = 5_000;
const PRUNE_INTERVAL_MS = 60_000;

export function createRelaySource(world: World, url: string): DataSource {
  let ws: WebSocket | undefined;
  let stopped = true;
  let backoff = MIN_BACKOFF_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let pruneTimer: ReturnType<typeof setInterval> | undefined;
  let viewport: BBox | undefined;
  let selected: number | null = null;
  let pendingSearch: { query: string; resolve: (v: Vessel[]) => void; timer: ReturnType<typeof setTimeout> } | undefined;

  const send = (msg: ClientMessage) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  const setState = (state: 'connecting' | 'disconnected' | 'error', message: string) => {
    world.setStatus({ ...world.status, kind: 'relay', state, message });
  };

  const handle = (msg: ServerMessage) => {
    switch (msg.type) {
      case 'welcome':
        if (msg.protocol !== PROTOCOL_VERSION) {
          setState('error', `Relay speaks protocol v${msg.protocol}; this app needs v${PROTOCOL_VERSION}.`);
          ws?.close();
          return;
        }
        world.clockOffsetMs = msg.serverTime - Date.now();
        break;
      case 'snapshot': {
        world.clockOffsetMs = msg.serverTime - Date.now();
        const present = new Set<number>();
        for (const v of msg.vessels) {
          world.store.upsert(v);
          present.add(v.mmsi);
        }
        // Anything we hold inside the snapshot area that the relay no longer has is gone.
        for (const v of [...world.store.values()]) {
          if (!present.has(v.mmsi) && v.mmsi !== selected && bboxContains(msg.bbox, v.lon, v.lat)) {
            world.store.remove(v.mmsi);
          }
        }
        world.store.takeChanges();
        world.notifyVessels();
        break;
      }
      case 'delta':
        world.clockOffsetMs = msg.serverTime - Date.now();
        for (const v of msg.vessels) world.store.upsert(v);
        for (const mmsi of msg.removed) world.store.remove(mmsi);
        world.store.takeChanges();
        world.notifyVessels();
        break;
      case 'status':
        world.setStatus({
          kind: 'relay',
          state: msg.upstream,
          simulated: msg.source === 'simulator',
          message:
            msg.source === 'simulator'
              ? 'Relay is serving SIMULATED traffic'
              : msg.upstream === 'connected'
                ? 'Live data via relay'
                : (msg.upstreamError ?? `Relay upstream ${msg.upstream}`),
          messagesPerSecond: msg.messagesPerSecond,
          totalVessels: msg.totalVessels,
        });
        break;
      case 'track':
        world.setTrack(msg.mmsi, msg.points);
        break;
      case 'searchResults':
        if (pendingSearch && pendingSearch.query === msg.query) {
          clearTimeout(pendingSearch.timer);
          pendingSearch.resolve(msg.vessels);
          pendingSearch = undefined;
        }
        break;
      case 'error':
        console.warn('[relay]', msg.message);
        break;
    }
  };

  const connect = () => {
    setState('connecting', `Connecting to relay ${url}…`);
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch (err) {
      setState('error', `Invalid relay URL: ${(err as Error).message}`);
      return;
    }
    ws = socket;
    socket.onopen = () => {
      backoff = MIN_BACKOFF_MS;
      if (viewport) send({ type: 'viewport', bbox: viewport });
      if (selected !== null) send({ type: 'select', mmsi: selected });
    };
    socket.onmessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      try {
        handle(JSON.parse(event.data) as ServerMessage);
      } catch (err) {
        console.warn('[relay] bad message', err);
      }
    };
    socket.onclose = () => {
      if (ws !== socket) return;
      ws = undefined;
      if (stopped) return;
      setState('disconnected', `Relay unreachable, retrying in ${Math.round(backoff / 1000)} s`);
      reconnectTimer = setTimeout(connect, backoff);
      backoff = Math.min(MAX_BACKOFF_MS, backoff * 2);
    };
  };

  return {
    kind: 'relay',
    start() {
      stopped = false;
      connect();
      pruneTimer = setInterval(() => {
        if (world.store.prune(world.now()).length > 0) world.notifyVessels();
      }, PRUNE_INTERVAL_MS);
    },
    stop() {
      stopped = true;
      clearTimeout(reconnectTimer);
      clearInterval(pruneTimer);
      ws?.close(1000);
      ws = undefined;
      if (pendingSearch) {
        clearTimeout(pendingSearch.timer);
        pendingSearch.resolve([]);
        pendingSearch = undefined;
      }
    },
    setViewport(bbox) {
      viewport = padBBox(bbox, 0.25);
      send({ type: 'viewport', bbox: viewport });
    },
    setSelected(mmsi) {
      selected = mmsi;
      send({ type: 'select', mmsi });
    },
    requestTrack(mmsi) {
      send({ type: 'track', mmsi });
    },
    search(query) {
      if (pendingSearch) {
        clearTimeout(pendingSearch.timer);
        pendingSearch.resolve([]);
      }
      return new Promise<Vessel[]>((resolve) => {
        const timer = setTimeout(() => {
          if (pendingSearch?.timer === timer) pendingSearch = undefined;
          resolve([]);
        }, SEARCH_TIMEOUT_MS);
        pendingSearch = { query, resolve, timer };
        send({ type: 'search', query });
      });
    },
  };
}
