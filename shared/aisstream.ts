/**
 * Normalises raw aisstream.io messages into typed vessel updates.
 *
 * Message shapes follow https://github.com/aisstream/ais-message-models.
 * Values reported as "not available" by AIS (lat 91, lon 181, SOG 102.3,
 * COG 360, heading 511, ROT -128, ...) are dropped rather than passed on.
 */
import type { Vessel, VesselEta } from './vessel.js';

/** Message types the server subscribes to. */
export const SUBSCRIBED_MESSAGE_TYPES = [
  'PositionReport',
  'StandardClassBPositionReport',
  'ExtendedClassBPositionReport',
  'ShipStaticData',
  'StaticDataReport',
] as const;

export interface PositionUpdate {
  kind: 'position';
  mmsi: number;
  aisClass: 'A' | 'B';
  time: number;
  lat: number;
  lon: number;
  sog?: number;
  cog?: number;
  heading?: number;
  rot?: number;
  navStatus?: number;
  /** Name from aisstream metadata, used only when no static name is known. */
  metaName?: string;
}

export type StaticFields = Pick<
  Vessel,
  | 'name'
  | 'callSign'
  | 'imo'
  | 'shipType'
  | 'destination'
  | 'eta'
  | 'draught'
  | 'dimA'
  | 'dimB'
  | 'dimC'
  | 'dimD'
>;

export interface StaticUpdate extends StaticFields {
  kind: 'static';
  mmsi: number;
  aisClass: 'A' | 'B';
  time: number;
}

export type VesselUpdate = PositionUpdate | StaticUpdate;

type Obj = Record<string, unknown>;

function isObj(x: unknown): x is Obj {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function num(x: unknown): number | undefined {
  return typeof x === 'number' && Number.isFinite(x) ? x : undefined;
}

function int(x: unknown): number | undefined {
  const n = num(x);
  return n !== undefined && Number.isInteger(n) ? n : undefined;
}

/** AIS 6-bit text: strip '@' padding, trim and collapse whitespace. */
export function cleanText(x: unknown): string | undefined {
  if (typeof x !== 'string') return undefined;
  const s = x.replace(/@/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > 0 ? s : undefined;
}

export function validMmsi(x: unknown): number | undefined {
  const n = int(x);
  return n !== undefined && n >= 1 && n <= 999_999_999 ? n : undefined;
}

function lat(x: unknown): number | undefined {
  const n = num(x);
  return n !== undefined && n >= -90 && n <= 90 ? n : undefined;
}

function lon(x: unknown): number | undefined {
  const n = num(x);
  return n !== undefined && n >= -180 && n <= 180 ? n : undefined;
}

function sog(x: unknown): number | undefined {
  const n = num(x);
  return n !== undefined && n >= 0 && n < 102.3 ? n : undefined;
}

function cog(x: unknown): number | undefined {
  const n = num(x);
  return n !== undefined && n >= 0 && n < 360 ? n : undefined;
}

function heading(x: unknown): number | undefined {
  const n = int(x);
  return n !== undefined && n >= 0 && n < 360 ? n : undefined;
}

function navStatus(x: unknown): number | undefined {
  const n = int(x);
  return n !== undefined && n >= 0 && n <= 14 ? n : undefined;
}

/**
 * Convert the raw AIS rate-of-turn indicator (-127..127) to degrees per minute.
 * ±127 means "turning faster than 5°/30 s, no turn indicator" and -128 means
 * not available; both are dropped because no rate can be derived from them.
 */
export function rateOfTurn(x: unknown): number | undefined {
  const raw = int(x);
  if (raw === undefined || raw < -126 || raw > 126) return undefined;
  const rot = Math.sign(raw) * (raw / 4.733) ** 2;
  return Math.round(rot * 10) / 10;
}

function dims(d: unknown): Pick<Vessel, 'dimA' | 'dimB' | 'dimC' | 'dimD'> {
  if (!isObj(d)) return {};
  const pick = (x: unknown, max: number) => {
    const n = int(x);
    return n !== undefined && n > 0 && n <= max ? n : undefined;
  };
  return { dimA: pick(d.A, 511), dimB: pick(d.B, 511), dimC: pick(d.C, 63), dimD: pick(d.D, 63) };
}

function shipType(x: unknown): number | undefined {
  const n = int(x);
  return n !== undefined && n >= 1 && n <= 99 ? n : undefined;
}

function imo(x: unknown): number | undefined {
  const n = int(x);
  return n !== undefined && n >= 1_000_000 && n <= 9_999_999 ? n : undefined;
}

function draught(x: unknown): number | undefined {
  const n = num(x);
  return n !== undefined && n > 0 && n <= 25.5 ? n : undefined;
}

function eta(x: unknown): VesselEta | undefined {
  if (!isObj(x)) return undefined;
  const month = int(x.Month);
  const day = int(x.Day);
  if (month === undefined || day === undefined || month < 1 || month > 12 || day < 1 || day > 31) {
    return undefined;
  }
  const hour = int(x.Hour);
  const minute = int(x.Minute);
  const result: VesselEta = { month, day };
  if (hour !== undefined && hour >= 0 && hour <= 23) {
    result.hour = hour;
    if (minute !== undefined && minute >= 0 && minute <= 59) result.minute = minute;
  }
  return result;
}

const TIME_RE = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?\s*(?:([+-])(\d{2}):?(\d{2})|Z|UTC)/;

/**
 * Parse aisstream's MetaData.time_utc, e.g. "2022-12-29 18:22:32.318353 +0000 UTC".
 * Returns epoch ms, or undefined if the string is not in a recognised form.
 */
export function parseAisTime(x: unknown): number | undefined {
  if (typeof x !== 'string') return undefined;
  const m = TIME_RE.exec(x.trim());
  if (!m) return undefined;
  const [, date, time, frac, sign, oh, om] = m;
  const ms = frac ? `.${frac.slice(0, 3).padEnd(3, '0')}` : '';
  const offset = sign ? `${sign}${oh}:${om}` : 'Z';
  const t = Date.parse(`${date}T${time}${ms}${offset}`);
  return Number.isFinite(t) ? t : undefined;
}

/** Reported times further than this from receipt are treated as bad clocks. */
const MAX_CLOCK_SKEW_MS = 10 * 60_000;

function messageTime(meta: Obj, receivedAt: number): number {
  const t = parseAisTime(meta.time_utc);
  if (t === undefined || Math.abs(receivedAt - t) > MAX_CLOCK_SKEW_MS) return receivedAt;
  return Math.min(t, receivedAt);
}

function stripUndefined<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) {
    if (o[k] === undefined) delete o[k];
  }
  return o;
}

function position(
  body: Obj,
  mmsi: number,
  aisClass: 'A' | 'B',
  time: number,
  metaName: string | undefined,
): PositionUpdate | undefined {
  const la = lat(body.Latitude);
  const lo = lon(body.Longitude);
  if (la === undefined || lo === undefined) return undefined;
  // 0,0 ("null island") is a common default from unconfigured GPS units.
  if (la === 0 && lo === 0) return undefined;
  return stripUndefined<PositionUpdate>({
    kind: 'position',
    mmsi,
    aisClass,
    time,
    lat: la,
    lon: lo,
    sog: sog(body.Sog),
    cog: cog(body.Cog),
    heading: heading(body.TrueHeading),
    rot: aisClass === 'A' ? rateOfTurn(body.RateOfTurn) : undefined,
    navStatus: aisClass === 'A' ? navStatus(body.NavigationalStatus) : undefined,
    metaName,
  });
}

/**
 * Parse one decoded aisstream JSON message. Returns zero or more updates;
 * unknown, invalid or irrelevant messages yield an empty array.
 */
export function parseAisStreamMessage(raw: unknown, receivedAt: number): VesselUpdate[] {
  if (!isObj(raw) || typeof raw.MessageType !== 'string' || !isObj(raw.Message)) return [];
  const type = raw.MessageType;
  const body = raw.Message[type];
  if (!isObj(body)) return [];
  if (body.Valid === false) return [];

  const meta = isObj(raw.MetaData) ? raw.MetaData : {};
  const mmsi = validMmsi(body.UserID) ?? validMmsi(meta.MMSI);
  if (mmsi === undefined) return [];
  const time = messageTime(meta, receivedAt);
  const metaName = cleanText(meta.ShipName);

  switch (type) {
    case 'PositionReport': {
      const p = position(body, mmsi, 'A', time, metaName);
      return p ? [p] : [];
    }
    case 'StandardClassBPositionReport': {
      const p = position(body, mmsi, 'B', time, metaName);
      return p ? [p] : [];
    }
    case 'ExtendedClassBPositionReport': {
      const out: VesselUpdate[] = [];
      const p = position(body, mmsi, 'B', time, metaName);
      if (p) out.push(p);
      const s = stripUndefined<StaticUpdate>({
        kind: 'static',
        mmsi,
        aisClass: 'B',
        time,
        name: cleanText(body.Name),
        shipType: shipType(body.Type),
        ...dims(body.Dimension),
      });
      if (Object.keys(s).length > 4) out.push(s);
      return out;
    }
    case 'ShipStaticData': {
      const s = stripUndefined<StaticUpdate>({
        kind: 'static',
        mmsi,
        aisClass: 'A',
        time,
        name: cleanText(body.Name),
        callSign: cleanText(body.CallSign),
        imo: imo(body.ImoNumber),
        shipType: shipType(body.Type),
        destination: cleanText(body.Destination),
        eta: eta(body.Eta),
        draught: draught(body.MaximumStaticDraught),
        ...dims(body.Dimension),
      });
      return Object.keys(s).length > 4 ? [s] : [];
    }
    case 'StaticDataReport': {
      // Class B static data arrives in two parts: A carries the name,
      // B carries type, call sign and dimensions.
      let fields: StaticFields = {};
      if (body.PartNumber === false && isObj(body.ReportA) && body.ReportA.Valid !== false) {
        fields = { name: cleanText(body.ReportA.Name) };
      } else if (body.PartNumber === true && isObj(body.ReportB) && body.ReportB.Valid !== false) {
        fields = {
          shipType: shipType(body.ReportB.ShipType),
          callSign: cleanText(body.ReportB.CallSign),
          ...dims(body.ReportB.Dimension),
        };
      }
      const s = stripUndefined<StaticUpdate>({ kind: 'static', mmsi, aisClass: 'B', time, ...fields });
      return Object.keys(s).length > 4 ? [s] : [];
    }
    default:
      return [];
  }
}
