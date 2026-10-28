/**
 * Procedural low-poly ship meshes for deck.gl's SimpleMeshLayer.
 *
 * Model space: unit size, bow toward +Y, starboard toward +X, up +Z.
 *   x ∈ [-0.5, 0.5] (beam), y ∈ [-0.5, 0.5] (length), z ∈ [0, 1] (hull height).
 * Each instance is scaled to the vessel's real beam/length in metres, so a
 * detailed glTF model can later replace these by keeping the same convention
 * (see README, "3D models").
 */
import type { VesselCategory } from '../../shared/vessel.js';

export interface MeshData {
  attributes: {
    positions: { value: Float32Array; size: 3 };
    normals: { value: Float32Array; size: 3 };
  };
}

type V3 = [number, number, number];

class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];

  triangle(a: V3, b: V3, c: V3): void {
    const u: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    for (const p of [a, b, c]) {
      this.positions.push(...p);
      this.normals.push(n[0] / len, n[1] / len, n[2] / len);
    }
  }

  /** Quad with vertices in counter-clockwise order seen from outside. */
  quad(a: V3, b: V3, c: V3, d: V3): void {
    this.triangle(a, b, c);
    this.triangle(a, c, d);
  }

  /** Extrude a convex counter-clockwise outline (seen from above) between z0 and z1. */
  prism(outline: [number, number][], z0: number, z1: number): void {
    const n = outline.length;
    for (let i = 0; i < n; i++) {
      const [x0, y0] = outline[i]!;
      const [x1, y1] = outline[(i + 1) % n]!;
      this.quad([x0, y0, z0], [x1, y1, z0], [x1, y1, z1], [x0, y0, z1]);
    }
    // Top face as a fan from the first vertex (valid for convex outlines).
    const [fx, fy] = outline[0]!;
    for (let i = 1; i < n - 1; i++) {
      const [ax, ay] = outline[i]!;
      const [bx, by] = outline[i + 1]!;
      this.triangle([fx, fy, z1], [ax, ay, z1], [bx, by, z1]);
    }
  }

  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): void {
    this.prism(
      [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ],
      z0,
      z1,
    );
  }

  build(): MeshData {
    return {
      attributes: {
        positions: { value: new Float32Array(this.positions), size: 3 },
        normals: { value: new Float32Array(this.normals), size: 3 },
      },
    };
  }
}

/** Hull outline seen from above, counter-clockwise, pointed bow at +Y. */
const HULL_OUTLINE: [number, number][] = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0.5, 0.22],
  [0.3, 0.42],
  [0, 0.5],
  [-0.3, 0.42],
  [-0.5, 0.22],
];

export function buildHullMesh(): MeshData {
  const m = new MeshBuilder();
  m.prism(HULL_OUTLINE, 0, 1);
  return m.build();
}

/** Superstructure layout per category: [y0, y1] along the hull and height above deck. */
interface Superstructure {
  y: [number, number];
  width: number;
  height: number;
  /** Optional second, lower block (e.g. cargo hatches, passenger decks). */
  extra?: { y: [number, number]; width: number; height: number };
}

const SUPERSTRUCTURE: Record<VesselCategory, Superstructure> = {
  cargo: { y: [-0.46, -0.3], width: 0.9, height: 2.6, extra: { y: [-0.28, 0.3], width: 0.8, height: 0.5 } },
  tanker: { y: [-0.46, -0.32], width: 0.9, height: 2.4 },
  passenger: { y: [-0.42, 0.28], width: 0.86, height: 2.2, extra: { y: [-0.3, 0.18], width: 0.7, height: 3.2 } },
  fishing: { y: [-0.05, 0.25], width: 0.7, height: 1.6 },
  tug: { y: [-0.1, 0.25], width: 0.7, height: 1.8 },
  pleasure: { y: [-0.25, 0.15], width: 0.6, height: 0.9 },
  highspeed: { y: [-0.3, 0.2], width: 0.85, height: 1.2 },
  government: { y: [-0.2, 0.15], width: 0.6, height: 2.2 },
  other: { y: [-0.45, -0.2], width: 0.85, height: 1.8 },
  unknown: { y: [-0.45, -0.2], width: 0.85, height: 1.8 },
};

export function buildSuperstructureMesh(category: VesselCategory): MeshData {
  const s = SUPERSTRUCTURE[category];
  const m = new MeshBuilder();
  m.box(-s.width / 2, s.width / 2, s.y[0], s.y[1], 1, 1 + s.height);
  if (s.extra) {
    const e = s.extra;
    m.box(-e.width / 2, e.width / 2, e.y[0], e.y[1], 1, 1 + e.height);
  }
  return m.build();
}

/** Hull height (deck above waterline) as a fraction of length, clamped in metres. */
export function hullHeightM(lengthM: number): number {
  return Math.max(1, Math.min(14, lengthM * 0.05));
}
