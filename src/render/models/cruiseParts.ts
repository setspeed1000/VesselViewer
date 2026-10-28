/**
 * Reusable cruise-ship parts: a lofted hull, balconied superstructure blocks,
 * lifeboats, funnels, pools, slides and deck furniture.
 */
import { ModelBuilder, rotationY, translation, type RGB, type V3 } from './builder.js';

export const DECK_HEIGHT = 2.95;

export const PALETTE = {
  white: [0.95, 0.96, 0.96],
  offWhite: [0.86, 0.87, 0.88],
  deck: [0.84, 0.86, 0.87],
  roof: [0.9, 0.91, 0.92],
  teak: [0.6, 0.46, 0.32],
  navy: [0.06, 0.11, 0.26],
  windowDark: [0.12, 0.17, 0.24],
  balconyRecess: [0.16, 0.22, 0.3],
  railGlass: [0.5, 0.63, 0.7],
  glass: [0.3, 0.46, 0.57],
  glassLight: [0.58, 0.73, 0.8],
  pool: [0.2, 0.68, 0.86],
  poolEdge: [0.88, 0.9, 0.9],
  lifeboat: [0.96, 0.45, 0.09],
  lifeboatTop: [0.98, 0.6, 0.2],
  funnelCap: [0.1, 0.1, 0.11],
  logoBlue: [0.05, 0.19, 0.52],
  logoGold: [0.86, 0.67, 0.18],
  tree: [0.19, 0.46, 0.21],
  grass: [0.33, 0.55, 0.28],
  slideOrange: [0.97, 0.42, 0.1],
  slideBlue: [0.12, 0.5, 0.95],
  slideYellow: [0.98, 0.8, 0.1],
  slidePurple: [0.55, 0.22, 0.75],
  slideGreen: [0.1, 0.72, 0.42],
  slideRed: [0.88, 0.14, 0.2],
  steel: [0.55, 0.57, 0.6],
  carnivalRed: [0.84, 0.1, 0.16],
  carnivalBlue: [0.0, 0.25, 0.6],
  carnivalNavy: [0.04, 0.14, 0.36],
  nclNavy: [0.04, 0.12, 0.3],
  nclBlue: [0.0, 0.42, 0.7],
  track: [0.22, 0.23, 0.25],
  kerbRed: [0.85, 0.12, 0.12],
  green: [0.18, 0.6, 0.3],
} as const satisfies Record<string, RGB>;

const P = PALETTE;

// ---------------------------------------------------------------- hull

export interface HullSpec {
  /** Overall length, metres. */
  length: number;
  /** Moulded beam at the waterline, metres. */
  beam: number;
  /** Height of the hull (main deck) above the waterline, metres. */
  height: number;
  /** How far the stem rakes back at the waterline, metres. */
  rake: number;
  /** Optional livery or hull art: colour at (y, z) on a side (+1 starboard, -1 port); undefined keeps the default. */
  paint?: HullPaint;
}

export type HullPaint = (y: number, z: number, side: 1 | -1) => RGB | undefined;

/** Half-breadth of the hull at (y, z); y is clamped to the raked stem. */
export function hullHalfBreadth(spec: HullSpec, y: number, z: number): { x: number; y: number } {
  const L = spec.length;
  const B = spec.beam / 2;
  const zf = Math.max(0, Math.min(1, z / spec.height));
  const bowEnd = L / 2 - spec.rake * (1 - zf);
  const bowStart = L / 2 - 0.3 * L;
  const sternLen = 0.2 * L;
  const sternStart = -L / 2 + sternLen;
  if (y >= bowEnd) return { x: 0, y: bowEnd };
  let hb = B;
  if (y > bowStart) {
    const t = (y - bowStart) / (bowEnd - bowStart);
    // Fuller sections higher up give the flared bow typical of cruise ships.
    const p = 1.6 + 1.1 * zf;
    hb = B * Math.pow(Math.max(0, 1 - Math.pow(t, p)), 0.62);
  }
  if (y < sternStart) {
    const s = (sternStart - y) / sternLen;
    hb *= 1 - 0.14 * s * s * (1 - 0.6 * zf);
  }
  return { x: hb, y };
}

function hullStations(L: number): number[] {
  const ys: number[] = [];
  const parallelEnd = L / 2 - 0.3 * L;
  for (let i = 0; i <= 140; i++) ys.push(-L / 2 + (parallelEnd + L / 2) * (i / 140));
  for (let i = 1; i <= 80; i++) ys.push(parallelEnd + (L / 2 - parallelEnd) * (i / 80));
  return ys;
}

/** Hull colour by height and station: navy boot-top, rows of portholes, white plating. */
function hullRows(height: number): { z: number[]; color: (zMid: number, station: number) => RGB } {
  const z = [0, 0.8, 1.7];
  const windows: [number, number][] = [];
  for (let w = 4.2; w + 0.8 < height - 0.8; w += DECK_HEIGHT) {
    windows.push([w, w + 0.75]);
    z.push(w, w + 0.75);
  }
  z.push(height);
  z.sort((a, b) => a - b);
  return {
    z: [...new Set(z)],
    color: (m, station) =>
      m < 1.7
        ? P.navy
        : windows.some(([a, b]) => m > a && m < b) && station % 2 === 0
          ? P.windowDark
          : P.white,
  };
}

export function buildHull(b: ModelBuilder, spec: HullSpec): void {
  const ys = hullStations(spec.length);
  const rows = hullRows(spec.height);
  if (spec.paint) {
    // Finer rows so hull art has vertical resolution.
    for (let z = 2.2; z < spec.height - 0.3; z += 1) rows.z.push(z);
    rows.z.sort((a, b) => a - b);
  }
  const grid: V3[][] = ys.map((y) =>
    rows.z.map((z) => {
      const h = hullHalfBreadth(spec, y, z);
      return [h.x, h.y, z] as V3;
    }),
  );
  const normalAt = (i: number, j: number): V3 | undefined => {
    const a = grid[Math.max(0, i - 1)]![j]!;
    const c = grid[Math.min(grid.length - 1, i + 1)]![j]!;
    const d = grid[i]![Math.max(0, j - 1)]!;
    const e = grid[i]![Math.min(rows.z.length - 1, j + 1)]!;
    const u: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const v: V3 = [e[0] - d[0], e[1] - d[1], e[2] - d[2]];
    const n: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(...n);
    return len > 1e-9 ? [n[0] / len, n[1] / len, n[2] / len] : undefined;
  };
  const mirror = (p: V3): V3 => [-p[0], p[1], p[2]];
  const mirrorN = (n: V3 | undefined): V3 | undefined => (n ? [-n[0], n[1], n[2]] : undefined);

  for (let i = 0; i < grid.length - 1; i++) {
    for (let j = 0; j < rows.z.length - 1; j++) {
      const zMid = (rows.z[j]! + rows.z[j + 1]!) / 2;
      const base = rows.color(zMid, i);
      const yMid = (grid[i]![j]![1] + grid[i + 1]![j]![1]) / 2;
      const color = (zMid > 1.7 && spec.paint?.(yMid, zMid, 1)) || base;
      const portColor = (zMid > 1.7 && spec.paint?.(yMid, zMid, -1)) || base;
      const a = grid[i]![j]!;
      const bb = grid[i + 1]![j]!;
      const c = grid[i + 1]![j + 1]!;
      const d = grid[i]![j + 1]!;
      const na = normalAt(i, j);
      const nb = normalAt(i + 1, j);
      const nc = normalAt(i + 1, j + 1);
      const nd = normalAt(i, j + 1);
      // Starboard side.
      b.triSmooth(a, bb, c, na, nb, nc, color);
      b.triSmooth(a, c, d, na, nc, nd, color);
      // Port side (mirrored, reversed winding).
      b.triSmooth(mirror(a), mirror(c), mirror(bb), mirrorN(na), mirrorN(nc), mirrorN(nb), portColor);
      b.triSmooth(mirror(a), mirror(d), mirror(c), mirrorN(na), mirrorN(nd), mirrorN(nc), portColor);
    }
  }

  // Main deck.
  const top = rows.z.length - 1;
  for (let i = 0; i < grid.length - 1; i++) {
    const p = grid[i]![top]!;
    const q = grid[i + 1]![top]!;
    b.quad([-p[0], p[1], p[2]], [p[0], p[1], p[2]], [q[0], q[1], q[2]], [-q[0], q[1], q[2]], P.deck);
  }

  // Transom.
  for (let j = 0; j < rows.z.length - 1; j++) {
    const p = grid[0]![j]!;
    const q = grid[0]![j + 1]!;
    const zMid = (p[2] + q[2]) / 2;
    const color = (zMid > 1.7 && spec.paint?.(p[1], zMid, 1)) || rows.color(zMid, 1);
    b.quad([-p[0], p[1], p[2]], [p[0], p[1], p[2]], [q[0], q[1], q[2]], [-q[0], q[1], q[2]], color);
  }
}

// ---------------------------------------------------------------- superstructure

export type Facade = 'balcony' | 'window' | 'glass' | 'plain';

interface Band {
  from: number;
  to: number;
  color: RGB;
  /** Colour used where a vertical divider/mullion crosses this band. */
  divider?: RGB;
}

function facadeBands(facade: Facade): Band[] {
  const H = DECK_HEIGHT;
  switch (facade) {
    case 'balcony':
      return [
        { from: 0, to: 0.35, color: P.white },
        { from: 0.35, to: 1.2, color: P.railGlass, divider: P.white },
        { from: 1.2, to: H, color: P.balconyRecess, divider: P.white },
      ];
    case 'window':
      return [
        { from: 0, to: 0.95, color: P.white },
        { from: 0.95, to: 2.15, color: P.windowDark, divider: P.white },
        { from: 2.15, to: H, color: P.white },
      ];
    case 'glass':
      return [
        { from: 0, to: 0.25, color: P.white },
        { from: 0.25, to: H, color: P.glass, divider: P.offWhite },
      ];
    case 'plain':
      return [{ from: 0, to: H, color: P.white }];
  }
}

/**
 * A block of `decks` identical decks extruded from a counter-clockwise plan
 * outline, with facade detailing: balcony bays with dividers, window strips
 * or glazing with mullions.
 */
export function deckBlock(
  b: ModelBuilder,
  outline: [number, number][],
  z0: number,
  decks: number,
  facade: Facade,
  top: RGB = P.deck,
  railing = false,
): number {
  const bands = facadeBands(facade);
  const bay = facade === 'balcony' ? 4.2 : facade === 'window' ? 2.6 : 3.2;
  const dividerWidth = facade === 'balcony' ? 0.35 : facade === 'window' ? 0.6 : 0.18;
  for (let i = 0; i < outline.length; i++) {
    const [ax, ay] = outline[i]!;
    const [bx, by] = outline[(i + 1) % outline.length]!;
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1e-6) continue;
    // Columns along the edge: [t0, t1, isDivider] in metres.
    const columns: [number, number, boolean][] = [];
    if (len >= 12 && bands.some((band) => band.divider)) {
      const count = Math.max(1, Math.round(len / bay));
      const step = len / count;
      for (let k = 0; k < count; k++) {
        columns.push([k * step, (k + 1) * step - dividerWidth, false]);
        columns.push([(k + 1) * step - dividerWidth, (k + 1) * step, true]);
      }
    } else {
      columns.push([0, len, false]);
    }
    const at = (t: number, z: number): V3 => [ax + ((bx - ax) * t) / len, ay + ((by - ay) * t) / len, z];
    for (let d = 0; d < decks; d++) {
      const base = z0 + d * DECK_HEIGHT;
      for (const band of bands) {
        const za = base + band.from;
        const zb = base + band.to;
        if (!band.divider) {
          b.quad(at(0, za), at(len, za), at(len, zb), at(0, zb), band.color);
          continue;
        }
        for (const [t0, t1, isDivider] of columns) {
          b.quad(at(t0, za), at(t1, za), at(t1, zb), at(t0, zb), isDivider ? band.divider : band.color);
        }
      }
    }
  }
  const zTop = z0 + decks * DECK_HEIGHT;
  b.cap(outline, zTop, top);
  if (railing) windscreen(b, outline, zTop);
  return zTop;
}

/**
 * Decks stacked one at a time so each can have its own plan, giving the
 * terraced fronts and sterns of real cruise ships. Returns the top height.
 */
export function steppedBlock(
  b: ModelBuilder,
  plan: (deck: number) => [number, number][],
  z0: number,
  decks: number,
  facade: Facade,
  top: RGB = P.roof,
): number {
  let z = z0;
  for (let d = 0; d < decks; d++) z = deckBlock(b, plan(d), z, 1, facade, top);
  return z;
}

/** Glass windscreen with a white handrail around an open deck. */
export function windscreen(b: ModelBuilder, outline: [number, number][], z: number, height = 1.2): void {
  for (let i = 0; i < outline.length; i++) {
    const [ax, ay] = outline[i]!;
    const [bx, by] = outline[(i + 1) % outline.length]!;
    b.quad([ax, ay, z], [bx, by, z], [bx, by, z + height], [ax, ay, z + height], P.railGlass);
    b.quad([ax, ay, z + height], [bx, by, z + height], [bx, by, z + height + 0.12], [ax, ay, z + height + 0.12], P.white);
  }
}

/**
 * Plan outline of a deck block: straight sides, square aft end and a rounded
 * (superelliptic) forward end. Counter-clockwise seen from above.
 */
export function deckPlan(yAft: number, yFwd: number, halfWidth: number, frontLength: number, segments = 12): [number, number][] {
  const pts: [number, number][] = [[halfWidth, yAft]];
  const base = yFwd - frontLength;
  const e = 2.6;
  for (let k = 0; k <= segments; k++) {
    const phi = (k / segments) * Math.PI;
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    pts.push([halfWidth * Math.sign(c) * Math.abs(c) ** (2 / e), base + frontLength * Math.abs(s) ** (2 / e)]);
  }
  pts.push([-halfWidth, yAft]);
  return pts;
}

export function rect(x0: number, x1: number, y0: number, y1: number): [number, number][] {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

// ---------------------------------------------------------------- fittings

/** Enclosed lifeboat centred at (x, y), keel at z. */
export function lifeboat(b: ModelBuilder, x: number, y: number, z: number): void {
  const hull: [number, number][] = [];
  const canopy: [number, number][] = [];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    hull.push([x + 2 * c, y + 5.4 * Math.sign(s) * Math.abs(s) ** 0.7]);
    canopy.push([x + 1.6 * c, y + 4.3 * Math.sign(s) * Math.abs(s) ** 0.7]);
  }
  b.prism(hull, z, z + 1.4, P.lifeboat);
  b.prism(canopy, z + 1.4, z + 2.7, P.lifeboatTop);
}

/** Rows of lifeboats along both sides between yFrom and yTo. */
export function lifeboatRows(b: ModelBuilder, xAbs: number, yFrom: number, yTo: number, count: number, z: number): void {
  for (let k = 0; k < count; k++) {
    const y = yFrom + ((yTo - yFrom) * (k + 0.5)) / count;
    lifeboat(b, xAbs, y, z);
    lifeboat(b, -xAbs, y, z);
  }
}

/** Elliptical funnel with soot cap and the crown-and-anchor style logo on both sides. */
export type FunnelLivery = 'rci' | 'ncl' | 'carnival';

/** Elliptical funnel with soot cap and line livery (logo on both sides). */
export function funnel(
  b: ModelBuilder,
  x: number,
  y: number,
  z0: number,
  height: number,
  rx: number,
  ry: number,
  livery: FunnelLivery = 'rci',
): number {
  const capStart = z0 + height - 1.4;
  const topScale = 0.92;
  const scaleAt = (z: number) => 1 - (1 - topScale) * ((z - z0) / (capStart - z0));
  if (livery === 'rci') {
    b.cylinder(x, y, z0, capStart, rx, ry, 28, P.white, null, topScale);
  } else {
    // Two-tone: white lower part, coloured upper band.
    const split = z0 + (capStart - z0) * (livery === 'ncl' ? 0.72 : 0.55);
    const s = scaleAt(split);
    b.cylinder(x, y, z0, split, rx, ry, 28, P.white, null, s);
    b.cylinder(x, y, split, capStart, rx * s, ry * s, 28, livery === 'ncl' ? P.nclNavy : P.carnivalRed, null, topScale / s);
  }
  b.cylinder(x, y, capStart, z0 + height, rx * topScale, ry * topScale, 28, P.funnelCap, P.funnelCap, 0.97);
  const logoZ = z0 + height * (livery === 'ncl' ? 0.42 : 0.55);
  for (const side of [1, -1]) {
    const sx = x + side * rx * scaleAt(logoZ) * 0.985;
    const plate = (dx: number, y0: number, y1: number, z0p: number, z1p: number, color: RGB) =>
      b.box(Math.min(sx, sx + side * dx), Math.max(sx, sx + side * dx), y0, y1, z0p, z1p, color);
    if (livery === 'rci') {
      plate(0.15, y - 2.2, y + 2.2, logoZ - 2.2, logoZ + 2.2, P.logoBlue);
      plate(0.18, y - 1.4, y + 1.4, logoZ + 2.4, logoZ + 3.6, P.logoGold);
    } else if (livery === 'ncl') {
      plate(0.15, y - 2.6, y + 2.6, logoZ - 1, logoZ + 1, P.nclBlue);
    } else {
      plate(0.15, y - 2.4, y + 2.4, logoZ - 0.5, logoZ + 0.5, P.carnivalBlue);
    }
  }
  return z0 + height;
}

/** Bridge wings: a full-width glazed bar across the ship at the navigation deck. */
export function bridgeWings(b: ModelBuilder, y: number, z: number, halfSpan: number, depth = 5.5): void {
  b.box(-halfSpan, halfSpan, y - depth, y, z, z + 0.5, P.white);
  b.box(-halfSpan, halfSpan, y - depth, y, z + 0.5, z + 2.3, P.glass, P.white);
  b.box(-halfSpan, halfSpan, y - depth, y, z + 2.3, z + 2.8, P.white);
}

/** Mast with radar scanners and satellite domes. */
export function mast(b: ModelBuilder, y: number, z: number, height: number, radomeOffset = -3): void {
  b.cylinder(0, y, z, z + height, 0.6, 0.6, 10, P.white);
  b.box(-4, 4, y - 0.6, y + 0.6, z + height * 0.7, z + height * 0.7 + 0.5, P.white);
  b.box(-3.2, -0.6, y - 0.3, y + 0.3, z + height * 0.7 + 0.5, z + height * 0.7 + 0.8, P.steel);
  for (const sx of [-3.5, 3.5]) {
    b.cylinder(sx, y + radomeOffset, z, z + 0.6, 1.6, 1.6, 12, P.white, null);
    b.dome(sx, y + radomeOffset, z + 0.6, 1.6, 1.6, 1.6, 12, 4, () => P.white);
  }
}

export function pool(b: ModelBuilder, x0: number, x1: number, y0: number, y1: number, z: number): void {
  b.box(x0 - 3, x1 + 3, y0 - 3, y1 + 3, z, z + 0.05, P.teak);
  b.box(x0 - 0.6, x1 + 0.6, y0 - 0.6, y1 + 0.6, z, z + 0.25, P.poolEdge);
  b.box(x0, x1, y0, y1, z + 0.25, z + 0.3, P.pool);
}

export function hotTub(b: ModelBuilder, x: number, y: number, z: number): void {
  b.cylinder(x, y, z, z + 0.6, 2.2, 2.2, 14, P.poolEdge, P.poolEdge);
  b.cylinder(x, y, z + 0.6, z + 0.65, 1.8, 1.8, 14, P.pool, P.pool);
}

/** Rows of sun loungers on a deck area. */
export function loungers(b: ModelBuilder, x0: number, x1: number, y0: number, y1: number, z: number): void {
  for (let x = x0; x + 0.8 <= x1; x += 1.6) {
    for (let y = y0; y + 2 <= y1; y += 2.6) {
      b.box(x, x + 0.8, y, y + 2, z, z + 0.35, P.white);
    }
  }
}

/** Spiral water slide descending from zTop to zBottom. */
export function helixSlide(
  b: ModelBuilder,
  cx: number,
  cy: number,
  zTop: number,
  zBottom: number,
  radius: number,
  turns: number,
  startDeg: number,
  color: RGB,
  tubeRadius = 0.8,
): void {
  const n = Math.max(24, Math.round(turns * 40));
  const path: V3[] = [];
  for (let k = 0; k <= n; k++) {
    const a = (startDeg * Math.PI) / 180 + (k / n) * turns * Math.PI * 2;
    path.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a), zTop - ((zTop - zBottom) * k) / n]);
  }
  b.tube(path, tubeRadius, 10, color);
  // Support column.
  b.cylinder(cx, cy, zBottom, zTop, 0.5, 0.5, 8, P.steel, null);
}

export function tree(b: ModelBuilder, x: number, y: number, z: number, height: number): void {
  b.cylinder(x, y, z, z + height * 0.3, 0.25, 0.25, 6, P.teak, null);
  b.cylinder(x, y, z + height * 0.25, z + height, height * 0.32, height * 0.32, 8, P.tree, null, 0);
}

/** FlowRider surf simulator: tilted blue surface with white walls. */
export function flowRider(b: ModelBuilder, x: number, y: number, z: number): void {
  b.box(x - 6.5, x - 6, y - 9, y + 9, z, z + 3.2, P.white);
  b.box(x + 6, x + 6.5, y - 9, y + 9, z, z + 3.2, P.white);
  b.quad([x - 6, y - 9, z + 0.2], [x + 6, y - 9, z + 0.2], [x + 6, y + 9, z + 3], [x - 6, y + 9, z + 3], P.pool);
}

/** Rock-climbing wall panel on a vertical face facing aft (−Y). */
export function climbingWall(b: ModelBuilder, x: number, y: number, z0: number, height: number, width: number): void {
  const colors: RGB[] = [P.slideYellow, P.slideRed, P.slideBlue, P.slideGreen];
  const cols = 6;
  const rows = 5;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const x0 = x - width / 2 + (width * c) / cols;
      const z1 = z0 + (height * r) / rows;
      b.box(x0, x0 + width / cols, y - 0.3, y, z1, z1 + height / rows, colors[(c + r) % colors.length]!);
    }
  }
}

// ---------------------------------------------------------------- line-specific fittings

/** Convex polygon in the Y-Z plane extruded across X (x0..x1). */
export function sideSlab(b: ModelBuilder, poly: [number, number][], x0: number, x1: number, color: RGB): void {
  let cy = 0;
  let cz = 0;
  for (const [y, z] of poly) {
    cy += y;
    cz += z;
  }
  cy /= poly.length;
  cz /= poly.length;
  const centre: V3 = [(x0 + x1) / 2, cy, cz];
  for (let i = 1; i < poly.length - 1; i++) {
    for (const x of [x0, x1]) {
      b.triAway([x, poly[0]![0], poly[0]![1]], [x, poly[i]![0], poly[i]![1]], [x, poly[i + 1]![0], poly[i + 1]![1]], color, centre);
    }
  }
  for (let i = 0; i < poly.length; i++) {
    const [ya, za] = poly[i]!;
    const [yb, zb] = poly[(i + 1) % poly.length]!;
    b.triAway([x0, ya, za], [x1, ya, za], [x1, yb, zb], color, centre);
    b.triAway([x0, ya, za], [x1, yb, zb], [x0, yb, zb], color, centre);
  }
}

/**
 * Carnival's swept, winged "whale tail" funnel in red, white and blue.
 * `y` is the middle of its base, `length` the base length along the ship.
 */
export function whaleTail(b: ModelBuilder, y: number, z0: number, height: number, length: number): number {
  const t = Math.max(1.6, length * 0.13);
  const sweep = 0.45 * height;
  const topLen = 0.6 * length;
  const baseAft = y - length / 2;
  const baseFwd = y + length / 2;
  const topAft = baseAft - sweep;
  const topFwd = topAft + topLen;
  const yA = (f: number) => baseAft + (topAft - baseAft) * f;
  const yF = (f: number) => baseFwd + (topFwd - baseFwd) * f;
  const zAt = (f: number) => z0 + height * f;
  const bands: [number, number, RGB][] = [
    [0, 0.38, P.white],
    [0.38, 0.5, P.carnivalBlue],
    [0.5, 1, P.carnivalRed],
  ];
  for (const [f0, f1, color] of bands) {
    sideSlab(
      b,
      [
        [yA(f0), zAt(f0)],
        [yF(f0), zAt(f0)],
        [yF(f1), zAt(f1)],
        [yA(f1), zAt(f1)],
      ],
      -t,
      t,
      color,
    );
  }
  // The tail's wings: drooping fins either side near the top, striped red, white and blue.
  const wingZ = zAt(0.8);
  const wingY0 = yA(0.8) + 0.5;
  const wingLen = topLen * 0.8;
  const span = length * 0.3;
  const stripes: RGB[] = [P.carnivalBlue, P.white, P.carnivalRed];
  for (const side of [1, -1]) {
    b.with([translation(side * t, 0, wingZ), rotationY(side * 18)], () => {
      stripes.forEach((color, k) => {
        const y0 = wingY0 + (wingLen * k) / 3;
        const y1 = wingY0 + (wingLen * (k + 1)) / 3;
        if (side > 0) b.box(0, span, y0, y1, -0.35, 0.35, color, color, color);
        else b.box(-span, 0, y0, y1, -0.35, 0.35, color, color, color);
      });
    });
  }
  return z0 + height;
}

/** Closed oval ("stadium") path around a centre, with optional height profile over t in [0, 1]. */
export function loopPath(
  cx: number,
  cy: number,
  halfX: number,
  halfY: number,
  z: number | ((t: number) => number),
  segments = 72,
): V3[] {
  const rY = Math.min(halfX, halfY);
  const straight = halfY - rY;
  const endLength = (Math.PI * (halfX + rY)) / 2;
  const perimeter = 4 * straight + 2 * endLength;
  const pts: V3[] = [];
  for (let k = 0; k <= segments; k++) {
    const t = k / segments;
    let s = t * perimeter;
    let x: number;
    let y: number;
    if (s <= 2 * straight) {
      x = cx + halfX;
      y = cy - straight + s;
    } else if ((s -= 2 * straight) <= endLength) {
      const a = (s / endLength) * Math.PI;
      x = cx + halfX * Math.cos(a);
      y = cy + straight + rY * Math.sin(a);
    } else if ((s -= endLength) <= 2 * straight) {
      x = cx - halfX;
      y = cy + straight - s;
    } else {
      s -= 2 * straight;
      const a = Math.PI + (s / endLength) * Math.PI;
      x = cx + halfX * Math.cos(a);
      y = cy - straight + rY * Math.sin(a);
    }
    pts.push([x, y, typeof z === 'number' ? z : z(t)]);
  }
  return pts;
}

/** Flat track (go-kart circuit, cycle path) along a path, with red and white kerbs. */
export function ribbon(b: ModelBuilder, path: V3[], width: number, color: RGB, kerbs = true): void {
  const half = width / 2;
  const edge = (i: number, offset: number): V3 => {
    const a = path[Math.max(0, i - 1)]!;
    const c = path[Math.min(path.length - 1, i + 1)]!;
    const dx = c[0] - a[0];
    const dy = c[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const p = path[i]!;
    return [p[0] + (dy / len) * offset, p[1] - (dx / len) * offset, p[2]];
  };
  for (let i = 0; i < path.length - 1; i++) {
    const l0 = edge(i, -half);
    const r0 = edge(i, half);
    const l1 = edge(i + 1, -half);
    const r1 = edge(i + 1, half);
    const up: V3 = [(l0[0] + r1[0]) / 2, (l0[1] + r1[1]) / 2, l0[2] - 10];
    b.triAway(l0, r0, r1, color, up);
    b.triAway(l0, r1, l1, color, up);
    // Edge skirts give the deck some thickness.
    const drop = (p: V3): V3 => [p[0], p[1], p[2] - 0.4];
    b.quad(drop(r0), drop(r1), r1, r0, color);
    b.quad(drop(l1), drop(l0), l0, l1, color);
    if (kerbs) {
      const kerb = i % 2 === 0 ? P.kerbRed : P.white;
      const kl0 = edge(i, -half - 0.6);
      const kl1 = edge(i + 1, -half - 0.6);
      const kr0 = edge(i, half + 0.6);
      const kr1 = edge(i + 1, half + 0.6);
      b.triAway(kl0, l0, l1, kerb, up);
      b.triAway(kl0, l1, kl1, kerb, up);
      b.triAway(r0, kr0, kr1, kerb, up);
      b.triAway(r0, kr1, r1, kerb, up);
    }
  }
}

/** Support columns from a raised path down to a deck. */
export function pillars(b: ModelBuilder, path: V3[], every: number, zBase: number, color: RGB = P.steel): void {
  for (let i = 0; i < path.length; i += every) {
    const [x, y, z] = path[i]!;
    if (z - zBase > 0.8) b.cylinder(x, y, zBase, z - 0.4, 0.35, 0.35, 8, color, null);
  }
}

/** Ropes course: a lattice of posts and beams over a deck area. */
export function ropesCourse(b: ModelBuilder, x0: number, x1: number, y0: number, y1: number, z: number, height: number): void {
  const nx = Math.max(2, Math.round((x1 - x0) / 5));
  const ny = Math.max(2, Math.round((y1 - y0) / 5));
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= ny; j++) {
      const x = x0 + ((x1 - x0) * i) / nx;
      const y = y0 + ((y1 - y0) * j) / ny;
      b.cylinder(x, y, z, z + height, 0.2, 0.2, 6, P.steel, null);
    }
  }
  for (const level of [height * 0.45, height * 0.95]) {
    for (let i = 0; i <= nx; i++) {
      const x = x0 + ((x1 - x0) * i) / nx;
      b.box(x - 0.15, x + 0.15, y0, y1, z + level - 0.15, z + level + 0.15, P.slideOrange);
    }
    for (let j = 0; j <= ny; j++) {
      const y = y0 + ((y1 - y0) * j) / ny;
      b.box(x0, x1, y - 0.15, y + 0.15, z + level - 0.15, z + level + 0.15, P.slideYellow);
    }
  }
}

/** Straight-run tube slide between points (e.g. racer slides, free-fall drops). */
export function tubeSlide(b: ModelBuilder, points: V3[], color: RGB, radius = 0.9): void {
  // Smooth the polyline with Catmull-Rom interpolation.
  const path: V3[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;
    for (let k = 0; k < 10; k++) {
      const t = k / 10;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (a: number, bb: number, cc: number, d: number) =>
        0.5 * (2 * bb + (-a + cc) * t + (2 * a - 5 * bb + 4 * cc - d) * t2 + (-a + 3 * bb - 3 * cc + d) * t3);
      path.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1]), c(p0[2], p1[2], p2[2], p3[2])]);
    }
  }
  path.push(points[points.length - 1]!);
  b.tube(path, radius, 10, color);
}

// ---------------------------------------------------------------- standard layout

export interface LayoutSpec {
  hull: HullSpec;
  /** Public-room decks above the hull (window facade). */
  a: { decks: number; aft: number; front: number; half: number; frontLen: number };
  /** Cabin decks (balcony facade), terraced forward by `step` and aft by `sternStep` per deck. */
  b: { decks: number; aft: number; front: number; half: number; frontLen: number; step?: number; sternStep?: number };
  /** Top (pool/sun) decks. */
  c: { decks: number; aft: number; front: number; half: number; frontLen: number; facade?: Facade };
  lifeboats: { x: number; from: number; to: number; count: number; below: number };
  /** Bridge wings: half span and which cabin deck (0-based from the bottom of block B). */
  bridge: { half: number; deck: number };
}

export interface Layout {
  zA: number;
  zB: number;
  zC: number;
  /** Front of cabin deck d (0-based). */
  frontB: (d: number) => number;
}

/** Hull, lifeboats, three superstructure blocks and the bridge: the base most cruise ships share. */
export function standardLayout(b: ModelBuilder, s: LayoutSpec): Layout {
  buildHull(b, s.hull);
  lifeboatRows(b, s.lifeboats.x, s.lifeboats.from, s.lifeboats.to, s.lifeboats.count, s.hull.height - s.lifeboats.below);
  const zA = deckBlock(b, deckPlan(s.a.aft, s.a.front, s.a.half, s.a.frontLen), s.hull.height, s.a.decks, 'window');
  const step = s.b.step ?? 1.4;
  const sternStep = s.b.sternStep ?? 0;
  const frontB = (d: number) => s.b.front - step * d;
  const zB = steppedBlock(
    b,
    (d) => deckPlan(s.b.aft + sternStep * d, frontB(d), s.b.half, s.b.frontLen),
    zA,
    s.b.decks,
    'balcony',
  );
  const zC = deckBlock(b, deckPlan(s.c.aft, s.c.front, s.c.half, s.c.frontLen), zB, s.c.decks, s.c.facade ?? 'window', P.deck, true);
  const bridgeDeck = Math.min(s.bridge.deck, s.b.decks - 1);
  bridgeWings(b, frontB(bridgeDeck) + 2, zA + bridgeDeck * DECK_HEIGHT, s.bridge.half, 5.5);
  return { zA, zB, zC, frontB };
}
