/**
 * Detailed procedural models of Norwegian Cruise Line's ship classes.
 *
 * Built at each class's real length, beam and deck count, with NCL's bow hull
 * art (a stylised mural per class; on Pride of America, the stars and
 * stripes) and class features: Prima's three-level Speedway, The Drop and
 * Infinity Beach; Prima Plus's Aqua Slidecoaster; the Breakaway Plus go-kart
 * track and over-the-side slide loops (Escape has a ropes course instead of
 * the track); Breakaway's free-fall slides and ropes course; Epic's blunt bow
 * and Epic Plunge; Spinnaker observation lounges on the older classes.
 * Stylised reconstructions from published dimensions and photographs, not
 * shipyard CAD data.
 */
import type { ModelBuilder, RGB } from './builder.js';
import {
  DECK_HEIGHT as D,
  deckPlan,
  funnel,
  helixSlide,
  hotTub,
  loopPath,
  loungers,
  mast,
  PALETTE as P,
  pillars,
  pool,
  ribbon,
  ropesCourse,
  standardLayout,
  tubeSlide,
  type HullPaint,
  type LayoutSpec,
} from './cruiseParts.js';
import type { ModelBuildFn } from './royalCaribbean.js';

// ---------------------------------------------------------------- hull art

const ART = {
  coral: [0.96, 0.42, 0.36],
  teal: [0.0, 0.62, 0.66],
  navy: [0.05, 0.13, 0.38],
  yellow: [0.98, 0.78, 0.12],
  aqua: [0.2, 0.75, 0.88],
  ocean: [0.0, 0.35, 0.7],
  cyan: [0.35, 0.85, 0.95],
  orange: [0.97, 0.52, 0.12],
  magenta: [0.86, 0.15, 0.55],
  purple: [0.45, 0.2, 0.68],
  gold: [0.88, 0.7, 0.2],
  red: [0.82, 0.12, 0.16],
  green: [0.2, 0.62, 0.36],
} as const satisfies Record<string, RGB>;

/**
 * Swept mural over the forward hull: it starts as a band along the top of the
 * hull just forward of midships and widens to cover the full hull side at the bow.
 */
function hullArt(L: number, H: number, palette: RGB[]): HullPaint {
  const yStart = -0.06 * L;
  return (y, z) => {
    if (y < yStart) return undefined;
    const u = (y - yStart) / (L / 2 - yStart);
    if (z < H * (0.6 - 0.75 * u)) return undefined;
    // Diagonal colour bands sweeping up toward the bow.
    const band = Math.floor(u * 9 + (z / H) * 2.5);
    return palette[((band % palette.length) + palette.length) % palette.length];
  };
}

/** Pride of America's stars-and-stripes bow. */
function flagArt(L: number, H: number): HullPaint {
  const yStart = -0.04 * L;
  return (y, z) => {
    if (y < yStart) return undefined;
    const u = (y - yStart) / (L / 2 - yStart);
    if (z < H * (0.6 - 0.75 * u)) return undefined;
    if (u > 0.5 && z > H * 0.55) {
      return (Math.floor(y / 2.4) + Math.floor(z / 1.5)) % 2 === 0 ? P.white : ART.navy;
    }
    return Math.floor((z / H) * 13) % 2 === 0 ? ART.red : P.white;
  };
}

// ---------------------------------------------------------------- shared layout

interface NclOptions {
  sternStep?: number;
  step?: number;
  /** Fraction of length used by the rounded front of each block (small = blunt bow). */
  frontLen?: number;
  wing?: number;
  aftC?: number;
  glassTop?: boolean;
}

function layout(L: number, beam: number, H: number, decksB: number, paint: HullPaint, o: NclOptions = {}): LayoutSpec {
  const half = beam / 2;
  const frontLen = o.frontLen ?? 0.12;
  return {
    hull: { length: L, beam, height: H, rake: 8, paint },
    a: { decks: 2, aft: -L / 2 + 2, front: 0.36 * L, half: half + 0.3, frontLen: frontLen * L },
    b: {
      decks: decksB,
      aft: -L / 2 + 4,
      front: 0.36 * L - 5,
      half: half + 0.9,
      frontLen: (frontLen + 0.01) * L,
      step: o.step ?? 1.3,
      sternStep: o.sternStep,
    },
    c: { decks: 2, aft: o.aftC ?? -0.36 * L, front: 0.26 * L, half: half - 1.2, frontLen: (frontLen - 0.02) * L, facade: o.glassTop ? 'glass' : 'window' },
    lifeboats: { x: half + 2.4, from: -0.26 * L, to: 0.28 * L, count: Math.round(L / 36), below: 5.5 },
    bridge: { half: o.wing ?? half + 4, deck: decksB - 2 },
  };
}

function lido(b: ModelBuilder, z: number, y0: number, y1: number, halfWidth: number): void {
  const mid = (y0 + y1) / 2;
  pool(b, -halfWidth * 0.45, halfWidth * 0.45, mid - 9, mid + 7, z);
  for (const x of [-halfWidth * 0.72, halfWidth * 0.72]) hotTub(b, x, mid + 11, z);
  loungers(b, -halfWidth * 0.95, -halfWidth * 0.75, y0, y1, z);
  loungers(b, halfWidth * 0.75, halfWidth * 0.95, y0, y1, z);
}

/** Two-level go-kart circuit with pillars and a connecting ramp. */
function goKartTrack(b: ModelBuilder, cy: number, halfX: number, halfY: number, z: number, levels: number): void {
  for (let k = 0; k < levels; k++) {
    const shrink = k * 2.5;
    const path = loopPath(0, cy, halfX - shrink, halfY - shrink, z + 0.6 + k * 4, 96);
    ribbon(b, path, 3.2, P.track);
    pillars(b, path, 8, z);
  }
}

/** Glass observation lounge (Spinnaker Lounge) over the bridge. */
function observationLounge(b: ModelBuilder, s: LayoutSpec, z: number): void {
  b.prism(deckPlan(s.c.front - 22, s.c.front - 2, s.c.half - 2.5, 12), z, z + D, P.glass, P.white);
}

// ---------------------------------------------------------------- classes

function buildPrimaFamily(b: ModelBuilder, plus: boolean): number {
  const L = plus ? 322 : 294;
  const H = 13;
  const palette: RGB[] = plus ? [ART.aqua, ART.ocean, ART.cyan, ART.navy] : [ART.coral, ART.teal, ART.navy, ART.yellow];
  const s = layout(L, 41, H, 7, hullArt(L, H, palette), { sternStep: 1.8, wing: 24 });
  const l = standardLayout(b, s);
  const funnelY = -0.13 * L;
  const funnelTop = funnel(b, 0, funnelY, l.zC, 16, 6, 11, 'ncl');
  // Infinity Beach on the terraced stern.
  pool(b, -12, 12, s.b.aft + 1.8 * (s.b.decks - 1) + 4, s.b.aft + 1.8 * (s.b.decks - 1) + 16, l.zB);
  lido(b, l.zC, 0.0 * L, 0.16 * L, s.c.half);
  if (plus) {
    // Aqua Slidecoaster: one loop around the funnel, then down aft.
    const loop = loopPath(0, funnelY, 10, 16, (t) => funnelTop - 3 - 8 * t, 96);
    b.tube(loop, 0.9, 10, P.slideBlue);
    const end = loop[loop.length - 1]!;
    tubeSlide(
      b,
      [end, [end[0] - 4, funnelY - 22, l.zC + 4], [6, funnelY - 34, l.zC + 1]],
      P.slideBlue,
    );
    pillars(b, loop, 12, l.zC);
  } else {
    // Prima Speedway: three-level go-kart track on the aft top deck.
    goKartTrack(b, -0.27 * L, 14, 18, l.zC, 3);
  }
  // The Drop and The Rush: slides that plunge down outside the starboard side.
  const x = s.b.half;
  tubeSlide(
    b,
    [
      [x - 6, -0.3 * L, l.zC + 12],
      [x + 0.5, -0.32 * L, l.zC + 2],
      [x + 1.8, -0.35 * L, l.zB - 8],
      [x + 1, -0.38 * L, l.zA + 1],
    ],
    P.slideRed,
    1.1,
  );
  mast(b, s.c.front - 8, l.zC, 7);
  return L;
}

function buildBreakawayPlus(b: ModelBuilder, variant?: string): number {
  const L = 333.5;
  const H = 13.5;
  const s = layout(L, 41.4, H, 8, hullArt(L, H, [ART.ocean, ART.cyan, ART.navy, ART.aqua]), { wing: 25 });
  const l = standardLayout(b, s);
  funnel(b, 0, -0.12 * L, l.zC, 15, 6, 12, 'ncl');
  if (variant === 'no-track') {
    ropesCourse(b, -15, 15, -0.34 * L, -0.24 * L, l.zC, 7);
  } else {
    goKartTrack(b, -0.28 * L, 15, 18, l.zC, 2);
  }
  // Aqua Park: racer slides whose loops swing out over the side.
  helixSlide(b, s.c.half - 2, -0.19 * L, l.zC + 12, l.zC + 1, 5.5, 1.6, 0, P.slideOrange);
  helixSlide(b, -(s.c.half - 2), -0.19 * L, l.zC + 12, l.zC + 1, 5.5, 1.6, 180, P.slideGreen);
  lido(b, l.zC, 0, 0.17 * L, s.c.half);
  mast(b, s.c.front - 8, l.zC, 7);
  return L;
}

function buildBreakaway(b: ModelBuilder): number {
  const L = 324;
  const H = 13;
  const s = layout(L, 39.7, H, 7, hullArt(L, H, [ART.orange, ART.magenta, ART.purple, ART.yellow]), { wing: 24 });
  const l = standardLayout(b, s);
  funnel(b, 0, -0.12 * L, l.zC, 15, 6, 12, 'ncl');
  ropesCourse(b, -14, 14, -0.34 * L, -0.25 * L, l.zC, 7);
  // Aqua Park free-fall slides: near-vertical drops, then a sweep aft.
  for (const [x, color] of [
    [10, P.slidePurple],
    [-10, P.slideBlue],
  ] as [number, RGB][]) {
    tubeSlide(
      b,
      [
        [x, -0.2 * L, l.zC + 13],
        [x, -0.2 * L - 1, l.zC + 6],
        [x * 1.2, -0.22 * L, l.zC + 2],
        [x * 1.3, -0.235 * L, l.zC + 1],
      ],
      color,
    );
  }
  lido(b, l.zC, 0, 0.17 * L, s.c.half);
  mast(b, s.c.front - 8, l.zC, 7);
  return L;
}

function buildEpic(b: ModelBuilder): number {
  const L = 329.5;
  const H = 16;
  // Epic's famously blunt, upright superstructure front.
  const s = layout(L, 40.6, H, 8, hullArt(L, H, [ART.teal, ART.navy, ART.cyan, P.white]), {
    frontLen: 0.06,
    step: 0.4,
    wing: 24,
  });
  const l = standardLayout(b, s);
  funnel(b, 0, -0.25 * L, l.zC, 13, 7, 12, 'ncl');
  // Epic Plunge: the bowl slide, plus two more tubes.
  const bowlY = -0.33 * L;
  b.cylinder(10, bowlY, l.zC + 6, l.zC + 9, 4.5, 4.5, 24, P.slideOrange, null, 1.5);
  b.cylinder(10, bowlY, l.zC, l.zC + 6, 0.8, 0.8, 10, P.steel, null);
  helixSlide(b, -10, bowlY, l.zC + 12, l.zC + 1, 4, 2.2, 0, P.slideBlue);
  helixSlide(b, 0, bowlY - 6, l.zC + 9, l.zC + 1, 3.2, 1.6, 90, P.slideYellow);
  lido(b, l.zC, -0.12 * L, 0.08 * L, s.c.half);
  mast(b, s.c.front - 6, l.zC, 7);
  return L;
}

/** The 2000s classes share a profile: aft funnel, Spinnaker Lounge forward, slide aft. */
function buildClassic(
  b: ModelBuilder,
  L: number,
  beam: number,
  H: number,
  decksB: number,
  paint: HullPaint,
  funnelAt: number,
  o: NclOptions = {},
): number {
  const s = layout(L, beam, H, decksB, paint, { wing: beam / 2 + 3, aftC: -0.4 * L, ...o });
  const l = standardLayout(b, s);
  funnel(b, 0, funnelAt * L, l.zC, 14, 5, 9, 'ncl');
  observationLounge(b, s, l.zC);
  lido(b, l.zC, -0.1 * L, 0.1 * L, s.c.half);
  helixSlide(b, 7, -0.42 * L, l.zB + 11, l.zB + 1, 3.5, 2, 0, P.slideBlue);
  mast(b, s.c.front - 14, l.zC + D, 6);
  return L;
}

export const NCL_BUILDERS: Record<string, ModelBuildFn> = {
  'ncl-prima': (b) => buildPrimaFamily(b, false),
  'ncl-prima-plus': (b) => buildPrimaFamily(b, true),
  'ncl-breakaway-plus': buildBreakawayPlus,
  'ncl-breakaway': buildBreakaway,
  'ncl-epic': buildEpic,
  'ncl-jewel': (b) =>
    buildClassic(b, 294, 32.2, 11, 6, hullArt(294, 11, [ART.purple, ART.gold, ART.red, ART.ocean]), -0.32),
  'ncl-dawn': (b) => buildClassic(b, 294, 32.2, 11, 6, hullArt(294, 11, [ART.ocean, ART.teal, ART.yellow]), -0.34),
  'ncl-sun': (b) => buildClassic(b, 258, 32.3, 10, 5, hullArt(258, 10, [ART.orange, ART.yellow, ART.red]), -0.32),
  'ncl-leo': (b) =>
    buildClassic(b, 268, 32.2, 10, 5, hullArt(268, 10, [ART.green, ART.teal, ART.ocean]), -0.3, { sternStep: 1.5 }),
  'ncl-america': (b) => buildClassic(b, 280.6, 32.2, 10.5, 6, flagArt(280.6, 10.5), -0.32),
};
