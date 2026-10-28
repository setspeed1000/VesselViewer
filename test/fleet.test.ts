import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ROYAL_CARIBBEAN_CLASSES, royalCaribbeanClassOf, SHIP_CLASS_IDS } from '../shared/fleet.js';

const ship = (name: string, extra: { mmsi?: number; shipType?: number; dimA?: number; dimB?: number } = {}) => ({
  mmsi: 311000001,
  name,
  ...extra,
});

test('fleet has 30 ships, each in exactly one class', () => {
  const names = SHIP_CLASS_IDS.flatMap((id) => ROYAL_CARIBBEAN_CLASSES[id].ships);
  assert.equal(names.length, 30);
  assert.equal(new Set(names).size, 30);
});

test('matches every ship by its full name', () => {
  for (const id of SHIP_CLASS_IDS) {
    for (const name of ROYAL_CARIBBEAN_CLASSES[id].ships) {
      assert.equal(royalCaribbeanClassOf(ship(name.toUpperCase())), id, name);
    }
  }
});

test('matches names truncated to the 20-character AIS field', () => {
  assert.equal(royalCaribbeanClassOf(ship('INDEPENDENCE OF THE ')), 'freedom');
  assert.equal(royalCaribbeanClassOf(ship('ENCHANTMENT OF THE S')), 'vision');
  assert.equal(royalCaribbeanClassOf(ship('BRILLIANCE OF THE SE')), 'radiance');
  assert.equal(royalCaribbeanClassOf(ship('NAVIGATOR OF THE SEA')), 'voyager');
});

test('representative classes', () => {
  assert.equal(royalCaribbeanClassOf(ship('ICON OF THE SEAS')), 'icon');
  assert.equal(royalCaribbeanClassOf(ship('Legend of the Seas')), 'icon');
  assert.equal(royalCaribbeanClassOf(ship('UTOPIA OF THE SEAS')), 'oasis');
  assert.equal(royalCaribbeanClassOf(ship('ODYSSEY OF THE SEAS')), 'quantum');
  assert.equal(royalCaribbeanClassOf(ship('GRANDEUR OF THE SEAS')), 'vision');
});

test('rejects contradicting data and look-alikes', () => {
  assert.equal(royalCaribbeanClassOf(ship('OASIS OF THE SEAS', { shipType: 70 })), undefined);
  assert.equal(royalCaribbeanClassOf(ship('OASIS OF THE SEAS', { dimA: 60, dimB: 20 })), undefined);
  assert.equal(royalCaribbeanClassOf(ship('OASIS OF THE SEAS', { shipType: 60, dimA: 300, dimB: 62 })), 'oasis');
  assert.equal(royalCaribbeanClassOf(ship('ENCHANTMENT OF THE SEAS', { dimA: 250, dimB: 51 })), 'vision');
  assert.equal(royalCaribbeanClassOf(ship('STAR OF THE SEA')), undefined);
  assert.equal(royalCaribbeanClassOf(ship('OASIS')), undefined);
  assert.equal(royalCaribbeanClassOf({ mmsi: 1, name: undefined }), undefined);
});

test('SIM prefix only counts for simulated MMSIs', () => {
  assert.equal(royalCaribbeanClassOf(ship('SIM OASIS OF THE SEAS', { mmsi: 999_999_001 })), 'oasis');
  assert.equal(royalCaribbeanClassOf(ship('SIM OASIS OF THE SEAS', { mmsi: 311_000_001 })), undefined);
});
