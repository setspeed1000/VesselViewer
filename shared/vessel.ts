/**
 * Core vessel model shared by the server and the browser client.
 *
 * Every optional field is omitted (not null) when the value is unknown or was
 * reported as "not available" by the transponder, so JSON payloads stay small.
 */
export interface Vessel {
  /** Maritime Mobile Service Identity (9 digits). Primary key. */
  mmsi: number;
  /** Latitude in decimal degrees, WGS84. */
  lat: number;
  /** Longitude in decimal degrees, WGS84. */
  lon: number;
  /** Speed over ground in knots. */
  sog?: number;
  /** Course over ground in degrees true, [0, 360). */
  cog?: number;
  /** True heading in degrees, [0, 360). */
  heading?: number;
  /** Rate of turn in degrees per minute (positive = turning to starboard). */
  rot?: number;
  /** AIS navigational status code (0-14, see NAV_STATUS_LABELS). */
  navStatus?: number;
  name?: string;
  callSign?: string;
  /** IMO number (7 digits). */
  imo?: number;
  /** AIS ship and cargo type code (ITU-R M.1371, 1-99). */
  shipType?: number;
  destination?: string;
  /** Estimated time of arrival as reported (UTC, no year). */
  eta?: VesselEta;
  /** Maximum present static draught in metres. */
  draught?: number;
  /** Distance from the GPS reference point to the bow, metres. */
  dimA?: number;
  /** Distance from the GPS reference point to the stern, metres. */
  dimB?: number;
  /** Distance from the GPS reference point to port, metres. */
  dimC?: number;
  /** Distance from the GPS reference point to starboard, metres. */
  dimD?: number;
  /** Transponder class. Class A = commercial/SOLAS, class B = small craft. */
  aisClass: 'A' | 'B';
  /** Epoch ms (server clock) of the position fix currently stored. */
  positionTime: number;
  /** Epoch ms (server clock) of the last change to any field. */
  updated: number;
}

export interface VesselEta {
  month: number;
  day: number;
  hour?: number;
  minute?: number;
}

/** Broad vessel categories used for colouring, filtering and 3D model choice. */
export type VesselCategory =
  | 'cargo'
  | 'tanker'
  | 'passenger'
  | 'fishing'
  | 'tug'
  | 'pleasure'
  | 'highspeed'
  | 'government'
  | 'other'
  | 'unknown';

export const VESSEL_CATEGORIES: readonly VesselCategory[] = [
  'cargo',
  'tanker',
  'passenger',
  'fishing',
  'tug',
  'pleasure',
  'highspeed',
  'government',
  'other',
  'unknown',
];

export const CATEGORY_LABELS: Record<VesselCategory, string> = {
  cargo: 'Cargo',
  tanker: 'Tanker',
  passenger: 'Passenger',
  fishing: 'Fishing',
  tug: 'Tug / Service',
  pleasure: 'Sailing / Pleasure',
  highspeed: 'High-speed craft',
  government: 'Military / Law / SAR',
  other: 'Other',
  unknown: 'Unknown',
};

/** Map an AIS ship type code (ITU-R M.1371 table 53) to a category. */
export function categoryOf(shipType: number | undefined): VesselCategory {
  if (shipType === undefined || shipType <= 0 || shipType > 99) return 'unknown';
  if (shipType >= 70 && shipType <= 79) return 'cargo';
  if (shipType >= 80 && shipType <= 89) return 'tanker';
  if (shipType >= 60 && shipType <= 69) return 'passenger';
  if (shipType >= 40 && shipType <= 49) return 'highspeed';
  if (shipType >= 20 && shipType <= 29) return 'highspeed'; // wing in ground
  if (shipType >= 90 && shipType <= 99) return 'other';
  switch (shipType) {
    case 30:
      return 'fishing';
    case 31: // towing
    case 32: // towing, length > 200 m or breadth > 25 m
    case 33: // dredging or underwater operations
    case 34: // diving operations
    case 50: // pilot vessel
    case 52: // tug
    case 53: // port tender
    case 54: // anti-pollution equipment
    case 58: // medical transport
      return 'tug';
    case 35: // military operations
    case 51: // search and rescue
    case 55: // law enforcement
      return 'government';
    case 36: // sailing
    case 37: // pleasure craft
      return 'pleasure';
    default:
      return shipType < 20 ? 'unknown' : 'other';
  }
}

const SHIP_TYPE_SPECIFIC: Record<number, string> = {
  30: 'Fishing',
  31: 'Towing',
  32: 'Towing (large)',
  33: 'Dredging / underwater ops',
  34: 'Diving ops',
  35: 'Military ops',
  36: 'Sailing',
  37: 'Pleasure craft',
  50: 'Pilot vessel',
  51: 'Search and rescue',
  52: 'Tug',
  53: 'Port tender',
  54: 'Anti-pollution',
  55: 'Law enforcement',
  56: 'Spare (local use)',
  57: 'Spare (local use)',
  58: 'Medical transport',
  59: 'Non-combatant (RR Res. 18)',
};

const SHIP_TYPE_DECADE: Record<number, string> = {
  2: 'Wing in ground',
  4: 'High-speed craft',
  6: 'Passenger',
  7: 'Cargo',
  8: 'Tanker',
  9: 'Other',
};

/** Human-readable AIS ship type, e.g. "Cargo (hazardous A)". */
export function shipTypeLabel(shipType: number | undefined): string {
  if (shipType === undefined || shipType <= 0 || shipType > 99) return 'Unknown';
  const specific = SHIP_TYPE_SPECIFIC[shipType];
  if (specific) return specific;
  const decade = Math.floor(shipType / 10);
  const base = SHIP_TYPE_DECADE[decade];
  if (!base) return `Reserved (${shipType})`;
  const digit = shipType % 10;
  const hazard = ['', ' (hazardous A)', ' (hazardous B)', ' (hazardous C)', ' (hazardous D)'][digit];
  return base + (hazard ?? '');
}

export const NAV_STATUS_LABELS: Record<number, string> = {
  0: 'Under way using engine',
  1: 'At anchor',
  2: 'Not under command',
  3: 'Restricted manoeuvrability',
  4: 'Constrained by draught',
  5: 'Moored',
  6: 'Aground',
  7: 'Engaged in fishing',
  8: 'Under way sailing',
  9: 'Reserved (HSC)',
  10: 'Reserved (WIG)',
  11: 'Towing astern',
  12: 'Pushing ahead / towing alongside',
  13: 'Reserved',
  14: 'AIS-SART / MOB / EPIRB active',
};

export function navStatusLabel(navStatus: number | undefined): string {
  if (navStatus === undefined) return 'Not defined';
  return NAV_STATUS_LABELS[navStatus] ?? 'Not defined';
}

/** Overall length in metres, if the transponder reports it. */
export function vesselLength(v: Pick<Vessel, 'dimA' | 'dimB'>): number | undefined {
  const len = (v.dimA ?? 0) + (v.dimB ?? 0);
  return len > 0 ? len : undefined;
}

/** Overall beam in metres, if the transponder reports it. */
export function vesselBeam(v: Pick<Vessel, 'dimC' | 'dimD'>): number | undefined {
  const beam = (v.dimC ?? 0) + (v.dimD ?? 0);
  return beam > 0 ? beam : undefined;
}

/**
 * Direction the vessel's bow points, in degrees true. Uses true heading when
 * reported, otherwise course over ground while making way.
 */
export function vesselBearing(v: Pick<Vessel, 'heading' | 'cog' | 'sog'>): number | undefined {
  if (v.heading !== undefined) return v.heading;
  if (v.cog !== undefined && (v.sog ?? 0) >= MOVING_SOG_KNOTS) return v.cog;
  return undefined;
}

/** Speed above which a vessel is considered to be making way. */
export const MOVING_SOG_KNOTS = 0.5;

export function isMoving(v: Pick<Vessel, 'sog'>): boolean {
  return (v.sog ?? 0) >= MOVING_SOG_KNOTS;
}
