import type { VesselCategory } from '../../shared/vessel.js';

export type RGB = [number, number, number];

/** Category colours, chosen to stay distinct on light and colourful basemaps. */
export const CATEGORY_COLORS: Record<VesselCategory, RGB> = {
  cargo: [46, 158, 68],
  tanker: [215, 38, 61],
  passenger: [43, 108, 217],
  fishing: [232, 139, 26],
  tug: [18, 164, 168],
  pleasure: [201, 58, 184],
  highspeed: [196, 160, 0],
  government: [61, 61, 143],
  other: [110, 110, 110],
  unknown: [150, 150, 150],
};

export function cssColor([r, g, b]: RGB): string {
  return `rgb(${r}, ${g}, ${b})`;
}

/** Typical overall length by category, used when a vessel does not report dimensions. */
export const DEFAULT_LENGTH_M: Record<VesselCategory, number> = {
  cargo: 180,
  tanker: 180,
  passenger: 150,
  fishing: 25,
  tug: 30,
  pleasure: 12,
  highspeed: 40,
  government: 90,
  other: 50,
  unknown: 30,
};
