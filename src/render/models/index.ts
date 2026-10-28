/** Registry of detailed fleet models, built on first use and cached. */
import { FLEET_CLASSES, type FleetMatch } from '../../../shared/fleet.js';
import { ModelBuilder, type ColorMesh, type MeshStats } from './builder.js';
import { CARNIVAL_BUILDERS } from './carnival.js';
import { NCL_BUILDERS } from './norwegian.js';
import { RCI_BUILDERS, type ModelBuildFn } from './royalCaribbean.js';

export interface ShipModel {
  mesh: ColorMesh;
  /** Model length in metres; instances are scaled by reported length / this. */
  lengthM: number;
  stats: MeshStats;
}

const BUILDERS: Record<string, ModelBuildFn> = { ...RCI_BUILDERS, ...CARNIVAL_BUILDERS, ...NCL_BUILDERS };

// Every fleet class must have a model.
for (const id of Object.keys(FLEET_CLASSES)) {
  if (!BUILDERS[id]) throw new Error(`No model builder for fleet class ${id}`);
}

const cache = new Map<string, ShipModel>();

/** Cache key / layer id suffix for a fleet match. */
export function modelKey(match: FleetMatch): string {
  return match.variant ? `${match.classId}~${match.variant}` : match.classId;
}

export function getShipModel(match: FleetMatch): ShipModel {
  const key = modelKey(match);
  let model = cache.get(key);
  if (!model) {
    const b = new ModelBuilder();
    const lengthM = BUILDERS[match.classId]!(b, match.variant);
    model = { mesh: b.build(), lengthM, stats: b.stats() };
    cache.set(key, model);
  }
  return model;
}
