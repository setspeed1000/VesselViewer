/**
 * VesselViewer relay server.
 *
 * Holds the aisstream.io API key server-side, keeps one upstream connection,
 * and fans vessel data out to browsers over /ws using the protocol in
 * shared/protocol.ts. Optional: the static site can also read aisstream
 * directly or run the built-in simulator.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import { dirname } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { parseAisStreamMessage } from '../shared/aisstream.js';
import { bboxContains, normalizeBBox, type BBox } from '../shared/geo.js';
import {
  PROTOCOL_VERSION,
  WS_PATH,
  type ClientMessage,
  type ServerMessage,
  type StatusMessage,
} from '../shared/protocol.js';
import { AisSimulator } from '../shared/simulator.js';
import { VesselStore } from '../shared/store.js';
import type { Vessel } from '../shared/vessel.js';
import { loadConfig } from './config.js';
import { AisStreamUpstream } from './upstream.js';

const FLUSH_INTERVAL_MS = 1_000;
const STATUS_INTERVAL_MS = 5_000;
const PRUNE_INTERVAL_MS = 60_000;
const PERSIST_INTERVAL_MS = 2 * 60_000;
/** Minimum spacing between viewport snapshots for one client. */
const SNAPSHOT_MIN_INTERVAL_MS = 300;
/** Skip deltas for a client whose socket buffer is this full; resync later. */
const MAX_BUFFERED_BYTES = 8 * 1024 * 1024;
const MAX_CLIENT_MESSAGE_BYTES = 4 * 1024;

const config = loadConfig();
const store = new VesselStore({ ttlMs: config.vesselTtlMs });

// ------------------------------------------------------------- persistence

function loadPersisted(): void {
  if (!config.persistFile) return;
  try {
    const vessels = JSON.parse(readFileSync(config.persistFile, 'utf8')) as Vessel[];
    const cutoff = Date.now() - config.vesselTtlMs;
    let loaded = 0;
    for (const v of vessels) {
      if (typeof v?.mmsi === 'number' && typeof v.lat === 'number' && v.positionTime >= cutoff) {
        store.upsert(v);
        loaded++;
      }
    }
    store.takeChanges();
    console.log(`[store] restored ${loaded} vessels from ${config.persistFile}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[store] could not read ${config.persistFile}: ${(err as Error).message}`);
    }
  }
}

function persist(): void {
  if (!config.persistFile) return;
  try {
    mkdirSync(dirname(config.persistFile), { recursive: true });
    const tmp = `${config.persistFile}.tmp`;
    writeFileSync(tmp, JSON.stringify([...store.values()]));
    renameSync(tmp, config.persistFile);
  } catch (err) {
    console.warn(`[store] could not write ${config.persistFile}: ${(err as Error).message}`);
  }
}

// ------------------------------------------------------------- data source

let messageCount = 0;
let messagesPerSecond = 0;

function ingest(raw: unknown, receivedAt: number): void {
  messageCount++;
  for (const update of parseAisStreamMessage(raw, receivedAt)) store.apply(update, receivedAt);
}

let upstream: AisStreamUpstream | undefined;
let simulator: AisSimulator | undefined;

function upstreamState(): Pick<StatusMessage, 'upstream' | 'upstreamError'> {
  if (simulator) return { upstream: 'connected' };
  return { upstream: upstream!.state, upstreamError: upstream!.lastError };
}

// ------------------------------------------------------------- clients

interface Client {
  ws: WebSocket;
  bbox: BBox | undefined;
  selected: number | null;
  lastSnapshotAt: number;
  snapshotTimer: NodeJS.Timeout | undefined;
  needsResync: boolean;
}

const clients = new Set<Client>();

function send(client: Client, msg: ServerMessage): void {
  if (client.ws.readyState === client.ws.OPEN) client.ws.send(JSON.stringify(msg));
}

function statusMessage(): StatusMessage {
  return {
    type: 'status',
    serverTime: Date.now(),
    source: config.source,
    ...upstreamState(),
    totalVessels: store.size,
    messagesPerSecond,
  };
}

function sendSnapshot(client: Client): void {
  client.snapshotTimer = undefined;
  if (!client.bbox) return;
  client.lastSnapshotAt = Date.now();
  client.needsResync = false;
  const vessels = store.inBBox(client.bbox);
  if (client.selected !== null && !vessels.some((v) => v.mmsi === client.selected)) {
    const selected = store.get(client.selected);
    if (selected) vessels.push(selected);
  }
  send(client, { type: 'snapshot', serverTime: Date.now(), bbox: client.bbox, vessels });
}

function scheduleSnapshot(client: Client): void {
  if (client.snapshotTimer) return;
  const wait = Math.max(0, client.lastSnapshotAt + SNAPSHOT_MIN_INTERVAL_MS - Date.now());
  client.snapshotTimer = setTimeout(() => sendSnapshot(client), wait);
}

function isBBox(x: unknown): x is BBox {
  return Array.isArray(x) && x.length === 4 && x.every((n) => typeof n === 'number' && Number.isFinite(n));
}

function handleClientMessage(client: Client, data: string): void {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(data) as ClientMessage;
  } catch {
    return;
  }
  if (typeof msg !== 'object' || msg === null) return;
  switch (msg.type) {
    case 'viewport':
      if (!isBBox(msg.bbox)) return;
      client.bbox = normalizeBBox(msg.bbox);
      scheduleSnapshot(client);
      break;
    case 'select':
      if (msg.mmsi !== null && !Number.isInteger(msg.mmsi)) return;
      client.selected = msg.mmsi;
      if (msg.mmsi !== null) {
        const v = store.get(msg.mmsi);
        if (v) send(client, { type: 'delta', serverTime: Date.now(), vessels: [v], removed: [] });
      }
      break;
    case 'track':
      if (!Number.isInteger(msg.mmsi)) return;
      send(client, { type: 'track', mmsi: msg.mmsi, points: store.track(msg.mmsi) });
      break;
    case 'search':
      if (typeof msg.query !== 'string') return;
      send(client, {
        type: 'searchResults',
        query: msg.query,
        vessels: store.search(msg.query.slice(0, 64)),
      });
      break;
  }
}

function originAllowed(req: IncomingMessage): boolean {
  if (config.allowedOrigins.length === 0) return true;
  const origin = req.headers.origin?.replace(/\/$/, '');
  return origin !== undefined && config.allowedOrigins.includes(origin);
}

// ------------------------------------------------------------- periodic work

function flush(): void {
  const { updated, removed } = store.takeChanges();
  if (updated.length === 0 && removed.length === 0) return;
  const vessels: Vessel[] = [];
  for (const mmsi of updated) {
    const v = store.get(mmsi);
    if (v) vessels.push(v);
  }
  const serverTime = Date.now();
  for (const client of clients) {
    if (!client.bbox) continue;
    if (client.ws.bufferedAmount > MAX_BUFFERED_BYTES) {
      client.needsResync = true;
      continue;
    }
    if (client.needsResync) {
      sendSnapshot(client);
      if (removed.length > 0) send(client, { type: 'delta', serverTime, vessels: [], removed });
      continue;
    }
    const bbox = client.bbox;
    const inView = vessels.filter(
      (v) => v.mmsi === client.selected || bboxContains(bbox, v.lon, v.lat),
    );
    if (inView.length > 0 || removed.length > 0) {
      send(client, { type: 'delta', serverTime, vessels: inView, removed });
    }
  }
}

// ------------------------------------------------------------- start

loadPersisted();

const http = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(statusMessage()));
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('VesselViewer relay. Connect a WebSocket to /ws.\n');
});

const wss = new WebSocketServer({
  server: http,
  path: WS_PATH,
  maxPayload: MAX_CLIENT_MESSAGE_BYTES,
  perMessageDeflate: { threshold: 1024 },
  verifyClient: ({ req }: { req: IncomingMessage }) => originAllowed(req),
});

wss.on('connection', (ws) => {
  const client: Client = {
    ws,
    bbox: undefined,
    selected: null,
    lastSnapshotAt: 0,
    snapshotTimer: undefined,
    needsResync: false,
  };
  clients.add(client);
  send(client, {
    type: 'welcome',
    protocol: PROTOCOL_VERSION,
    source: config.source,
    serverTime: Date.now(),
    vesselTtlMs: config.vesselTtlMs,
  });
  send(client, statusMessage());
  ws.on('message', (data, isBinary) => {
    if (!isBinary) handleClientMessage(client, data.toString());
  });
  ws.on('close', () => {
    clearTimeout(client.snapshotTimer);
    clients.delete(client);
  });
  ws.on('error', () => ws.terminate());
});

if (config.source === 'simulator') {
  simulator = new AisSimulator({ vesselCount: config.simulatorVessels });
  simulator.start((msg) => ingest(msg, Date.now()));
  console.log(`[source] SIMULATED traffic, ${config.simulatorVessels} vessels`);
} else {
  upstream = new AisStreamUpstream({
    url: config.upstreamUrl,
    apiKey: config.apiKey!,
    boundingBoxes: config.boundingBoxes,
  });
  upstream.on('message', ingest);
  upstream.on('state', (state, error) => {
    console.log(`[aisstream] ${state}${error ? `: ${error}` : ''}`);
  });
  upstream.start();
}

const timers = [
  setInterval(flush, FLUSH_INTERVAL_MS),
  setInterval(() => {
    messagesPerSecond = Math.round(messageCount / (STATUS_INTERVAL_MS / 1000));
    messageCount = 0;
    const status = statusMessage();
    for (const client of clients) send(client, status);
  }, STATUS_INTERVAL_MS),
  setInterval(() => store.prune(), PRUNE_INTERVAL_MS),
  setInterval(persist, PERSIST_INTERVAL_MS),
];

http.listen(config.port, config.host, () => {
  console.log(`[relay] listening on ws://${config.host}:${config.port}${WS_PATH}`);
});

function shutdown(): void {
  console.log('[relay] shutting down');
  for (const t of timers) clearInterval(t);
  upstream?.stop();
  simulator?.stop();
  persist();
  for (const client of clients) client.ws.close(1001);
  wss.close();
  http.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2_000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
