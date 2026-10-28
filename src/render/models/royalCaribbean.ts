/**
 * Detailed procedural models of the seven Royal Caribbean ship classes.
 *
 * Each model is built in metres at the class's real overall length, beam and
 * deck count, with its distinguishing features: Icon's AquaDome and Thrill
 * Island, Oasis's split cabin towers around Central Park and the Boardwalk,
 * Quantum's North Star arm, RipCord and Two70, the funnel-mounted climbing
 * wall and FlowRider of Freedom and Voyager, Radiance's glass walls and
 * lifts, and Vision's Viking Crown Lounge ringing the funnel. They are
 * stylised reconstructions from published dimensions and photographs, not
 * shipyard CAD data.
 */
import type { ShipClassId } from '../../../shared/fleet.js';
import {
  ModelBuilder,
  rotationX,
  rotationZ,
  transformPoint,
  translation,
  type ColorMesh,
  type MeshStats,
  type RGB,
} from './builder.js';
import {
  bridgeWings,
  buildHull,
  climbingWall,
  DECK_HEIGHT as D,
  deckBlock,
  deckPlan,
  flowRider,
  funnel,
  helixSlide,
  hotTub,
  lifeboatRows,
  loungers,
  mast,
  PALETTE as P,
  pool,
  rect,
  steppedBlock,
  tree,
} from './cruiseParts.js';

export interface ShipModel {
  mesh: ColorMesh;
  /** Model length in metres; instances are scaled by reported length / this. */
  lengthM: number;
  stats: MeshStats;
}

/** Forward set-back per deck of the terraced cabin blocks, metres. */
const STEP = 1.4;

const glassDome = (ribEvery: number) => (lon: number, lat: number): RGB =>
  lon % ribEvery === 0 || lat % 3 === 2 ? P.white : P.glassLight;

// ---------------------------------------------------------------- Icon class

function buildIcon(b: ModelBuilder): number {
  const L = 365;
  const hull = { length: L, beam: 48.5, height: 15.5, rake: 10 };
  buildHull(b, hull);
  lifeboatRows(b, 26.6, -95, 105, 10, hull.height - 6);

  // Decks 6-7: public rooms.
  const zA = deckBlock(b, deckPlan(-178, 120, 24.6, 42), hull.height, 2, 'window');
  // Decks 8-16: balcony cabins, terraced at the bow and overhanging the hull.
  const zB = steppedBlock(b, (d) => deckPlan(-176, 114 - STEP * d, 25.6, 46), zA, 9, 'balcony');
  // Decks 17-18 amidships: the pool deck.
  const zC = deckBlock(b, deckPlan(-128, 38, 24, 12), zB, 2, 'window', P.deck, true);

  // AquaDome over the forward decks (houses the AquaTheater).
  b.cylinder(0, 70, zB, zB + 2.5, 23.5, 27, 48, P.white, null);
  b.dome(0, 70, zB + 2.5, 23.5, 27, 17, 36, 9, glassDome(3), 0.85);
  // Navigation bridge (deck 15) and wings.
  bridgeWings(b, 106, zA + 7 * D, 32.5, 6);
  mast(b, 100, zB, 7, 2);

  // Funnel complex aft of the pool deck.
  b.prism(deckPlan(-92, -48, 9, 12), zC, zC + 4, P.white, P.roof);
  funnel(b, 0, -70, zC + 4, 11, 8, 15);

  // Royal Bay pool deck.
  pool(b, -14, 14, -20, 12, zC);
  pool(b, -9, 9, -40, -26, zC);
  for (const x of [-11, 11]) for (const y of [22, 30]) hotTub(b, x, y, zC);
  loungers(b, -22, -17.5, -40, 15, zC);
  loungers(b, 17.5, 22, -40, 15, zC);

  // Thrill Island and Category 6 waterpark on the aft decks.
  const colors: RGB[] = [P.slideOrange, P.slideBlue, P.slideYellow, P.slidePurple, P.slideGreen, P.slideRed];
  colors.forEach((c, i) => {
    const x = i % 2 === 0 ? -12 : 12;
    const y = -165 + Math.floor(i / 2) * 14;
    helixSlide(b, x, y, zB + 20 + i, zB + 1, 5 + (i % 3), 2.5 + i * 0.4, i * 60, c);
  });
  // Pressure Drop: the near-vertical drop slide and its tower.
  b.box(-4, 4, -140, -132, zB, zB + 24, P.white, P.slideRed);
  b.tube(
    [
      [0, -136, zB + 24],
      [0, -142, zB + 20],
      [0, -150, zB + 8],
      [0, -158, zB + 2],
      [0, -168, zB + 1],
    ],
    1.1,
    12,
    P.slideBlue,
  );
  return L;
}

// ---------------------------------------------------------------- Oasis class

function buildOasis(b: ModelBuilder): number {
  const L = 362;
  const hull = { length: L, beam: 47, height: 14.5, rake: 9 };
  buildHull(b, hull);
  lifeboatRows(b, 25.6, -90, 100, 9, hull.height - 6);

  // Decks 6-7 across the full width; the deck 8 floor is Central Park and the Boardwalk.
  const zPark = deckBlock(b, deckPlan(-179, 122, 24.4, 40), hull.height, 2, 'window');

  // Decks 8-15: two cabin towers either side of the open-air neighbourhoods.
  const gap = 9.5;
  const outer = 25.8;
  const towerTop = deckBlock(b, rect(gap, outer, -177, 92), zPark, 8, 'balcony', P.roof);
  deckBlock(b, rect(-outer, -gap, -177, 92), zPark, 8, 'balcony', P.roof);
  // Bridging block over the Royal Promenade, between the two open slots.
  deckBlock(b, rect(-gap, gap, -40, 0), zPark, 8, 'window', P.roof);
  // Forward block across the full width, terraced at the bow.
  steppedBlock(b, (d) => deckPlan(92, 130 - STEP * d, outer, 34), zPark, 8, 'balcony');

  // Central Park: lawns and trees in the forward slot.
  b.box(-gap + 0.5, gap - 0.5, 2, 90, zPark, zPark + 0.1, P.grass);
  for (let y = 6; y < 88; y += 7) {
    for (const x of [-6, -2, 2, 6]) tree(b, x + ((y * 7) % 3) - 1, y, zPark + 0.1, 4 + ((y + x) % 3));
  }
  // Boardwalk: carousel and the AquaTheater amphitheatre at the stern.
  b.cylinder(0, -95, zPark, zPark + 4, 4, 4, 20, P.slideRed, P.slideYellow, 0.6);
  pool(b, -6, 6, -174, -167, zPark);
  for (let r = 0; r < 6; r++) {
    b.box(-gap + 0.5, gap - 0.5, -160 + r * 2.5, -157.5 + r * 2.5, zPark, zPark + 0.8 * (r + 1), P.slideBlue, P.white);
  }

  // Decks 16-17: pool deck over the bridging block.
  const zPool = deckBlock(b, rect(-24, 24, -48, 6), towerTop, 2, 'window', P.deck, true);
  pool(b, -16, -6, -34, -8, zPool);
  pool(b, 6, 16, -34, -8, zPool);
  for (const x of [-20, 20]) for (const y of [-40, -20, 0]) hotTub(b, x, y, zPool);
  loungers(b, -2.5, 2.5, -44, 4, zPool);
  // Forward sun deck and spa.
  deckBlock(b, deckPlan(96, 118, 20, 20), towerTop, 1, 'glass', P.deck, true);

  // Twin funnels, one on each tower.
  for (const x of [-17.5, 17.5]) funnel(b, x, -72, towerTop, 13, 4.6, 9);
  // Sports deck aft: FlowRiders, zip line and slides, including the Ultimate Abyss into the Boardwalk.
  flowRider(b, 17.5, -160, towerTop);
  flowRider(b, -17.5, -160, towerTop);
  b.tube(
    [
      [-gap - 1, -112, towerTop + 3],
      [0, -108, towerTop + 1.5],
      [gap + 1, -104, towerTop + 3],
    ],
    0.15,
    6,
    P.steel,
  );
  helixSlide(b, -4.5, -138, towerTop + 6, zPark + 1, 4, 5, 0, P.slidePurple, 1.1);
  helixSlide(b, 14, -130, towerTop + 8, towerTop, 4, 1.8, 90, P.slideOrange);
  helixSlide(b, 18, -118, towerTop + 7, towerTop, 3.5, 1.5, 200, P.slideBlue);
  climbingWall(b, -17.5, -177, zPark, 10, 12);

  // Bridge (deck 14) and wings.
  bridgeWings(b, 123.5, zPark + 6 * D, 30.2, 5.5);
  mast(b, 112, towerTop + D, 8);
  return L;
}

// ---------------------------------------------------------------- Quantum class

function buildQuantum(b: ModelBuilder): number {
  const L = 348;
  const hull = { length: L, beam: 41.4, height: 14, rake: 9 };
  buildHull(b, hull);
  lifeboatRows(b, 23.1, -85, 95, 9, hull.height - 6);

  const zA = deckBlock(b, deckPlan(-172, 116, 21.4, 38), hull.height, 2, 'window');
  // Two70: glass across the stern.
  b.box(-17, 17, -173.2, -172.4, hull.height - 2, zA, P.glass, P.white);
  const zB = steppedBlock(b, (d) => deckPlan(-168, 110 - STEP * d, 22.4, 42), zA, 7, 'balcony');
  const zC = deckBlock(b, deckPlan(-122, 95, 20.4, 40), zB, 2, 'window', P.deck, true);

  // Solarium: glazed block and vault forward.
  b.prism(deckPlan(48, 86, 15, 22), zC, zC + D, P.glass, P.white);
  b.dome(0, 67, zC + D, 14, 19, 5.5, 32, 6, glassDome(4), 0.7);

  funnel(b, 0, -82, zC, 13, 8, 14);
  // North Star: pedestal, articulated arm and glass capsule, swung out over the starboard side.
  b.cylinder(0, -110, zC, zC + 4, 3, 3, 16, P.white);
  const armTransforms = [translation(0, -110, zC + 4), rotationZ(-70), rotationX(48)];
  b.with(armTransforms, () => b.box(-0.9, 0.9, 0, 41, -0.9, 0.9, P.white, P.white, P.white));
  const tip = transformPoint(armTransforms, [0, 41, 0]);
  b.cylinder(tip[0], tip[1], tip[2] - 5, tip[2] - 0.6, 2.9, 2.9, 20, P.glassLight, P.white);
  b.cylinder(tip[0], tip[1], tip[2] - 0.6, tip[2], 1, 1, 8, P.steel, P.steel);
  // RipCord by iFly and the SeaPlex roof on the aft decks.
  b.cylinder(-9, -145, zB, zB + 13, 3.5, 3.5, 20, P.glassLight, P.white);
  b.box(4, 20, -160, -128, zB, zB + 6, P.white, P.roof);

  pool(b, -11, 11, -55, -22, zC);
  for (const x of [-16, 16]) for (const y of [-50, -30, -10]) hotTub(b, x, y, zC);
  loungers(b, -19, -14, -100, -62, zC);
  loungers(b, 14, 19, -100, -62, zC);

  bridgeWings(b, 105, zA + 5 * D, 24.7, 5.5);
  mast(b, 40, zC, 8);
  return L;
}

// ---------------------------------------------------------------- Freedom and Voyager classes

interface PromenadeShip {
  L: number;
  hullHeight: number;
  maxHalfBeam: number;
  cabinDecks: number;
}

/** Freedom and Voyager share a layout: funnel aft with climbing wall, glass lounge forward of it, FlowRider astern. */
function buildPromenadeClass(b: ModelBuilder, s: PromenadeShip): number {
  const { L, cabinDecks } = s;
  const hull = { length: L, beam: 38.6, height: s.hullHeight, rake: 8 };
  buildHull(b, hull);
  lifeboatRows(b, 21.7, -0.24 * L, 0.27 * L, 8, hull.height - 5.5);

  const aft = -L / 2 + 3;
  const zA = deckBlock(b, deckPlan(aft, 0.35 * L, 19.4, 0.11 * L), hull.height, 2, 'window');
  const front = (d: number) => 0.33 * L - STEP * d;
  const zB = steppedBlock(b, (d) => deckPlan(aft + 3, front(d), 19.9, 0.12 * L), zA, cabinDecks, 'balcony');
  const zC = deckBlock(b, deckPlan(-0.37 * L, 0.26 * L, 17.6, 0.11 * L), zB, 2, 'window', P.deck, true);

  const funnelY = -0.32 * L;
  // Glass-walled lounge forward of the funnel (the Viking Crown Lounge).
  b.prism(deckPlan(funnelY + 10, funnelY + 26, 13, 5), zC, zC + D, P.glass, P.white);
  const funnelTop = funnel(b, 0, funnelY, zC, 13, 6, 10);
  climbingWall(b, 0, funnelY - 9.2, zC, funnelTop - zC - 2, 5);

  flowRider(b, 0, -0.43 * L, zB);
  // Solarium vault forward-midships.
  b.prism(deckPlan(0.08 * L, 0.19 * L, 15, 10), zC, zC + D, P.glass, P.white);
  b.dome(0, 0.135 * L + 2, zC + D, 14, 0.055 * L, 4.5, 28, 6, glassDome(4), 0.7);

  pool(b, -10, -3, -0.2 * L, -0.09 * L, zC);
  pool(b, 3, 10, -0.2 * L, -0.09 * L, zC);
  for (const x of [-14.5, 14.5]) hotTub(b, x, -0.145 * L, zC);
  loungers(b, -16, -12, -0.06 * L, 0.06 * L, zC);
  loungers(b, 12, 16, -0.06 * L, 0.06 * L, zC);

  bridgeWings(b, front(cabinDecks - 1) + 2, zA + (cabinDecks - 1) * D, s.maxHalfBeam, 5);
  mast(b, 0.22 * L, zC, 7);
  return L;
}

// ---------------------------------------------------------------- Radiance class

function buildRadiance(b: ModelBuilder): number {
  const L = 293;
  const hull = { length: L, beam: 32.2, height: 11, rake: 7 };
  buildHull(b, hull);
  lifeboatRows(b, 18.3, -70, 85, 8, hull.height - 5);

  const zA = deckBlock(b, deckPlan(-143, 100, 16.2, 32), hull.height, 2, 'window');
  const zB = steppedBlock(b, (d) => deckPlan(-140, 96 - STEP * d, 16.5, 36), zA, 5, 'balcony');
  // The most glazed of the classes: a glass-walled top tier.
  const zC = deckBlock(b, deckPlan(-106, 80, 15, 32), zB, 2, 'glass', P.deck, true);
  // Centrum glass walls and the outward-facing glass lifts amidships.
  for (const side of [1, -1]) {
    const x0 = side * 16.5;
    const x1 = side * 17.1;
    b.box(Math.min(x0, x1), Math.max(x0, x1), -6, 22, hull.height, zB, P.glass, P.white);
    for (const y of [26, 31]) {
      const e0 = side * 16.5;
      const e1 = side * 19;
      b.box(Math.min(e0, e1), Math.max(e0, e1), y, y + 3.2, hull.height, zC, P.glassLight, P.white);
    }
  }
  // Viking Crown Lounge forward of the funnel.
  b.prism(deckPlan(-80, -62, 11, 5), zC, zC + D, P.glass, P.white);
  funnel(b, 0, -95, zC, 15, 4.8, 8.5);
  // Solarium.
  b.prism(deckPlan(18, 58, 13, 8), zC, zC + D, P.glass, P.white);
  b.dome(0, 38, zC + D, 12.5, 19, 4, 28, 6, glassDome(4), 0.7);

  pool(b, -8, 8, -40, -18, zC);
  for (const x of [-12, 12]) hotTub(b, x, -8, zC);
  loungers(b, -14, -11, -55, -12, zC);
  loungers(b, 11, 14, -55, -12, zC);

  bridgeWings(b, 96 - STEP * 4 + 2, zA + 4 * D, 17.2, 5);
  mast(b, 72, zC, 6);
  return L;
}

// ---------------------------------------------------------------- Vision class

function buildVision(b: ModelBuilder): number {
  const L = 279;
  const hull = { length: L, beam: 32.2, height: 10, rake: 7 };
  buildHull(b, hull);
  // Lifeboats on davits along the promenade deck.
  lifeboatRows(b, 18.4, -65, 80, 8, hull.height - 4.5);

  const zA = deckBlock(b, deckPlan(-137, 94, 16.1, 30), hull.height, 2, 'window');
  const zB = steppedBlock(b, (d) => deckPlan(-134, 90 - STEP * d, 16.3, 34), zA, 4, 'balcony');
  const zC = deckBlock(b, deckPlan(-104, 74, 15, 30), zB, 2, 'window', P.deck, true);
  // Centrum: tall glass walls amidships.
  for (const side of [1, -1]) {
    const x0 = side * 16.3;
    const x1 = side * 16.9;
    b.box(Math.min(x0, x1), Math.max(x0, x1), -2, 26, hull.height, zB, P.glass, P.white);
  }

  // Viking Crown Lounge: a ring of glass wrapped around the funnel.
  const funnelY = -92;
  const ring: [number, number][] = [];
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2;
    ring.push([Math.cos(a) * 11.5, funnelY + Math.sin(a) * 12.5]);
  }
  const ringBase = zC + 3;
  b.cylinder(0, funnelY, zC, ringBase, 5.2, 8.5, 24, P.white, null);
  deckBlock(b, ring, ringBase, 1, 'glass', P.white);
  b.prism(ring, ringBase + D, ringBase + D + 0.6, P.white);
  funnel(b, 0, funnelY, ringBase + D + 0.6, 9, 4.6, 7.6);

  // Solarium.
  b.prism(deckPlan(12, 50, 12.5, 8), zC, zC + D, P.glass, P.white);
  b.dome(0, 31, zC + D, 12, 18, 4, 28, 6, glassDome(4), 0.7);

  pool(b, -7, 7, -40, -20, zC);
  for (const x of [-11.5, 11.5]) hotTub(b, x, -10, zC);
  loungers(b, -13.5, -10.5, -70, -45, zC);
  loungers(b, 10.5, 13.5, -70, -45, zC);

  bridgeWings(b, 90 - STEP * 3 + 2, zA + 3 * D, 16.6, 5);
  mast(b, 66, zC, 6);
  return L;
}

// ---------------------------------------------------------------- cache

const BUILDERS: Record<ShipClassId, (b: ModelBuilder) => number> = {
  icon: buildIcon,
  oasis: buildOasis,
  quantum: buildQuantum,
  freedom: (b) => buildPromenadeClass(b, { L: 339, hullHeight: 13, maxHalfBeam: 28, cabinDecks: 6 }),
  voyager: (b) => buildPromenadeClass(b, { L: 311, hullHeight: 12.5, maxHalfBeam: 24, cabinDecks: 5 }),
  radiance: buildRadiance,
  vision: buildVision,
};

const cache = new Map<ShipClassId, ShipModel>();

/** The detailed model for a class, built on first use and cached. */
export function getShipModel(id: ShipClassId): ShipModel {
  let model = cache.get(id);
  if (!model) {
    const b = new ModelBuilder();
    const lengthM = BUILDERS[id](b);
    model = { mesh: b.build(), lengthM, stats: b.stats() };
    cache.set(id, model);
  }
  return model;
}
