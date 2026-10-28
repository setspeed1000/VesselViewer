/**
 * Client-side world state: every known vessel, the current selection and
 * filters. Data sources write into it; renderers, UI and plugins read from it
 * and subscribe to its events. This is the integration point for game logic.
 */
import { deadReckon } from '../../shared/geo.js';
import type { TrackPoint, UpstreamState } from '../../shared/protocol.js';
import { VesselStore } from '../../shared/store.js';
import { categoryOf, VESSEL_CATEGORIES, type Vessel, type VesselCategory } from '../../shared/vessel.js';
import { Emitter } from './emitter.js';
import type { SourceKind } from './settings.js';

export interface SourceStatus {
  kind: SourceKind;
  state: UpstreamState;
  /** True when the vessels are synthetic (simulator, or a relay running one). */
  simulated: boolean;
  /** Human-readable detail, e.g. an error from aisstream. */
  message?: string;
  messagesPerSecond?: number;
  /** Vessels tracked by the source (a relay may know more than this client holds). */
  totalVessels?: number;
}

export interface WorldEvents {
  /** Vessel data changed (batched; fired at most once per animation frame). */
  vessels: void;
  /** Selected vessel changed. */
  selection: number | null;
  /** A vessel's track history arrived or changed. */
  track: number;
  /** Data source connection status changed. */
  status: SourceStatus;
  /** Category filter or other view options changed. */
  filters: void;
}

/** Default vessel lifetime without a position report. */
export const DEFAULT_TTL_MS = 60 * 60_000;

export class World extends Emitter<WorldEvents> {
  readonly store = new VesselStore({ ttlMs: DEFAULT_TTL_MS });
  selected: number | null = null;
  readonly visibleCategories = new Set<VesselCategory>(VESSEL_CATEGORIES);
  movingOnly = false;
  deadReckoning = true;
  status: SourceStatus = { kind: 'simulator', state: 'disconnected', simulated: true };
  /** Incremented whenever vessel data changes; usable as a render trigger. */
  version = 0;
  /** Server clock minus browser clock, for sources whose times come from a server. */
  clockOffsetMs = 0;
  private pendingNotify = false;

  /** Current time on the clock that vessel timestamps use. */
  now(): number {
    return Date.now() + this.clockOffsetMs;
  }

  /** Call after mutating `store`; coalesces into one `vessels` event per frame. */
  notifyVessels(): void {
    this.version++;
    if (this.pendingNotify) return;
    this.pendingNotify = true;
    const fire = () => {
      this.pendingNotify = false;
      this.emit('vessels', undefined);
    };
    if (typeof requestAnimationFrame === 'function' && document.visibilityState === 'visible') {
      requestAnimationFrame(fire);
    } else {
      setTimeout(fire, 250);
    }
  }

  select(mmsi: number | null): void {
    if (this.selected === mmsi) return;
    this.selected = mmsi;
    this.emit('selection', mmsi);
  }

  setTrack(mmsi: number, points: TrackPoint[]): void {
    this.store.setTrack(mmsi, points);
    this.emit('track', mmsi);
  }

  setStatus(status: SourceStatus): void {
    this.status = status;
    this.emit('status', status);
  }

  /** Remove all vessels (e.g. when switching data source). */
  clear(): void {
    for (const v of [...this.store.values()]) this.store.remove(v.mmsi);
    this.store.takeChanges();
    this.select(null);
    this.notifyVessels();
  }

  isVisible(v: Vessel): boolean {
    if (!this.visibleCategories.has(categoryOf(v.shipType))) return false;
    if (this.movingOnly && (v.sog ?? 0) < 0.5) return false;
    return true;
  }

  /** Best estimate of where a vessel is right now. */
  positionOf(v: Vessel, now = this.now()): [number, number] {
    return this.deadReckoning ? deadReckon(v, now) : [v.lon, v.lat];
  }
}
