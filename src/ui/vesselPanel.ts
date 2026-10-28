import {
  categoryOf,
  CATEGORY_LABELS,
  navStatusLabel,
  shipTypeLabel,
  vesselBeam,
  vesselBearing,
  vesselLength,
  type Vessel,
} from '../../shared/vessel.js';
import type { World } from '../core/world.js';
import { CATEGORY_COLORS, cssColor } from '../render/style.js';
import { clear, el, formatAge, formatLatLon } from './dom.js';

export interface VesselPanelActions {
  onClose(): void;
  onFollow(follow: boolean): void;
  onView3d(): void;
  onZoomTo(): void;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function etaText(v: Vessel): string | undefined {
  if (!v.eta) return undefined;
  const { month, day, hour, minute } = v.eta;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const time = hour !== undefined ? ` ${pad2(hour)}:${pad2(minute ?? 0)} UTC` : '';
  return `${day} ${months[month - 1]}${time}`;
}

export class VesselPanel {
  readonly element: HTMLElement;
  private readonly body: HTMLElement;
  private readonly title: HTMLElement;
  private readonly subtitle: HTMLElement;
  private readonly swatch: HTMLElement;
  private readonly followBtn: HTMLButtonElement;
  private following = false;

  constructor(
    private readonly world: World,
    actions: VesselPanelActions,
  ) {
    this.swatch = el('span', { className: 'vv-swatch' });
    this.title = el('h2', { className: 'vv-panel-title' });
    this.subtitle = el('div', { className: 'vv-panel-subtitle' });
    this.body = el('div', { className: 'vv-panel-body' });
    this.followBtn = el('button', {
      type: 'button',
      className: 'vv-btn',
      text: 'Follow',
      'aria-pressed': 'false',
      onclick: () => actions.onFollow(!this.following),
    });
    this.element = el('aside', { className: 'vv-panel', 'aria-label': 'Vessel details', hidden: true }, [
      el('header', { className: 'vv-panel-header' }, [
        this.swatch,
        el('div', { className: 'vv-panel-heading' }, [this.title, this.subtitle]),
        el('button', {
          type: 'button',
          className: 'vv-icon-btn',
          'aria-label': 'Close',
          text: '×',
          onclick: () => actions.onClose(),
        }),
      ]),
      el('div', { className: 'vv-panel-actions' }, [
        el('button', { type: 'button', className: 'vv-btn', text: 'Zoom to', onclick: () => actions.onZoomTo() }),
        this.followBtn,
        el('button', {
          type: 'button',
          className: 'vv-btn vv-btn-primary',
          text: 'View in 3D',
          onclick: () => actions.onView3d(),
        }),
      ]),
      this.body,
    ]);
  }

  setFollowing(following: boolean): void {
    this.following = following;
    this.followBtn.setAttribute('aria-pressed', String(following));
    this.followBtn.textContent = following ? 'Following' : 'Follow';
  }

  /** Re-render for the currently selected vessel (or hide). */
  update(): void {
    const mmsi = this.world.selected;
    const v = mmsi !== null ? this.world.store.get(mmsi) : undefined;
    if (!v) {
      this.element.hidden = true;
      return;
    }
    this.element.hidden = false;
    const category = categoryOf(v.shipType);
    this.swatch.style.background = cssColor(CATEGORY_COLORS[category]);
    this.title.textContent = v.name ?? `MMSI ${v.mmsi}`;
    const typeLabel = shipTypeLabel(v.shipType);
    const parts = [typeLabel];
    if (!typeLabel.startsWith(CATEGORY_LABELS[category])) parts.push(CATEGORY_LABELS[category]);
    parts.push(`Class ${v.aisClass}`);
    this.subtitle.textContent = parts.join(' · ');

    const now = this.world.now();
    const length = vesselLength(v);
    const beam = vesselBeam(v);
    const bearing = vesselBearing(v);
    const rows: [string, string | undefined][] = [
      ['Status', v.aisClass === 'A' ? navStatusLabel(v.navStatus) : undefined],
      ['Speed', v.sog !== undefined ? `${v.sog.toFixed(1)} kn (${(v.sog * 1.852).toFixed(1)} km/h)` : undefined],
      ['Course', v.cog !== undefined ? `${v.cog.toFixed(1)}°` : undefined],
      ['Heading', v.heading !== undefined ? `${v.heading}°` : bearing !== undefined ? `${bearing.toFixed(0)}° (from course)` : undefined],
      ['Turn rate', v.rot !== undefined && v.rot !== 0 ? `${Math.abs(v.rot).toFixed(1)}°/min ${v.rot > 0 ? 'starboard' : 'port'}` : undefined],
      ['Destination', v.destination],
      ['ETA', etaText(v)],
      ['Size', length !== undefined ? `${length} m × ${beam ?? '?'} m` : undefined],
      ['Draught', v.draught !== undefined ? `${v.draught.toFixed(1)} m` : undefined],
      ['MMSI', String(v.mmsi)],
      ['IMO', v.imo !== undefined ? String(v.imo) : undefined],
      ['Call sign', v.callSign],
      ['Position', formatLatLon(v.lat, v.lon)],
      ['Last report', formatAge(now - v.positionTime)],
    ];
    clear(this.body);
    const dl = el('dl', { className: 'vv-facts' });
    for (const [label, value] of rows) {
      if (value === undefined) continue;
      dl.append(el('dt', { text: label }), el('dd', { text: value }));
    }
    this.body.append(dl);
  }
}
