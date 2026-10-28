import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PositionUpdate, StaticUpdate } from '../shared/aisstream.js';
import { bboxContains, deadReckon, distanceM, normalizeBBox, padBBox } from '../shared/geo.js';
import { AisSimulator } from '../shared/simulator.js';
import { parseAisStreamMessage } from '../shared/aisstream.js';
import { VesselStore } from '../shared/store.js';
import { categoryOf, shipTypeLabel } from '../shared/vessel.js';

const T0 = Date.parse('2026-10-28T12:00:00Z');

const pos = (mmsi: number, t: number, lon: number, lat: number, extra: Partial<PositionUpdate> = {}): PositionUpdate => ({
  kind: 'position',
  mmsi,
  aisClass: 'A',
  time: t,
  lon,
  lat,
  ...extra,
});

test('static data received before the first position is merged in', () => {
  const store = new VesselStore({ ttlMs: 3_600_000 });
  const s: StaticUpdate = { kind: 'static', mmsi: 1, aisClass: 'A', time: T0, name: 'ALPHA', shipType: 70 };
  assert.equal(store.apply(s, T0), false);
  assert.equal(store.size, 0);
  assert.equal(store.apply(pos(1, T0 + 1000, 1, 50), T0 + 1000), true);
  assert.equal(store.get(1)?.name, 'ALPHA');
  assert.equal(store.get(1)?.shipType, 70);
});

test('older positions never overwrite newer ones', () => {
  const store = new VesselStore({ ttlMs: 3_600_000 });
  store.apply(pos(1, T0 + 5000, 2, 50), T0);
  assert.equal(store.apply(pos(1, T0, 1, 50), T0), false);
  assert.equal(store.get(1)?.lon, 2);
});

test('dynamic fields missing from a new report are cleared', () => {
  const store = new VesselStore({ ttlMs: 3_600_000 });
  store.apply(pos(1, T0, 1, 50, { sog: 10, heading: 90 }), T0);
  store.apply(pos(1, T0 + 10_000, 1.001, 50, { sog: 9 }), T0);
  assert.equal(store.get(1)?.heading, undefined);
  assert.equal(store.get(1)?.sog, 9);
});

test('metadata name is a fallback only', () => {
  const store = new VesselStore({ ttlMs: 3_600_000 });
  store.apply(pos(1, T0, 1, 50, { metaName: 'META' }), T0);
  assert.equal(store.get(1)?.name, 'META');
  store.apply({ kind: 'static', mmsi: 1, aisClass: 'A', time: T0, name: 'REAL' }, T0);
  store.apply(pos(1, T0 + 10_000, 1.01, 50, { metaName: 'META' }), T0);
  assert.equal(store.get(1)?.name, 'REAL');
});

test('prune removes stale vessels and reports changes', () => {
  const store = new VesselStore({ ttlMs: 60_000 });
  store.apply(pos(1, T0, 1, 50), T0);
  store.apply(pos(2, T0 + 50_000, 1, 50), T0);
  store.takeChanges();
  assert.deepEqual(store.prune(T0 + 70_000), [1]);
  assert.deepEqual(store.takeChanges(), { updated: [], removed: [1] });
  assert.equal(store.size, 1);
});

test('tracks thin out stationary updates', () => {
  const store = new VesselStore({ ttlMs: 3_600_000 });
  for (let i = 0; i < 10; i++) store.apply(pos(1, T0 + i * 120_000, 1, 50), T0);
  assert.ok(store.track(1).length <= 2, `got ${store.track(1).length} points`);
  for (let i = 0; i < 10; i++) store.apply(pos(2, T0 + i * 10_000, 1 + i * 0.01, 50), T0);
  assert.equal(store.track(2).length, 10);
});

test('search ranks prefix matches and supports MMSI', () => {
  const store = new VesselStore({ ttlMs: 3_600_000 });
  store.apply(pos(111111111, T0, 1, 50, { metaName: 'NORTH STAR' }), T0);
  store.apply(pos(222222222, T0, 1, 50, { metaName: 'STAR OF THE SEA' }), T0);
  assert.deepEqual(store.search('star').map((v) => v.mmsi), [222222222, 111111111]);
  assert.deepEqual(store.search('1111').map((v) => v.mmsi), [111111111]);
  assert.deepEqual(store.search('x'), []);
});

test('bbox helpers handle the antimeridian', () => {
  const box = normalizeBBox([170, -10, 190, 10]);
  assert.deepEqual(box, [170, -10, -170, 10]);
  assert.ok(bboxContains(box, 179, 0));
  assert.ok(bboxContains(box, -175, 0));
  assert.ok(!bboxContains(box, 0, 0));
  assert.deepEqual(normalizeBBox([-400, -95, 400, 95]), [-180, -90, 180, 90]);
  assert.deepEqual(normalizeBBox([100, 0, 180, 10]), [100, 0, 180, 10]);
  assert.deepEqual(padBBox([-180, -10, 180, 10], 0.25), [-180, -15, 180, 15]);
});

test('dead reckoning moves along course at speed, capped in time', () => {
  const v = { lon: 0, lat: 0, sog: 10, cog: 90, positionTime: T0 };
  const [lon, lat] = deadReckon(v, T0 + 60_000);
  assert.ok(Math.abs(distanceM(0, 0, lon, lat) - 308.67) < 0.5);
  assert.ok(Math.abs(lat) < 1e-9 && lon > 0);
  const capped = deadReckon(v, T0 + 3_600_000);
  const atCap = deadReckon(v, T0 + 180_000);
  assert.deepEqual(capped, atCap);
  assert.deepEqual(deadReckon({ ...v, sog: 0.1 }, T0 + 60_000), [0, 0]);
});

test('ship type categories', () => {
  assert.equal(categoryOf(70), 'cargo');
  assert.equal(categoryOf(84), 'tanker');
  assert.equal(categoryOf(52), 'tug');
  assert.equal(categoryOf(37), 'pleasure');
  assert.equal(categoryOf(undefined), 'unknown');
  assert.equal(shipTypeLabel(71), 'Cargo (hazardous A)');
  assert.equal(shipTypeLabel(52), 'Tug');
});

test('simulator output parses into valid vessels', () => {
  const sim = new AisSimulator({ vesselCount: 50, seed: 7 });
  const store = new VesselStore({ ttlMs: 3_600_000 });
  let messages = 0;
  sim.tick((raw) => {
    messages++;
    for (const u of parseAisStreamMessage(raw, T0)) store.apply(u, T0);
  }, T0);
  assert.ok(messages >= 100, `expected position + static per ship, got ${messages}`);
  assert.equal(store.size, 50);
  for (const v of store.values()) {
    assert.ok(v.name?.startsWith('SIM '), 'simulated vessels are clearly labelled');
    assert.ok(v.mmsi >= 999_990_000);
    assert.ok(v.dimA !== undefined && v.dimB !== undefined);
  }
});
