/**
 * Detailed procedural models of Carnival Cruise Line's ship classes.
 *
 * Built at each class's real length, beam and deck count. All carry the
 * line's winged red, white and blue "whale tail" funnel except the ex-P&O
 * Grand class, plus class features: Excel's BOLT roller coaster and blue
 * hull, Vista's SkyRide, Splendor's glass roof, Sunshine's racer slides and
 * SkyCourse, the Grand class's terraced stern. Stylised reconstructions from
 * published dimensions and photographs, not shipyard CAD data.
 */
import type { ModelBuilder, RGB, V3 } from './builder.js';
import {
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
  whaleTail,
  type HullPaint,
  type Layout,
  type LayoutSpec,
} from './cruiseParts.js';
import type { ModelBuildFn } from './royalCaribbean.js';

const glassRoof = (lon: number, lat: number): RGB => (lon % 4 === 0 || lat === 2 ? P.white : P.glassLight);

/** Pools, hot tubs and loungers on the lido deck between y0 and y1. */
function lido(b: ModelBuilder, z: number, y0: number, y1: number, halfWidth: number): void {
  const mid = (y0 + y1) / 2;
  pool(b, -halfWidth * 0.45, -2, mid - 10, mid + 6, z);
  pool(b, 2, halfWidth * 0.45, mid - 10, mid + 6, z);
  for (const x of [-halfWidth * 0.7, halfWidth * 0.7]) hotTub(b, x, mid + 10, z);
  loungers(b, -halfWidth * 0.95, -halfWidth * 0.75, y0, y1, z);
  loungers(b, halfWidth * 0.75, halfWidth * 0.95, y0, y1, z);
}

/** Twister-style helix slide plus a straight racer, the WaterWorks staple. */
function waterWorks(b: ModelBuilder, y: number, zDeck: number, x = 9): void {
  helixSlide(b, x, y, zDeck + 14, zDeck + 1, 4.5, 2.6, 30, P.slideYellow);
  helixSlide(b, -x, y + 6, zDeck + 11, zDeck + 1, 3.5, 2, 200, P.slideBlue);
}

function layout(L: number, beam: number, hullHeight: number, decksB: number, o: Partial<{
  frontA: number;
  frontC: number;
  aftC: number;
  sternStep: number;
  wing: number;
  paint: HullPaint;
}> = {}): LayoutSpec {
  const half = beam / 2;
  return {
    hull: { length: L, beam, height: hullHeight, rake: 8, paint: o.paint },
    a: { decks: 2, aft: -L / 2 + 2, front: o.frontA ?? 0.36 * L, half: half + 0.3, frontLen: 0.11 * L },
    b: { decks: decksB, aft: -L / 2 + 4, front: (o.frontA ?? 0.36 * L) - 6, half: half + 0.9, frontLen: 0.13 * L, step: 1.3, sternStep: o.sternStep },
    c: { decks: 2, aft: o.aftC ?? -0.36 * L, front: o.frontC ?? 0.26 * L, half: half - 1.2, frontLen: 0.1 * L },
    lifeboats: { x: half + 2.4, from: -0.26 * L, to: 0.28 * L, count: Math.round(L / 36), below: 5.5 },
    bridge: { half: o.wing ?? half + 6, deck: decksB - 2 },
  };
}

/** Mast and radomes just aft of the bridge. */
function bridgeMast(b: ModelBuilder, l: Layout, s: LayoutSpec): void {
  mast(b, s.c.front - 8, l.zC, 7);
}

// ---------------------------------------------------------------- classes

function buildExcel(b: ModelBuilder): number {
  const L = 344.5;
  // New livery: deep blue hull.
  const s = layout(L, 42, 14, 8, { paint: () => P.carnivalNavy, wing: 26 });
  const l = standardLayout(b, s);
  const funnelY = -0.2 * L;
  whaleTail(b, funnelY, l.zC, 19, 32);
  // BOLT: the roller coaster circling the top deck around the funnel.
  const bolt = loopPath(0, funnelY - 4, 15, 38, (t) => l.zC + 6 + 3.5 * Math.sin(t * Math.PI * 6) + 2 * Math.cos(t * Math.PI * 2), 160);
  ribbon(b, bolt, 1.6, P.carnivalRed, false);
  pillars(b, bolt, 8, l.zC);
  lido(b, l.zC, -0.02 * L, 0.16 * L, s.c.half);
  waterWorks(b, -0.4 * L, l.zB);
  bridgeMast(b, l, s);
  return L;
}

function buildVistaFamily(b: ModelBuilder, venice: boolean): number {
  const L = venice ? 323.6 : 323;
  const s = layout(L, 37.2, 13, 7);
  const l = standardLayout(b, s);
  const funnelY = -0.25 * L;
  whaleTail(b, funnelY, l.zC, 17, 28);
  if (venice) {
    // Italian-styled lido under a glazed roof; no SkyRide.
    b.dome(0, 0.02 * L, l.zC, 15, 26, 7, 32, 6, glassRoof, 0.6);
    pool(b, -7, 7, 0.02 * L - 14, 0.02 * L + 10, l.zC);
    loungers(b, -16, -13, 0.12 * L, 0.2 * L, l.zC);
    loungers(b, 13, 16, 0.12 * L, 0.2 * L, l.zC);
    helixSlide(b, 10, -0.42 * L, l.zB + 12, l.zB + 1, 4, 2.2, 0, P.slideOrange);
  } else {
    // SkyRide: pedal-powered cars on an elevated track above the top deck.
    const sky = loopPath(0, -0.1 * L, 14, 26, l.zC + 7, 96);
    ribbon(b, sky, 1.1, P.offWhite, false);
    pillars(b, sky, 6, l.zC);
    lido(b, l.zC, 0.02 * L, 0.2 * L, s.c.half);
    // Kaleid-o-Slide raft slide and the Twister.
    helixSlide(b, 9, -0.43 * L, l.zB + 15, l.zB + 1, 6, 2.2, 0, P.slidePurple, 1.4);
    helixSlide(b, -9, -0.4 * L, l.zB + 12, l.zB + 1, 4, 2.4, 120, P.slideYellow);
  }
  bridgeMast(b, l, s);
  return L;
}

function buildDream(b: ModelBuilder): number {
  const L = 306;
  const s = layout(L, 37.2, 13, 6);
  const l = standardLayout(b, s);
  whaleTail(b, -0.25 * L, l.zC, 16, 26);
  lido(b, l.zC, 0, 0.18 * L, s.c.half);
  waterWorks(b, -0.42 * L, l.zB);
  // Mini-golf course aft on the top deck.
  b.box(-14, -5, -0.36 * L + 1, -0.32 * L, l.zC, l.zC + 0.1, P.green);
  bridgeMast(b, l, s);
  return L;
}

function buildSplendor(b: ModelBuilder): number {
  const L = 290;
  const s = layout(L, 36, 12, 6);
  const l = standardLayout(b, s);
  whaleTail(b, -0.27 * L, l.zC, 15, 24);
  // Retractable glass roof over the midships pool.
  b.dome(0, -0.02 * L, l.zC, 14, 22, 6.5, 32, 6, glassRoof, 0.6);
  pool(b, -6, 6, -0.02 * L - 12, -0.02 * L + 8, l.zC);
  loungers(b, -15, -12, 0.08 * L, 0.2 * L, l.zC);
  loungers(b, 12, 15, 0.08 * L, 0.2 * L, l.zC);
  waterWorks(b, -0.43 * L, l.zB);
  bridgeMast(b, l, s);
  return L;
}

function buildConquest(b: ModelBuilder): number {
  const L = 290;
  const s = layout(L, 35.5, 12, 6);
  const l = standardLayout(b, s);
  whaleTail(b, -0.28 * L, l.zC, 15, 24);
  lido(b, l.zC, -0.04 * L, 0.16 * L, s.c.half);
  waterWorks(b, -0.43 * L, l.zB);
  bridgeMast(b, l, s);
  return L;
}

function buildSunshine(b: ModelBuilder): number {
  const L = 272;
  const s = layout(L, 35.5, 11.5, 6);
  const l = standardLayout(b, s);
  whaleTail(b, -0.25 * L, l.zC, 15, 24);
  lido(b, l.zC, -0.04 * L, 0.16 * L, s.c.half);
  // WaterWorks: Twister plus the side-by-side racer slides.
  helixSlide(b, 9, -0.4 * L, l.zB + 13, l.zB + 1, 4.2, 2.4, 0, P.slideYellow);
  for (const [x, color] of [
    [-6, P.slideRed],
    [-9, P.slideBlue],
  ] as [number, RGB][]) {
    const pts: V3[] = [
      [x, -0.3 * L, l.zC + 4],
      [x, -0.36 * L, l.zB + 8],
      [x - 1, -0.42 * L, l.zB + 4],
      [x, -0.46 * L, l.zB + 1],
    ];
    tubeSlide(b, pts, color);
  }
  // SkyCourse ropes course.
  ropesCourse(b, 4, 14, -0.46 * L, -0.43 * L, l.zB, 6);
  bridgeMast(b, l, s);
  return L;
}

function buildSpirit(b: ModelBuilder): number {
  const L = 293.5;
  const s = layout(L, 32.3, 11, 5, { sternStep: 1.5, wing: 19.5 });
  s.c.facade = 'glass';
  const l = standardLayout(b, s);
  whaleTail(b, -0.28 * L, l.zC, 15, 22);
  lido(b, l.zC, -0.05 * L, 0.14 * L, s.c.half);
  helixSlide(b, 8, -0.43 * L + 6, l.zB + 12, l.zB + 1, 3.8, 2.2, 0, P.slideYellow);
  bridgeMast(b, l, s);
  return L;
}

function buildFantasy(b: ModelBuilder): number {
  const L = 260.6;
  const s = layout(L, 31.4, 10, 4, { wing: 18.5, aftC: -0.4 * L });
  const l = standardLayout(b, s);
  // The funnel sits well aft on the Fantasy class.
  whaleTail(b, -0.33 * L, l.zC, 14, 20);
  lido(b, l.zC, -0.08 * L, 0.12 * L, s.c.half);
  helixSlide(b, 7, -0.44 * L, l.zB + 11, l.zB + 1, 3.5, 2, 0, P.slideYellow);
  bridgeMast(b, l, s);
  return L;
}

function buildGrand(b: ModelBuilder): number {
  const L = 290;
  // Ex-Princess Grand class: tall superstructure with a terraced stern.
  const s = layout(L, 36, 12, 7, { sternStep: 2.4, wing: 22 });
  const l = standardLayout(b, s);
  funnel(b, 0, -0.2 * L, l.zC, 14, 5.5, 11, 'carnival');
  lido(b, l.zC, -0.06 * L, 0.14 * L, s.c.half);
  bridgeMast(b, l, s);
  return L;
}

export const CARNIVAL_BUILDERS: Record<string, ModelBuildFn> = {
  'ccl-excel': buildExcel,
  'ccl-vista': (b) => buildVistaFamily(b, false),
  'ccl-venice': (b) => buildVistaFamily(b, true),
  'ccl-dream': buildDream,
  'ccl-splendor': buildSplendor,
  'ccl-conquest': buildConquest,
  'ccl-sunshine': buildSunshine,
  'ccl-spirit': buildSpirit,
  'ccl-fantasy': buildFantasy,
  'ccl-grand': buildGrand,
};
