import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ROYAL_CARIBBEAN_CLASSES, SHIP_CLASS_IDS } from '../shared/fleet.js';
import { getShipModel } from '../src/render/models/royalCaribbean.js';

for (const id of SHIP_CLASS_IDS) {
  test(`${id} model is valid, detailed and true to scale`, () => {
    const info = ROYAL_CARIBBEAN_CLASSES[id];
    const { mesh, lengthM, stats } = getShipModel(id);
    const { positions, normals, colors } = mesh.attributes;
    const vertices = positions.value.length / 3;
    assert.equal(vertices % 3, 0, 'whole triangles');
    assert.equal(normals.value.length, positions.value.length);
    assert.equal(colors.value.length, positions.value.length);
    assert.ok(stats.triangles >= 15_000, `${stats.triangles} triangles`);
    for (const v of positions.value) assert.ok(Number.isFinite(v));
    for (let i = 0; i < normals.value.length; i += 3) {
      const len = Math.hypot(normals.value[i]!, normals.value[i + 1]!, normals.value[i + 2]!);
      assert.ok(Math.abs(len - 1) < 1e-3, `normal ${i / 3} has length ${len}`);
    }
    for (const c of colors.value) assert.ok(c >= 0 && c <= 1);

    assert.equal(lengthM, info.lengthM);
    const length = stats.max[1] - stats.min[1];
    assert.ok(Math.abs(length - info.lengthM) / info.lengthM < 0.01, `length ${length}`);
    // Nothing below the waterline, nothing implausibly wide or tall.
    assert.ok(stats.min[2] >= -1e-6, `min z ${stats.min[2]}`);
    const width = stats.max[0] - stats.min[0];
    assert.ok(width >= info.beamM && width < info.beamM * 1.8, `width ${width}`);
    assert.ok(stats.max[2] > 30 && stats.max[2] < 100, `height ${stats.max[2]}`);
  });
}
