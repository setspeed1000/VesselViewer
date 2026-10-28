/**
 * In-memory vessel state. Used by the relay server and by the browser when it
 * reads AIS data directly (aisstream or the simulator).
 */
import type { StaticFields, StaticUpdate, PositionUpdate, VesselUpdate } from './aisstream.js';
import { bboxContains, distanceM, type BBox } from './geo.js';
import type { TrackPoint } from './protocol.js';
import type { Vessel } from './vessel.js';

export interface VesselStoreOptions {
  /** Vessels without a position fix for this long are removed by prune(). */
  ttlMs: number;
  /** Maximum points kept per vessel track. */
  maxTrackPoints?: number;
}

export interface StoreChanges {
  updated: number[];
  removed: number[];
}

/** A new track point is recorded once a vessel moved this far... */
const TRACK_MIN_DISTANCE_M = 100;
/** ...or this much time passed since the previous point. */
const TRACK_MIN_INTERVAL_MS = 60_000;
/** Static data received before a vessel's first position is held this long. */
const PENDING_STATIC_TTL_MS = 30 * 60_000;
const PENDING_STATIC_MAX = 100_000;

const STATIC_KEYS: (keyof StaticFields)[] = [
  'name',
  'callSign',
  'imo',
  'shipType',
  'destination',
  'eta',
  'draught',
  'dimA',
  'dimB',
  'dimC',
  'dimD',
];

export class VesselStore {
  private readonly vessels = new Map<number, Vessel>();
  private readonly tracks = new Map<number, TrackPoint[]>();
  private readonly pendingStatic = new Map<number, StaticUpdate>();
  private readonly dirty = new Set<number>();
  private readonly removedSinceTake = new Set<number>();
  private readonly ttlMs: number;
  private readonly maxTrackPoints: number;

  constructor(options: VesselStoreOptions) {
    this.ttlMs = options.ttlMs;
    this.maxTrackPoints = options.maxTrackPoints ?? 240;
  }

  get size(): number {
    return this.vessels.size;
  }

  get(mmsi: number): Vessel | undefined {
    return this.vessels.get(mmsi);
  }

  values(): IterableIterator<Vessel> {
    return this.vessels.values();
  }

  /** Apply a parsed AIS update. Returns true if stored state changed. */
  apply(update: VesselUpdate, now: number = Date.now()): boolean {
    return update.kind === 'position'
      ? this.applyPosition(update, now)
      : this.applyStatic(update, now);
  }

  /** Insert or replace a complete vessel record (e.g. received from a relay). */
  upsert(vessel: Vessel): void {
    const prev = this.vessels.get(vessel.mmsi);
    // Never let an older record overwrite a newer one.
    if (prev && prev.updated > vessel.updated && prev.positionTime >= vessel.positionTime) return;
    this.vessels.set(vessel.mmsi, vessel);
    if (!prev || prev.positionTime !== vessel.positionTime) {
      this.addTrackPoint(vessel.mmsi, vessel.lon, vessel.lat, vessel.positionTime);
    }
    this.markDirty(vessel.mmsi);
  }

  remove(mmsi: number): boolean {
    const existed = this.vessels.delete(mmsi);
    this.tracks.delete(mmsi);
    this.pendingStatic.delete(mmsi);
    if (existed) {
      this.dirty.delete(mmsi);
      this.removedSinceTake.add(mmsi);
    }
    return existed;
  }

  /** Drop vessels whose last position is older than the TTL. Returns removed MMSIs. */
  prune(now: number = Date.now()): number[] {
    const cutoff = now - this.ttlMs;
    const removed: number[] = [];
    for (const v of this.vessels.values()) {
      if (v.positionTime < cutoff) removed.push(v.mmsi);
    }
    for (const mmsi of removed) this.remove(mmsi);
    const staticCutoff = now - PENDING_STATIC_TTL_MS;
    for (const [mmsi, s] of this.pendingStatic) {
      if (s.time < staticCutoff) this.pendingStatic.delete(mmsi);
    }
    return removed;
  }

  /** MMSIs updated and removed since the previous call. */
  takeChanges(): StoreChanges {
    const changes = { updated: [...this.dirty], removed: [...this.removedSinceTake] };
    this.dirty.clear();
    this.removedSinceTake.clear();
    return changes;
  }

  inBBox(bbox: BBox): Vessel[] {
    const out: Vessel[] = [];
    for (const v of this.vessels.values()) {
      if (bboxContains(bbox, v.lon, v.lat)) out.push(v);
    }
    return out;
  }

  track(mmsi: number): TrackPoint[] {
    return this.tracks.get(mmsi) ?? [];
  }

  setTrack(mmsi: number, points: TrackPoint[]): void {
    if (!this.vessels.has(mmsi)) return;
    this.tracks.set(mmsi, points.slice(-this.maxTrackPoints));
  }

  /** Search by name, call sign, MMSI or IMO. Prefix matches rank first. */
  search(query: string, limit = 25): Vessel[] {
    const q = query.trim().toUpperCase();
    if (q.length < 2) return [];
    const isDigits = /^\d+$/.test(q);
    const prefix: Vessel[] = [];
    const contains: Vessel[] = [];
    for (const v of this.vessels.values()) {
      let rank = 0;
      if (isDigits) {
        const mmsi = String(v.mmsi);
        const imo = v.imo !== undefined ? String(v.imo) : '';
        if (mmsi.startsWith(q) || imo.startsWith(q)) rank = 2;
      } else {
        const name = v.name?.toUpperCase() ?? '';
        const call = v.callSign?.toUpperCase() ?? '';
        if (name.startsWith(q) || call.startsWith(q)) rank = 2;
        else if (name.includes(q)) rank = 1;
      }
      if (rank === 2) prefix.push(v);
      else if (rank === 1 && contains.length < limit) contains.push(v);
      if (prefix.length >= limit) break;
    }
    const byName = (a: Vessel, b: Vessel) => (a.name ?? '').localeCompare(b.name ?? '');
    return [...prefix.sort(byName), ...contains.sort(byName)].slice(0, limit);
  }

  private applyPosition(u: PositionUpdate, now: number): boolean {
    const prev = this.vessels.get(u.mmsi);
    if (prev && u.time < prev.positionTime) return false; // out-of-order duplicate

    const next: Vessel = {
      ...(prev ?? {}),
      mmsi: u.mmsi,
      lat: u.lat,
      lon: u.lon,
      aisClass: u.aisClass,
      positionTime: u.time,
      updated: now,
    };
    // Dynamic fields are replaced as a set: a value missing from the latest
    // report must not linger from an older one.
    delete next.sog;
    delete next.cog;
    delete next.heading;
    delete next.rot;
    delete next.navStatus;
    if (u.sog !== undefined) next.sog = u.sog;
    if (u.cog !== undefined) next.cog = u.cog;
    if (u.heading !== undefined) next.heading = u.heading;
    if (u.rot !== undefined) next.rot = u.rot;
    if (u.navStatus !== undefined) next.navStatus = u.navStatus;

    if (!prev) {
      const pending = this.pendingStatic.get(u.mmsi);
      if (pending) {
        mergeStatic(next, pending);
        this.pendingStatic.delete(u.mmsi);
      }
    }
    if (next.name === undefined && u.metaName !== undefined) next.name = u.metaName;

    if (prev && samePosition(prev, next)) return false;
    this.vessels.set(u.mmsi, next);
    this.addTrackPoint(u.mmsi, u.lon, u.lat, u.time);
    this.markDirty(u.mmsi);
    return true;
  }

  private applyStatic(u: StaticUpdate, now: number): boolean {
    const prev = this.vessels.get(u.mmsi);
    if (!prev) {
      const pending = this.pendingStatic.get(u.mmsi);
      if (pending) {
        mergeStatic(pending, u);
        pending.time = Math.max(pending.time, u.time);
      } else if (this.pendingStatic.size < PENDING_STATIC_MAX) {
        this.pendingStatic.set(u.mmsi, { ...u });
      }
      return false;
    }
    const next: Vessel = { ...prev };
    mergeStatic(next, u);
    if (!STATIC_KEYS.some((k) => !sameValue(prev[k], next[k]))) return false;
    next.updated = now;
    this.vessels.set(u.mmsi, next);
    this.markDirty(u.mmsi);
    return true;
  }

  private addTrackPoint(mmsi: number, lon: number, lat: number, t: number): void {
    let track = this.tracks.get(mmsi);
    if (!track) {
      track = [];
      this.tracks.set(mmsi, track);
    }
    const last = track[track.length - 1];
    if (last) {
      if (t <= last[2]) return;
      const moved = distanceM(last[0], last[1], lon, lat);
      if (moved < TRACK_MIN_DISTANCE_M && t - last[2] < TRACK_MIN_INTERVAL_MS) return;
      // A stationary vessel only needs its latest timestamp, not a new point.
      if (moved < TRACK_MIN_DISTANCE_M && track.length >= 2) {
        const prev = track[track.length - 2]!;
        if (distanceM(prev[0], prev[1], last[0], last[1]) < TRACK_MIN_DISTANCE_M) {
          track[track.length - 1] = [lon, lat, t];
          return;
        }
      }
    }
    track.push([lon, lat, t]);
    if (track.length > this.maxTrackPoints) track.splice(0, track.length - this.maxTrackPoints);
  }

  private markDirty(mmsi: number): void {
    this.dirty.add(mmsi);
    this.removedSinceTake.delete(mmsi);
  }
}

function mergeStatic(target: StaticFields, src: StaticFields): void {
  for (const k of STATIC_KEYS) {
    const value = src[k];
    if (value !== undefined) (target as Record<string, unknown>)[k] = value;
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'object' && typeof b === 'object' && a && b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

function samePosition(a: Vessel, b: Vessel): boolean {
  return (
    a.lat === b.lat &&
    a.lon === b.lon &&
    a.positionTime === b.positionTime &&
    a.sog === b.sog &&
    a.cog === b.cog &&
    a.heading === b.heading &&
    a.rot === b.rot &&
    a.navStatus === b.navStatus &&
    a.aisClass === b.aisClass &&
    a.name === b.name
  );
}
