/** Status readout, category filters and display toggles. */
import { categoryOf, CATEGORY_LABELS, VESSEL_CATEGORIES, type VesselCategory } from '../../shared/vessel.js';
import { BASEMAPS, type BasemapId, type Settings } from '../core/settings.js';
import type { SourceStatus, World } from '../core/world.js';
import { CATEGORY_COLORS, cssColor } from '../render/style.js';
import { el } from './dom.js';

export interface ControlPanelActions {
  onSettingsChange(patch: Partial<Settings>): void;
  onOpenSettings(): void;
}

function sourceLabel(status: SourceStatus): string {
  if (status.kind === 'simulator') return 'SIMULATED';
  const via = status.kind === 'relay' ? 'relay' : 'aisstream.io';
  return `${status.simulated ? 'SIMULATED' : 'LIVE'} · ${via}`;
}

export class ControlPanel {
  readonly element: HTMLElement;
  private readonly statusDot: HTMLElement;
  private readonly statusText: HTMLElement;
  private readonly statusDetail: HTMLElement;
  private readonly counts = new Map<VesselCategory, HTMLElement>();
  private readonly chips = new Map<VesselCategory, HTMLButtonElement>();
  private readonly countsLine: HTMLElement;

  constructor(
    private readonly world: World,
    settings: Settings,
    search: HTMLElement,
    actions: ControlPanelActions,
  ) {
    this.statusDot = el('span', { className: 'vv-dot' });
    this.statusText = el('span', { className: 'vv-status-text' });
    this.statusDetail = el('div', { className: 'vv-status-detail' });
    this.countsLine = el('div', { className: 'vv-counts' });

    const chipList = el('div', { className: 'vv-chips', role: 'group', 'aria-label': 'Vessel types' });
    for (const category of VESSEL_CATEGORIES) {
      const swatch = el('span', { className: 'vv-swatch' });
      swatch.style.background = cssColor(CATEGORY_COLORS[category]);
      const count = el('span', { className: 'vv-chip-count', text: '0' });
      const chip = el(
        'button',
        {
          type: 'button',
          className: 'vv-chip',
          'aria-pressed': 'true',
          title: `Show or hide ${CATEGORY_LABELS[category].toLowerCase()} vessels`,
          onclick: () => {
            if (this.world.visibleCategories.has(category)) this.world.visibleCategories.delete(category);
            else this.world.visibleCategories.add(category);
            chip.setAttribute('aria-pressed', String(this.world.visibleCategories.has(category)));
            this.world.emit('filters', undefined);
          },
        },
        [swatch, el('span', { text: CATEGORY_LABELS[category] }), count],
      );
      this.counts.set(category, count);
      this.chips.set(category, chip);
      chipList.append(chip);
    }

    const toggle = (label: string, checked: boolean, onChange: (v: boolean) => void) => {
      const input = el('input', { type: 'checkbox', checked });
      input.addEventListener('change', () => onChange(input.checked));
      return el('label', { className: 'vv-toggle' }, [input, el('span', { text: label })]);
    };

    const basemap = el('select', { 'aria-label': 'Base map' });
    for (const [id, { label }] of Object.entries(BASEMAPS)) {
      basemap.append(el('option', { value: id, text: label, selected: id === settings.basemap }));
    }
    basemap.addEventListener('change', () => actions.onSettingsChange({ basemap: basemap.value as BasemapId }));

    const details = el('details', { className: 'vv-filters', open: window.innerWidth > 640 }, [
      el('summary', { text: 'Filters & display' }),
      chipList,
      el('div', { className: 'vv-toggles' }, [
        toggle('Moving vessels only', false, (v) => {
          this.world.movingOnly = v;
          this.world.emit('filters', undefined);
        }),
        toggle('3D ship models when zoomed in', settings.models3d, (v) => actions.onSettingsChange({ models3d: v })),
        toggle('Ship names', settings.showLabels, (v) => actions.onSettingsChange({ showLabels: v })),
        toggle('Predict positions between reports', settings.deadReckoning, (v) =>
          actions.onSettingsChange({ deadReckoning: v }),
        ),
        el('label', { className: 'vv-select' }, [el('span', { text: 'Base map' }), basemap]),
      ]),
    ]);

    this.element = el('section', { className: 'vv-control', 'aria-label': 'VesselViewer' }, [
      el('header', { className: 'vv-brand' }, [
        el('h1', { text: 'VesselViewer' }),
        el('button', {
          type: 'button',
          className: 'vv-btn vv-btn-small',
          text: 'Data source',
          onclick: () => actions.onOpenSettings(),
        }),
      ]),
      el('div', { className: 'vv-status', role: 'status', 'aria-live': 'polite' }, [this.statusDot, this.statusText]),
      this.statusDetail,
      this.countsLine,
      search,
      details,
    ]);
  }

  renderStatus(status: SourceStatus): void {
    this.statusDot.dataset.state = status.state;
    this.statusText.textContent = `${sourceLabel(status)} · ${status.state}`;
    this.statusDetail.textContent = status.message ?? '';
    this.statusDetail.dataset.state = status.state;
  }

  renderCounts(inView: number): void {
    const status = this.world.status;
    const perCategory = new Map<VesselCategory, number>();
    for (const v of this.world.store.values()) {
      const c = categoryOf(v.shipType);
      perCategory.set(c, (perCategory.get(c) ?? 0) + 1);
    }
    for (const [category, node] of this.counts) {
      node.textContent = (perCategory.get(category) ?? 0).toLocaleString();
    }
    const total = status.totalVessels ?? this.world.store.size;
    const rate = status.messagesPerSecond !== undefined ? ` · ${status.messagesPerSecond.toLocaleString()} msg/s` : '';
    this.countsLine.textContent = `${inView.toLocaleString()} in view · ${total.toLocaleString()} tracked${rate}`;
  }
}
