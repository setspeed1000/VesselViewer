/**
 * Cruise fleets with detailed class models: Royal Caribbean International,
 * Carnival Cruise Line and Norwegian Cruise Line (ships in service, October
 * 2026).
 *
 * Ships are matched by AIS name. AIS names are limited to 20 characters, so
 * longer names ("INDEPENDENCE OF THE SEAS") arrive truncated; both forms
 * match. A reported ship type or length that contradicts the class rejects
 * the match. Names that are not distinctive on their own ("MARDI GRAS",
 * "PRIDE OF AMERICA") also require reported dimensions that fit the class.
 */
import type { Vessel } from './vessel.js';

export type CruiseLine = 'Royal Caribbean' | 'Carnival' | 'Norwegian';

export type ShipClassId =
  | 'rci-icon'
  | 'rci-oasis'
  | 'rci-quantum'
  | 'rci-freedom'
  | 'rci-voyager'
  | 'rci-radiance'
  | 'rci-vision'
  | 'ccl-excel'
  | 'ccl-vista'
  | 'ccl-venice'
  | 'ccl-dream'
  | 'ccl-splendor'
  | 'ccl-conquest'
  | 'ccl-sunshine'
  | 'ccl-spirit'
  | 'ccl-fantasy'
  | 'ccl-grand'
  | 'ncl-prima'
  | 'ncl-prima-plus'
  | 'ncl-breakaway-plus'
  | 'ncl-breakaway'
  | 'ncl-epic'
  | 'ncl-jewel'
  | 'ncl-dawn'
  | 'ncl-sun'
  | 'ncl-leo'
  | 'ncl-america';

export interface FleetShip {
  name: string;
  /** Ship-specific model variant, e.g. a sister ship without a feature. */
  variant?: string;
  /** Require reported dimensions to match (for names that are not distinctive). */
  strict?: boolean;
}

export interface ShipClassInfo {
  line: CruiseLine;
  label: string;
  /** Typical overall length, metres. */
  lengthM: number;
  /** Waterline beam, metres. */
  beamM: number;
  ships: (string | FleetShip)[];
}

export const FLEET_CLASSES: Record<ShipClassId, ShipClassInfo> = {
  // ------------------------------------------------------------ Royal Caribbean
  'rci-icon': {
    line: 'Royal Caribbean',
    label: 'Icon class',
    lengthM: 365,
    beamM: 48.5,
    ships: ['Icon of the Seas', 'Star of the Seas', 'Legend of the Seas'],
  },
  'rci-oasis': {
    line: 'Royal Caribbean',
    label: 'Oasis class',
    lengthM: 362,
    beamM: 47,
    ships: [
      'Oasis of the Seas',
      'Allure of the Seas',
      'Harmony of the Seas',
      'Symphony of the Seas',
      'Wonder of the Seas',
      'Utopia of the Seas',
    ],
  },
  'rci-quantum': {
    line: 'Royal Caribbean',
    label: 'Quantum class',
    lengthM: 348,
    beamM: 41.4,
    ships: ['Quantum of the Seas', 'Anthem of the Seas', 'Ovation of the Seas', 'Spectrum of the Seas', 'Odyssey of the Seas'],
  },
  'rci-freedom': {
    line: 'Royal Caribbean',
    label: 'Freedom class',
    lengthM: 339,
    beamM: 38.6,
    ships: ['Freedom of the Seas', 'Liberty of the Seas', 'Independence of the Seas'],
  },
  'rci-voyager': {
    line: 'Royal Caribbean',
    label: 'Voyager class',
    lengthM: 311,
    beamM: 38.6,
    ships: ['Voyager of the Seas', 'Explorer of the Seas', 'Adventure of the Seas', 'Navigator of the Seas', 'Mariner of the Seas'],
  },
  'rci-radiance': {
    line: 'Royal Caribbean',
    label: 'Radiance class',
    lengthM: 293,
    beamM: 32.2,
    ships: ['Radiance of the Seas', 'Brilliance of the Seas', 'Serenade of the Seas', 'Jewel of the Seas'],
  },
  'rci-vision': {
    line: 'Royal Caribbean',
    label: 'Vision class',
    lengthM: 279,
    beamM: 32.2,
    ships: ['Vision of the Seas', 'Rhapsody of the Seas', 'Grandeur of the Seas', 'Enchantment of the Seas'],
  },

  // ------------------------------------------------------------ Carnival
  'ccl-excel': {
    line: 'Carnival',
    label: 'Excel class',
    lengthM: 344.5,
    beamM: 42,
    ships: [{ name: 'Mardi Gras', strict: true }, 'Carnival Celebration', 'Carnival Jubilee'],
  },
  'ccl-vista': {
    line: 'Carnival',
    label: 'Vista class',
    lengthM: 323,
    beamM: 37.2,
    ships: ['Carnival Vista', 'Carnival Horizon', 'Carnival Panorama'],
  },
  'ccl-venice': {
    line: 'Carnival',
    label: 'Venice class (Vista subclass)',
    lengthM: 323.6,
    beamM: 37.2,
    ships: ['Carnival Venezia', 'Carnival Firenze'],
  },
  'ccl-dream': {
    line: 'Carnival',
    label: 'Dream class',
    lengthM: 306,
    beamM: 37.2,
    ships: ['Carnival Dream', 'Carnival Magic', 'Carnival Breeze'],
  },
  'ccl-splendor': {
    line: 'Carnival',
    label: 'Splendor class',
    lengthM: 290,
    beamM: 36,
    ships: ['Carnival Splendor'],
  },
  'ccl-conquest': {
    line: 'Carnival',
    label: 'Conquest class',
    lengthM: 290,
    beamM: 35.5,
    ships: ['Carnival Conquest', 'Carnival Glory', 'Carnival Valor', 'Carnival Liberty', 'Carnival Freedom'],
  },
  'ccl-sunshine': {
    line: 'Carnival',
    label: 'Sunshine class',
    lengthM: 272,
    beamM: 35.5,
    ships: ['Carnival Sunshine', 'Carnival Sunrise', 'Carnival Radiance'],
  },
  'ccl-spirit': {
    line: 'Carnival',
    label: 'Spirit class',
    lengthM: 293.5,
    beamM: 32.3,
    ships: ['Carnival Spirit', 'Carnival Pride', 'Carnival Legend', 'Carnival Miracle', 'Carnival Luminosa'],
  },
  'ccl-fantasy': {
    line: 'Carnival',
    label: 'Fantasy class',
    lengthM: 260.6,
    beamM: 31.4,
    ships: ['Carnival Elation', 'Carnival Paradise'],
  },
  'ccl-grand': {
    line: 'Carnival',
    label: 'Grand class (ex-P&O Australia)',
    lengthM: 290,
    beamM: 36,
    ships: ['Carnival Adventure', 'Carnival Encounter'],
  },

  // ------------------------------------------------------------ Norwegian
  'ncl-prima': {
    line: 'Norwegian',
    label: 'Prima class',
    lengthM: 294,
    beamM: 41,
    ships: ['Norwegian Prima', 'Norwegian Viva'],
  },
  'ncl-prima-plus': {
    line: 'Norwegian',
    label: 'Prima Plus class',
    lengthM: 322,
    beamM: 41,
    ships: ['Norwegian Aqua', 'Norwegian Luna'],
  },
  'ncl-breakaway-plus': {
    line: 'Norwegian',
    label: 'Breakaway Plus class',
    lengthM: 333.5,
    beamM: 41.4,
    // Escape is the one sister without the go-kart track.
    ships: [{ name: 'Norwegian Escape', variant: 'no-track' }, 'Norwegian Joy', 'Norwegian Bliss', 'Norwegian Encore'],
  },
  'ncl-breakaway': {
    line: 'Norwegian',
    label: 'Breakaway class',
    lengthM: 324,
    beamM: 39.7,
    ships: ['Norwegian Breakaway', 'Norwegian Getaway'],
  },
  'ncl-epic': {
    line: 'Norwegian',
    label: 'Epic class',
    lengthM: 329.5,
    beamM: 40.6,
    ships: ['Norwegian Epic'],
  },
  'ncl-jewel': {
    line: 'Norwegian',
    label: 'Jewel class',
    lengthM: 294,
    beamM: 32.2,
    ships: ['Norwegian Jewel', 'Norwegian Jade', 'Norwegian Pearl', 'Norwegian Gem'],
  },
  'ncl-dawn': {
    line: 'Norwegian',
    label: 'Dawn class',
    lengthM: 294,
    beamM: 32.2,
    ships: ['Norwegian Star', 'Norwegian Dawn'],
  },
  'ncl-sun': {
    line: 'Norwegian',
    label: 'Sun class',
    lengthM: 258,
    beamM: 32.3,
    ships: ['Norwegian Sun'],
  },
  'ncl-leo': {
    line: 'Norwegian',
    label: 'Leo class',
    lengthM: 268,
    beamM: 32.2,
    ships: ['Norwegian Spirit'],
  },
  'ncl-america': {
    line: 'Norwegian',
    label: 'Pride of America class',
    lengthM: 280.6,
    beamM: 32.2,
    ships: [{ name: 'Pride of America', strict: true }],
  },
};

export const SHIP_CLASS_IDS = Object.keys(FLEET_CLASSES) as ShipClassId[];

export function fleetShips(id: ShipClassId): FleetShip[] {
  return FLEET_CLASSES[id].ships.map((s) => (typeof s === 'string' ? { name: s } : s));
}

export interface FleetMatch {
  classId: ShipClassId;
  variant?: string;
}

/** AIS name field length. */
const AIS_NAME_LENGTH = 20;
/** Allowed deviation of reported length from the class length (Enchantment was lengthened 8%). */
const LENGTH_TOLERANCE = 0.12;
/** Simulated vessels (see shared/simulator.ts) use this MMSI range and a "SIM " name prefix. */
const SIM_MMSI_MIN = 999_990_000;

function normalizeName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

interface Entry extends FleetMatch {
  strict: boolean;
}

const BY_NAME = new Map<string, Entry>();
for (const classId of SHIP_CLASS_IDS) {
  for (const ship of fleetShips(classId)) {
    const entry: Entry = { classId, strict: ship.strict ?? false };
    if (ship.variant) entry.variant = ship.variant;
    const full = normalizeName(ship.name);
    if (BY_NAME.has(full)) throw new Error(`Duplicate fleet ship name: ${ship.name}`);
    BY_NAME.set(full, entry);
    const truncated = full.slice(0, AIS_NAME_LENGTH).trim();
    if (truncated !== full) BY_NAME.set(truncated, entry);
  }
}

/** Fleet class (and ship variant) of a vessel, or undefined if it is not a known fleet ship. */
export function fleetClassOf(v: Pick<Vessel, 'mmsi' | 'name' | 'shipType' | 'dimA' | 'dimB'>): FleetMatch | undefined {
  if (!v.name) return undefined;
  let name = normalizeName(v.name);
  if (v.mmsi >= SIM_MMSI_MIN && name.startsWith('SIM ')) name = name.slice(4);
  const entry = BY_NAME.get(name);
  if (!entry) return undefined;
  // Passenger ships report AIS type 60-69; reject anything clearly different.
  if (v.shipType !== undefined && (v.shipType < 60 || v.shipType > 69)) return undefined;
  const hasDims = v.dimA !== undefined && v.dimB !== undefined;
  if (entry.strict && !hasDims) return undefined;
  if (hasDims) {
    const length = v.dimA! + v.dimB!;
    const expected = FLEET_CLASSES[entry.classId].lengthM;
    if (Math.abs(length - expected) / expected > LENGTH_TOLERANCE) return undefined;
  }
  return entry.variant ? { classId: entry.classId, variant: entry.variant } : { classId: entry.classId };
}

/** "Carnival · Vista class" */
export function fleetLabel(match: FleetMatch): string {
  const info = FLEET_CLASSES[match.classId];
  return `${info.line} · ${info.label}`;
}
