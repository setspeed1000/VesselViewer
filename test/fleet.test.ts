import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FLEET_CLASSES, fleetClassOf, fleetLabel, fleetShips, SHIP_CLASS_IDS, type CruiseLine } from '../shared/fleet.js';

const ship = (name: string, extra: { mmsi?: number; shipType?: number; dimA?: number; dimB?: number } = {}) => ({
  mmsi: 311000001,
  name,
  ...extra,
});

/** Reported dimensions matching a class length. */
const dims = (length: number) => ({ dimA: Math.round(length * 0.8), dimB: length - Math.round(length * 0.8) });

test('fleet sizes per line (October 2026)', () => {
  const count = (line: CruiseLine) =>
    SHIP_CLASS_IDS.filter((id) => FLEET_CLASSES[id].line === line).reduce((n, id) => n + fleetShips(id).length, 0);
  assert.equal(count('Royal Caribbean'), 30);
  assert.equal(count('Carnival'), 29);
  assert.equal(count('Norwegian'), 20);
  const names = SHIP_CLASS_IDS.flatMap((id) => fleetShips(id).map((s) => s.name));
  assert.equal(new Set(names).size, names.length, 'every ship in exactly one class');
});

test('matches every ship by its full name', () => {
  for (const id of SHIP_CLASS_IDS) {
    for (const s of fleetShips(id)) {
      const match = fleetClassOf(ship(s.name.toUpperCase(), dims(Math.round(FLEET_CLASSES[id].lengthM))));
      assert.equal(match?.classId, id, s.name);
      assert.equal(match?.variant, s.variant, s.name);
    }
  }
});

test('matches names truncated to the 20-character AIS field', () => {
  assert.equal(fleetClassOf(ship('INDEPENDENCE OF THE '))?.classId, 'rci-freedom');
  assert.equal(fleetClassOf(ship('ENCHANTMENT OF THE S'))?.classId, 'rci-vision');
  assert.equal(fleetClassOf(ship('BRILLIANCE OF THE SE'))?.classId, 'rci-radiance');
  assert.equal(fleetClassOf(ship('NAVIGATOR OF THE SEA'))?.classId, 'rci-voyager');
  assert.equal(fleetClassOf(ship('CARNIVAL CELEBRATION'))?.classId, 'ccl-excel');
});

test('representative classes', () => {
  assert.equal(fleetClassOf(ship('ICON OF THE SEAS'))?.classId, 'rci-icon');
  assert.equal(fleetClassOf(ship('Legend of the Seas'))?.classId, 'rci-icon');
  assert.equal(fleetClassOf(ship('CARNIVAL VISTA'))?.classId, 'ccl-vista');
  assert.equal(fleetClassOf(ship('CARNIVAL FIRENZE'))?.classId, 'ccl-venice');
  assert.equal(fleetClassOf(ship('CARNIVAL LUMINOSA'))?.classId, 'ccl-spirit');
  assert.equal(fleetClassOf(ship('CARNIVAL ADVENTURE'))?.classId, 'ccl-grand');
  assert.equal(fleetClassOf(ship('CARNIVAL SUNRISE'))?.classId, 'ccl-sunshine');
  assert.equal(fleetClassOf(ship('NORWEGIAN LUNA'))?.classId, 'ncl-prima-plus');
  assert.equal(fleetClassOf(ship('NORWEGIAN SPIRIT'))?.classId, 'ncl-leo');
  assert.deepEqual(fleetClassOf(ship('NORWEGIAN ESCAPE')), { classId: 'ncl-breakaway-plus', variant: 'no-track' });
  assert.deepEqual(fleetClassOf(ship('NORWEGIAN BLISS')), { classId: 'ncl-breakaway-plus' });
  assert.equal(fleetLabel({ classId: 'ccl-dream' }), 'Carnival · Dream class');
});

test('ships that left the fleets are not matched', () => {
  assert.equal(fleetClassOf(ship('NORWEGIAN SKY')), undefined); // to Cordelia Cruises, Aug 2026
  assert.equal(fleetClassOf(ship('CARNIVAL ECSTASY')), undefined); // retired 2022
  assert.equal(fleetClassOf(ship('MAJESTY OF THE SEAS')), undefined);
});

test('non-distinctive names need matching dimensions', () => {
  assert.equal(fleetClassOf(ship('MARDI GRAS')), undefined);
  assert.equal(fleetClassOf(ship('MARDI GRAS', { dimA: 20, dimB: 5 })), undefined);
  assert.equal(fleetClassOf(ship('MARDI GRAS', dims(344)))?.classId, 'ccl-excel');
  assert.equal(fleetClassOf(ship('PRIDE OF AMERICA')), undefined);
  assert.equal(fleetClassOf(ship('PRIDE OF AMERICA', dims(281)))?.classId, 'ncl-america');
});

test('rejects contradicting data and look-alikes', () => {
  assert.equal(fleetClassOf(ship('OASIS OF THE SEAS', { shipType: 70 })), undefined);
  assert.equal(fleetClassOf(ship('OASIS OF THE SEAS', { dimA: 60, dimB: 20 })), undefined);
  assert.equal(fleetClassOf(ship('OASIS OF THE SEAS', { shipType: 60, dimA: 300, dimB: 62 }))?.classId, 'rci-oasis');
  assert.equal(fleetClassOf(ship('ENCHANTMENT OF THE SEAS', { dimA: 250, dimB: 51 }))?.classId, 'rci-vision');
  assert.equal(fleetClassOf(ship('STAR OF THE SEA')), undefined);
  assert.equal(fleetClassOf(ship('CARNIVAL')), undefined);
  assert.equal(fleetClassOf({ mmsi: 1, name: undefined }), undefined);
});

test('SIM prefix only counts for simulated MMSIs', () => {
  assert.equal(fleetClassOf(ship('SIM OASIS OF THE SEAS', { mmsi: 999_999_001 }))?.classId, 'rci-oasis');
  assert.equal(fleetClassOf(ship('SIM OASIS OF THE SEAS', { mmsi: 311_000_001 })), undefined);
});
