import type { BBox } from '../../shared/geo.js';
import type { Vessel } from '../../shared/vessel.js';
import type { SourceKind } from '../core/settings.js';

/**
 * A live feed of vessel data. Implementations write into the shared World;
 * swap one for another (or add your own, e.g. a multiplayer game server)
 * without touching rendering or UI.
 */
export interface DataSource {
  readonly kind: SourceKind;
  start(): void;
  stop(): void;
  /** The map area the user is looking at (sources may use it to limit data). */
  setViewport(bbox: BBox): void;
  /** The vessel the user selected; sources keep it updated even off-screen. */
  setSelected(mmsi: number | null): void;
  /** Ask for a vessel's track history; arrives via the World `track` event. */
  requestTrack(mmsi: number): void;
  search(query: string): Promise<Vessel[]>;
}
