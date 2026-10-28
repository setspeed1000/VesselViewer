/**
 * Geometry builder for detailed procedural ship models.
 *
 * Units are metres. Axes: +X starboard, +Y forward (bow), +Z up; the origin
 * is amidships on the centreline at the waterline. Output is a non-indexed
 * triangle list with per-vertex normals and colours, the format deck.gl's
 * SimpleMeshLayer consumes (and trivially exportable to glTF).
 */

export type V3 = [number, number, number];
export type RGB = readonly [number, number, number];
type Affine = [number, number, number, number, number, number, number, number, number, number, number, number];

export interface ColorMesh {
  attributes: {
    positions: { value: Float32Array; size: 3 };
    normals: { value: Float32Array; size: 3 };
    colors: { value: Float32Array; size: 3 };
  };
}

export interface MeshStats {
  triangles: number;
  min: V3;
  max: V3;
}

const IDENTITY: Affine = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
const DEG = Math.PI / 180;

function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(v: V3): V3 | undefined {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len > 1e-9 ? [v[0] / len, v[1] / len, v[2] / len] : undefined;
}

/** Column-major 3x3 rotation followed by translation: p' = R p + t. */
function compose(outer: Affine, inner: Affine): Affine {
  const r = (m: Affine, row: number, col: number) => m[col * 3 + row]!;
  const out = new Array(12).fill(0) as Affine;
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += r(outer, row, k) * r(inner, k, col);
      out[col * 3 + row] = s;
    }
  }
  for (let row = 0; row < 3; row++) {
    let s = outer[9 + row]!;
    for (let k = 0; k < 3; k++) s += r(outer, row, k) * inner[9 + k]!;
    out[9 + row] = s;
  }
  return out;
}

/** Apply a chain of transforms (outermost first) to a point. */
export function transformPoint(transforms: Affine[], p: V3): V3 {
  let m = IDENTITY;
  for (const t of transforms) m = compose(m, t);
  return [
    m[0] * p[0] + m[3] * p[1] + m[6] * p[2] + m[9],
    m[1] * p[0] + m[4] * p[1] + m[7] * p[2] + m[10],
    m[2] * p[0] + m[5] * p[1] + m[8] * p[2] + m[11],
  ];
}

export function translation(x: number, y: number, z: number): Affine {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1, x, y, z];
}

export function rotationX(deg: number): Affine {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [1, 0, 0, 0, c, s, 0, -s, c, 0, 0, 0];
}

export function rotationY(deg: number): Affine {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [c, 0, -s, 0, 1, 0, s, 0, c, 0, 0, 0];
}

export function rotationZ(deg: number): Affine {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [c, s, 0, -s, c, 0, 0, 0, 1, 0, 0, 0];
}

export class ModelBuilder {
  private readonly pos: number[] = [];
  private readonly nrm: number[] = [];
  private readonly col: number[] = [];
  private matrix: Affine = IDENTITY;

  /** Run `fn` with additional transforms applied (outermost first). */
  with(transforms: Affine[], fn: () => void): void {
    const saved = this.matrix;
    for (const t of transforms) this.matrix = compose(this.matrix, t);
    try {
      fn();
    } finally {
      this.matrix = saved;
    }
  }

  private emit(p: V3, n: V3, c: RGB): void {
    const m = this.matrix;
    this.pos.push(
      m[0] * p[0] + m[3] * p[1] + m[6] * p[2] + m[9],
      m[1] * p[0] + m[4] * p[1] + m[7] * p[2] + m[10],
      m[2] * p[0] + m[5] * p[1] + m[8] * p[2] + m[11],
    );
    this.nrm.push(
      m[0] * n[0] + m[3] * n[1] + m[6] * n[2],
      m[1] * n[0] + m[4] * n[1] + m[7] * n[2],
      m[2] * n[0] + m[5] * n[1] + m[8] * n[2],
    );
    this.col.push(c[0], c[1], c[2]);
  }

  /** Flat-shaded triangle, counter-clockwise when seen from outside. Degenerate triangles are skipped. */
  tri(a: V3, b: V3, c: V3, color: RGB): void {
    const n = normalize(cross(sub(b, a), sub(c, a)));
    if (!n) return;
    this.emit(a, n, color);
    this.emit(b, n, color);
    this.emit(c, n, color);
  }

  /** Smooth-shaded triangle with explicit vertex normals (falls back to flat). */
  triSmooth(a: V3, b: V3, c: V3, na: V3 | undefined, nb: V3 | undefined, nc: V3 | undefined, color: RGB): void {
    const flat = normalize(cross(sub(b, a), sub(c, a)));
    if (!flat) return;
    this.emit(a, na ?? flat, color);
    this.emit(b, nb ?? flat, color);
    this.emit(c, nc ?? flat, color);
  }

  /** Triangle wound so its normal points away from `centre` (for convex solids). */
  triAway(a: V3, b: V3, c: V3, color: RGB, centre: V3): void {
    const n = cross(sub(b, a), sub(c, a));
    const m: V3 = [(a[0] + b[0] + c[0]) / 3 - centre[0], (a[1] + b[1] + c[1]) / 3 - centre[1], (a[2] + b[2] + c[2]) / 3 - centre[2]];
    if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0) this.tri(a, c, b, color);
    else this.tri(a, b, c, color);
  }

  quad(a: V3, b: V3, c: V3, d: V3, color: RGB): void {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }

  /** Axis-aligned box; bottom face omitted unless requested. */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, side: RGB, top: RGB = side, bottom?: RGB): void {
    this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], side);
    this.quad([x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], side);
    this.quad([x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], side);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], side);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], top);
    if (bottom) this.quad([x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0], bottom);
  }

  /** Flat top/bottom cap of a star-shaped outline (fan from the centroid). */
  cap(outline: [number, number][], z: number, color: RGB, up = true): void {
    let cx = 0;
    let cy = 0;
    for (const [x, y] of outline) {
      cx += x;
      cy += y;
    }
    cx /= outline.length;
    cy /= outline.length;
    for (let i = 0; i < outline.length; i++) {
      const [ax, ay] = outline[i]!;
      const [bx, by] = outline[(i + 1) % outline.length]!;
      if (up) this.tri([cx, cy, z], [ax, ay, z], [bx, by, z], color);
      else this.tri([cx, cy, z], [bx, by, z], [ax, ay, z], color);
    }
  }

  /** Extrude a counter-clockwise outline (seen from above) between z0 and z1. */
  prism(outline: [number, number][], z0: number, z1: number, side: RGB, top: RGB = side): void {
    for (let i = 0; i < outline.length; i++) {
      const [ax, ay] = outline[i]!;
      const [bx, by] = outline[(i + 1) % outline.length]!;
      this.quad([ax, ay, z0], [bx, by, z0], [bx, by, z1], [ax, ay, z1], side);
    }
    this.cap(outline, z1, top);
  }

  /**
   * Smooth vertical frustum with an elliptical cross-section.
   * r0/r1 scale the base/top radii (1 = rx, ry).
   */
  cylinder(
    cx: number,
    cy: number,
    z0: number,
    z1: number,
    rx: number,
    ry: number,
    segments: number,
    side: RGB,
    top: RGB | null = side,
    topScale = 1,
  ): void {
    const ring = (z: number, s: number) =>
      Array.from({ length: segments }, (_, i) => {
        const a = (i / segments) * Math.PI * 2;
        return [cx + Math.cos(a) * rx * s, cy + Math.sin(a) * ry * s, z] as V3;
      });
    const bottom = ring(z0, 1);
    const upper = ring(z1, topScale);
    const slope = (rx * (1 - topScale)) / Math.max(1e-6, z1 - z0);
    const normalAt = (i: number): V3 => {
      const a = (i / segments) * Math.PI * 2;
      return normalize([Math.cos(a) / rx, Math.sin(a) / ry, slope / Math.max(rx, ry)])!;
    };
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      const ni = normalAt(i);
      const nj = normalAt(j);
      this.triSmooth(bottom[i]!, bottom[j]!, upper[j]!, ni, nj, nj, side);
      this.triSmooth(bottom[i]!, upper[j]!, upper[i]!, ni, nj, ni, side);
    }
    if (top && topScale > 0) {
      for (let i = 0; i < segments; i++) {
        this.tri([cx, cy, z1], upper[i]!, upper[(i + 1) % segments]!, top);
      }
    }
  }

  /** Upper half of a superellipsoid, flat-shaded so it reads as glazed panels. */
  dome(
    cx: number,
    cy: number,
    z0: number,
    rx: number,
    ry: number,
    rz: number,
    lonSegments: number,
    latSegments: number,
    colorAt: (lon: number, lat: number) => RGB,
    exponent = 1,
  ): void {
    const point = (lon: number, lat: number): V3 => {
      const theta = (lon / lonSegments) * Math.PI * 2;
      const phi = (lat / latSegments) * (Math.PI / 2);
      const c = Math.cos(phi) ** exponent;
      return [cx + rx * c * Math.cos(theta), cy + ry * c * Math.sin(theta), z0 + rz * Math.sin(phi)];
    };
    for (let lat = 0; lat < latSegments; lat++) {
      for (let lon = 0; lon < lonSegments; lon++) {
        const color = colorAt(lon, lat);
        const a = point(lon, lat);
        const b = point(lon + 1, lat);
        const c = point(lon + 1, lat + 1);
        const d = point(lon, lat + 1);
        this.tri(a, b, c, color);
        if (lat < latSegments - 1) this.tri(a, c, d, color);
      }
    }
  }

  /** Circular tube swept along a polyline, smooth-shaded. */
  tube(path: V3[], radius: number, segments: number, color: RGB): void {
    if (path.length < 2) return;
    // Parallel-transport frames avoid twisting along the path.
    const tangents = path.map((_, i): V3 => {
      const a = path[Math.max(0, i - 1)]!;
      const b = path[Math.min(path.length - 1, i + 1)]!;
      return normalize(sub(b, a)) ?? [0, 0, 1];
    });
    let normal = normalize(cross(tangents[0]!, [0, 0, 1])) ?? normalize(cross(tangents[0]!, [1, 0, 0]))!;
    const rings: { p: V3; n: V3 }[][] = [];
    for (let i = 0; i < path.length; i++) {
      const t = tangents[i]!;
      // Re-orthogonalise the carried normal against the new tangent.
      const d = normal[0] * t[0] + normal[1] * t[1] + normal[2] * t[2];
      normal = normalize([normal[0] - d * t[0], normal[1] - d * t[1], normal[2] - d * t[2]]) ?? normal;
      const binormal = cross(t, normal);
      const ring: { p: V3; n: V3 }[] = [];
      for (let s = 0; s < segments; s++) {
        const a = (s / segments) * Math.PI * 2;
        const n: V3 = [
          normal[0] * Math.cos(a) + binormal[0] * Math.sin(a),
          normal[1] * Math.cos(a) + binormal[1] * Math.sin(a),
          normal[2] * Math.cos(a) + binormal[2] * Math.sin(a),
        ];
        const c = path[i]!;
        ring.push({ p: [c[0] + n[0] * radius, c[1] + n[1] * radius, c[2] + n[2] * radius], n });
      }
      rings.push(ring);
    }
    for (let i = 0; i < rings.length - 1; i++) {
      for (let s = 0; s < segments; s++) {
        const a = rings[i]![s]!;
        const b = rings[i]![(s + 1) % segments]!;
        const c = rings[i + 1]![(s + 1) % segments]!;
        const d = rings[i + 1]![s]!;
        this.triSmooth(a.p, b.p, c.p, a.n, b.n, c.n, color);
        this.triSmooth(a.p, c.p, d.p, a.n, c.n, d.n, color);
      }
    }
  }

  get triangleCount(): number {
    return this.pos.length / 9;
  }

  stats(): MeshStats {
    const min: V3 = [Infinity, Infinity, Infinity];
    const max: V3 = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < this.pos.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = this.pos[i + k]!;
        if (v < min[k]!) min[k] = v;
        if (v > max[k]!) max[k] = v;
      }
    }
    return { triangles: this.triangleCount, min, max };
  }

  build(): ColorMesh {
    return {
      attributes: {
        positions: { value: new Float32Array(this.pos), size: 3 },
        normals: { value: new Float32Array(this.nrm), size: 3 },
        colors: { value: new Float32Array(this.col), size: 3 },
      },
    };
  }
}
