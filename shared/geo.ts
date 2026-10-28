/** Geographic helpers shared by server and client. Coordinates are WGS84 degrees. */

export const EARTH_RADIUS_M = 6_371_008.8;
export const KNOTS_TO_MS = 1852 / 3600;

const DEG = Math.PI / 180;

/** [west, south, east, north]. When west > east the box crosses the antimeridian. */
export type BBox = [number, number, number, number];

export const WORLD_BBOX: BBox = [-180, -90, 180, 90];

/** Wrap a longitude into [-180, 180). */
export function wrapLon(lon: number): number {
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
  return wrapped;
}

/**
 * Normalise a bounding box coming from a map view, which may extend past
 * ±180° longitude when the view is wrapped or zoomed far out.
 */
export function normalizeBBox(bbox: BBox): BBox {
  let [west, south, east, north] = bbox;
  south = Math.max(-90, Math.min(90, south));
  north = Math.max(-90, Math.min(90, north));
  if (south > north) [south, north] = [north, south];
  if (!(east - west < 360)) return [-180, south, 180, north];
  west = wrapLon(west);
  east = wrapLon(east);
  // A box exactly ending on the antimeridian wraps to -180; keep it at +180.
  if (east === -180 && bbox[2] > bbox[0]) east = 180;
  return [west, south, east, north];
}

export function bboxContains(bbox: BBox, lon: number, lat: number): boolean {
  const [west, south, east, north] = bbox;
  if (lat < south || lat > north) return false;
  if (west <= east) return lon >= west && lon <= east;
  return lon >= west || lon <= east;
}

/** Expand a box by a fraction of its size on each side (for prefetching). */
export function padBBox(bbox: BBox, fraction: number): BBox {
  const [west, south, east, north] = bbox;
  const width = west <= east ? east - west : 360 - west + east;
  const height = north - south;
  const padX = width * fraction;
  const padY = height * fraction;
  if (width + 2 * padX >= 360) {
    return [-180, Math.max(-90, south - padY), 180, Math.min(90, north + padY)];
  }
  return normalizeBBox([west - padX, south - padY, west + width + padX, north + padY]);
}

/** Great-circle distance in metres. */
export function distanceM(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const p1 = lat1 * DEG;
  const p2 = lat2 * DEG;
  const dp = (lat2 - lat1) * DEG;
  const dl = (lon2 - lon1) * DEG;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial great-circle bearing from point 1 to point 2, degrees true [0, 360). */
export function initialBearing(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const p1 = lat1 * DEG;
  const p2 = lat2 * DEG;
  const dl = (lon2 - lon1) * DEG;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) / DEG) + 360) % 360;
}

/** Point reached travelling `distance` metres from a start point on `bearing` degrees true. */
export function destinationPoint(
  lon: number,
  lat: number,
  bearingDeg: number,
  distance: number,
): [number, number] {
  const delta = distance / EARTH_RADIUS_M;
  const theta = bearingDeg * DEG;
  const p1 = lat * DEG;
  const l1 = lon * DEG;
  const sinP2 = Math.sin(p1) * Math.cos(delta) + Math.cos(p1) * Math.sin(delta) * Math.cos(theta);
  const p2 = Math.asin(Math.max(-1, Math.min(1, sinP2)));
  const l2 =
    l1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(p1),
      Math.cos(delta) - Math.sin(p1) * Math.sin(p2),
    );
  return [wrapLon(l2 / DEG), p2 / DEG];
}

/** Maximum time a position is extrapolated forward. */
export const MAX_DEAD_RECKONING_MS = 3 * 60_000;

/**
 * Dead-reckon a vessel forward from its last fix using speed and course over
 * ground. Returns the reported position unchanged when the vessel is not
 * making way or the course is unknown. Extrapolation stops after
 * MAX_DEAD_RECKONING_MS so a vessel that goes silent does not sail on forever.
 */
export function deadReckon(
  v: { lon: number; lat: number; sog?: number; cog?: number; positionTime: number },
  nowMs: number,
): [number, number] {
  const dtMs = Math.min(nowMs - v.positionTime, MAX_DEAD_RECKONING_MS);
  if (v.sog === undefined || v.cog === undefined || v.sog < 0.5 || v.sog > 60 || dtMs <= 0) {
    return [v.lon, v.lat];
  }
  return destinationPoint(v.lon, v.lat, v.cog, v.sog * KNOTS_TO_MS * (dtMs / 1000));
}
