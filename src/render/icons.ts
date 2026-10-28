/**
 * Ship icons drawn at runtime into a single atlas, so the site needs no image
 * assets. Icons are white masks tinted per vessel; "up" in each icon is the bow.
 */
export type IconName = 'arrow' | 'hull' | 'dot';

const CELL = 64;

export interface IconMappingEntry {
  x: number;
  y: number;
  width: number;
  height: number;
  mask: boolean;
}

export const ICON_MAPPING: Record<IconName, IconMappingEntry> = {
  arrow: { x: 0, y: 0, width: CELL, height: CELL, mask: true },
  hull: { x: CELL, y: 0, width: CELL, height: CELL, mask: true },
  dot: { x: CELL * 2, y: 0, width: CELL, height: CELL, mask: true },
};

/** Icon height in pixels on screen. */
export const ICON_SIZE: Record<IconName, number> = { arrow: 22, hull: 18, dot: 12 };

export function createIconAtlas(): string {
  const canvas = document.createElement('canvas');
  canvas.width = CELL * 3;
  canvas.height = CELL;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';

  // Moving vessel: arrowhead pointing along the course.
  ctx.beginPath();
  ctx.moveTo(32, 4);
  ctx.lineTo(54, 58);
  ctx.lineTo(32, 45);
  ctx.lineTo(10, 58);
  ctx.closePath();
  ctx.fill();

  // Stationary vessel with a known heading: plan-view hull.
  ctx.beginPath();
  ctx.moveTo(CELL + 32, 4);
  ctx.lineTo(CELL + 47, 22);
  ctx.lineTo(CELL + 47, 60);
  ctx.lineTo(CELL + 17, 60);
  ctx.lineTo(CELL + 17, 22);
  ctx.closePath();
  ctx.fill();

  // Unknown heading: dot.
  ctx.beginPath();
  ctx.arc(CELL * 2 + 32, 32, 20, 0, Math.PI * 2);
  ctx.fill();

  return canvas.toDataURL('image/png');
}
