/**
 * End-to-end test of the relay: a fake aisstream.io server speaks the real
 * protocol, the relay connects to it, and a browser-like client reads from /ws.
 */
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import WebSocket, { WebSocketServer } from 'ws';
import type { ServerMessage } from '../shared/protocol.js';

const children: ChildProcess[] = [];
after(() => {
  for (const c of children) c.kill('SIGTERM');
});

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = new WebSocketServer({ port: 0, host: '127.0.0.1' }, () => {
      const { port } = s.address() as AddressInfo;
      s.close(() => resolve(port));
    });
  });
}

async function startRelay(upstreamPort: number): Promise<number> {
  const port = await freePort();
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: {
      ...process.env,
      AISSTREAM_API_KEY: 'test-key-0123456789abcdef',
      AISSTREAM_URL: `ws://127.0.0.1:${upstreamPort}`,
      AIS_SOURCE: 'aisstream',
      PORT: String(port),
      HOST: '127.0.0.1',
      PERSIST_FILE: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let output = '';
  child.stdout!.on('data', (d) => (output += d));
  child.stderr!.on('data', (d) => (output += d));
  const deadline = Date.now() + 15_000;
  while (!output.includes('[relay] listening')) {
    if (Date.now() > deadline) throw new Error(`relay did not start:\n${output}`);
    if (child.exitCode !== null) throw new Error(`relay exited:\n${output}`);
    await new Promise((r) => setTimeout(r, 50));
  }
  return port;
}

function waitFor(ws: WebSocket, type: ServerMessage['type'], timeoutMs = 8_000): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), timeoutMs);
    const onMessage = (data: WebSocket.RawData) => {
      const msg = JSON.parse(data.toString()) as ServerMessage;
      if (msg.type === type) {
        clearTimeout(timer);
        ws.off('message', onMessage);
        resolve(msg);
      }
    };
    ws.on('message', onMessage);
  });
}

test('relay subscribes upstream and streams vessels to clients', async () => {
  const fake = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await once(fake, 'listening');
  const subscriptions: Record<string, unknown>[] = [];
  fake.on('connection', (socket) => {
    socket.once('message', (data) => {
      subscriptions.push(JSON.parse(data.toString()));
      const send = (msg: unknown) => socket.send(Buffer.from(JSON.stringify(msg)), { binary: true });
      const now = new Date().toISOString();
      const time = `${now.slice(0, 10)} ${now.slice(11, 23)}000 +0000 UTC`;
      const tick = () => {
        send({
          MessageType: 'PositionReport',
          MetaData: { MMSI: 244660000, ShipName: 'TEST SHIP', latitude: 51.95, longitude: 4.05, time_utc: time },
          Message: {
            PositionReport: { UserID: 244660000, Valid: true, Latitude: 51.95, Longitude: 4.05, Sog: 11.2, Cog: 270, TrueHeading: 271, NavigationalStatus: 0, RateOfTurn: 0 },
          },
        });
        send({
          MessageType: 'ShipStaticData',
          MetaData: { MMSI: 244660000, time_utc: time },
          Message: {
            ShipStaticData: { UserID: 244660000, Valid: true, Name: 'TEST SHIP@@@', Type: 70, CallSign: 'PABC', ImoNumber: 9000001, Dimension: { A: 100, B: 20, C: 10, D: 10 }, Destination: 'ROTTERDAM' },
          },
        });
      };
      tick();
      const interval = setInterval(tick, 300);
      socket.on('close', () => clearInterval(interval));
    });
  });

  const upstreamPort = (fake.address() as AddressInfo).port;
  const relayPort = await startRelay(upstreamPort);

  const client = new WebSocket(`ws://127.0.0.1:${relayPort}/ws`);
  const welcome = waitFor(client, 'welcome');
  await once(client, 'open');
  const w = await welcome;
  assert.equal(w.type === 'welcome' && w.source, 'aisstream');

  // Give the relay a moment to ingest, then ask for the North Sea.
  await new Promise((r) => setTimeout(r, 800));
  const snapshotPromise = waitFor(client, 'snapshot');
  client.send(JSON.stringify({ type: 'viewport', bbox: [3, 51, 5, 53] }));
  const snapshot = await snapshotPromise;
  assert.ok(snapshot.type === 'snapshot');
  const vessel = snapshot.vessels.find((v) => v.mmsi === 244660000);
  assert.ok(vessel, 'vessel present in snapshot');
  assert.equal(vessel.name, 'TEST SHIP');
  assert.equal(vessel.shipType, 70);
  assert.equal(vessel.heading, 271);

  const delta = await waitFor(client, 'delta');
  assert.ok(delta.type === 'delta' && delta.vessels.some((v) => v.mmsi === 244660000));

  const searchPromise = waitFor(client, 'searchResults');
  client.send(JSON.stringify({ type: 'search', query: 'test' }));
  const results = await searchPromise;
  assert.ok(results.type === 'searchResults' && results.vessels.length === 1);

  // A viewport elsewhere must not receive the vessel.
  const emptyPromise = waitFor(client, 'snapshot');
  client.send(JSON.stringify({ type: 'viewport', bbox: [100, 0, 110, 10] }));
  const empty = await emptyPromise;
  assert.ok(empty.type === 'snapshot' && empty.vessels.length === 0);

  // Upstream subscription is exactly what aisstream expects.
  assert.equal(subscriptions[0]?.APIKey, 'test-key-0123456789abcdef');
  assert.deepEqual(subscriptions[0]?.BoundingBoxes, [[[-90, -180], [90, 180]]]);
  assert.ok(Array.isArray(subscriptions[0]?.FilterMessageTypes));

  // Malformed client input is ignored, not fatal.
  client.send('not json');
  client.send(JSON.stringify({ type: 'viewport', bbox: ['a'] }));
  const health = (await fetch(`http://127.0.0.1:${relayPort}/health`).then((r) => r.json())) as {
    upstream: string;
    totalVessels: number;
  };
  assert.equal(health.upstream, 'connected');
  assert.ok(health.totalVessels >= 1);

  client.close();
  fake.close();
});

test('relay reports an aisstream API key error', async () => {
  const fake = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await once(fake, 'listening');
  fake.on('connection', (socket) => {
    socket.once('message', () => {
      socket.send(JSON.stringify({ error: 'Api Key Is Not Valid' }));
      socket.close();
    });
  });
  const relayPort = await startRelay((fake.address() as AddressInfo).port);
  const deadline = Date.now() + 8_000;
  let health: { upstream?: string; upstreamError?: string } = {};
  while (Date.now() < deadline) {
    health = (await fetch(`http://127.0.0.1:${relayPort}/health`).then((r) => r.json())) as typeof health;
    if (health.upstream === 'error') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(health.upstream, 'error');
  assert.match(health.upstreamError ?? '', /Api Key Is Not Valid/);
  fake.close();
});
