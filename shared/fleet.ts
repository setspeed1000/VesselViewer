/**
 * Royal Caribbean International fleet (in service, October 2026) by class,
 * used to give these ships their class-specific 3D model.
 *
 * Ships are matched by AIS name. AIS names are limited to 20 characters, so
 * longer names ("INDEPENDENCE OF THE SEAS") arrive truncated; both forms
 * match. A reported length far from the class length rejects the match.
 */
import type { Vessel } from './vessel.js';

export type ShipClassId = 'icon' | 'oasis' | 'quantum' | 'freedom' | 'voyager' | 'radiance' | 'vision';

export interface ShipClassInfo {
  label: string;
  /** Typical overall length, metres. */
  lengthM: number;
  /** Waterline beam, metres. */
  beamM: number;
  /** Ships of the class currently sailing for Royal Caribbean. */
  ships: string[];
}

export const ROYAL_CARIBBEAN_CLASSES: Record<ShipClassId, ShipClassInfo> = {
  icon: {
    label: 'Icon class',
    lengthM: 365,
    beamM: 48.5,
    ships: ['Icon of the Seas', 'Star of the Seas', 'Legend of the Seas'],
  },
  oasis: {
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
  quantum: {
    label: 'Quantum class',
    lengthM: 348,
    beamM: 41.4,
    ships: ['Quantum of the Seas', 'Anthem of the Seas', 'Ovation of the Seas', 'Spectrum of the Seas', 'Odyssey of the Seas'],
  },
  freedom: {
    label: 'Freedom class',
    lengthM: 339,
    beamM: 38.6,
    ships: ['Freedom of the Seas', 'Liberty of the Seas', 'Independence of the Seas'],
  },
  voyager: {
    label: 'Voyager class',
    lengthM: 311,
    beamM: 38.6,
    ships: ['Voyager of the Seas', 'Explorer of the Seas', 'Adventure of the Seas', 'Navigator of the Seas', 'Mariner of the Seas'],
  },
  radiance: {
    label: 'Radiance class',
    lengthM: 293,
    beamM: 32.2,
    ships: ['Radiance of the Seas', 'Brilliance of the Seas', 'Serenade of the Seas', 'Jewel of the Seas'],
  },
  vision: {
    label: 'Vision class',
    lengthM: 279,
    beamM: 32.2,
    ships: ['Vision of the Seas', 'Rhapsody of the Seas', 'Grandeur of the Seas', 'Enchantment of the Seas'],
  },
};

export const SHIP_CLASS_IDS = Object.keys(ROYAL_CARIBBEAN_CLASSES) as ShipClassId[];

/** AIS name field length. */
const AIS_NAME_LENGTH = 20;
/** Allowed deviation of reported length from the class length (Enchantment was lengthened 8%). */
const LENGTH_TOLERANCE = 0.12;
/** Simulated vessels (see shared/simulator.ts) use this MMSI range and a "SIM " name prefix. */
const SIM_MMSI_MIN = 999_990_000;

function normalizeName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

const BY_NAME = new Map<string, ShipClassId>();
for (const id of SHIP_CLASS_IDS) {
  for (const ship of ROYAL_CARIBBEAN_CLASSES[id].ships) {
    const full = normalizeName(ship);
    BY_NAME.set(full, id);
    const truncated = full.slice(0, AIS_NAME_LENGTH).trim();
    if (truncated !== full) BY_NAME.set(truncated, id);
  }
}

/**
 * Royal Caribbean class of a vessel, or undefined if it is not one of the
 * fleet's ships (or its reported data contradicts the match).
 */
export function royalCaribbeanClassOf(
  v: Pick<Vessel, 'mmsi' | 'name' | 'shipType' | 'dimA' | 'dimB'>,
): ShipClassId | undefined {
  if (!v.name) return undefined;
  let name = normalizeName(v.name);
  if (v.mmsi >= SIM_MMSI_MIN && name.startsWith('SIM ')) name = name.slice(4);
  const id = BY_NAME.get(name);
  if (!id) return undefined;
  // Passenger ships report AIS type 60-69; reject anything clearly different.
  if (v.shipType !== undefined && (v.shipType < 60 || v.shipType > 69)) return undefined;
  if (v.dimA !== undefined && v.dimB !== undefined) {
    const length = v.dimA + v.dimB;
    const expected = ROYAL_CARIBBEAN_CLASSES[id].lengthM;
    if (Math.abs(length - expected) / expected > LENGTH_TOLERANCE) return undefined;
  }
  return id;
}
