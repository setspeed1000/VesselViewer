/**
 * Application shell: wires the World, the active data source, the map and UI
 * together, and exposes a small API for plugins (see plugins/types.ts).
 */
import type { Layer, PickingInfo } from '@deck.gl/core';
import { bboxContains } from '../shared/geo.js';
import { categoryOf, CATEGORY_LABELS, type Vessel } from '../shared/vessel.js';
import {
  BASEMAPS,
  BUILD_ENCRYPTED_KEY,
  hasStoredSettings,
  loadSettings,
  saveSettings,
  type Settings,
} from './core/settings.js';
import { World } from './core/world.js';
import { MapView } from './map/mapView.js';
import type { AppPlugin } from './plugins/types.js';
import {
  buildBaseLayers,
  buildRenderShips,
  MESH_MIN_ZOOM,
  pickedVessel,
  type RenderContext,
} from './render/layers.js';
import { createDirectSource, createSimulatorSource } from './sources/localSource.js';
import { createRelaySource } from './sources/relaySource.js';
import type { DataSource } from './sources/types.js';
import { ControlPanel } from './ui/controlPanel.js';
import { el } from './ui/dom.js';
import { SearchBox } from './ui/searchBox.js';
import { SettingsDialog } from './ui/settingsDialog.js';
import { VesselPanel } from './ui/vesselPanel.js';

/** Minimum time between layer rebuilds. */
const RENDER_INTERVAL_MS = 200;
/** Dead-reckoned positions are refreshed this often. */
const MOTION_INTERVAL_MS = 1_000;

export class App {
  readonly world = new World();
  readonly mapView: MapView;
  settings: Settings;
  source: DataSource | undefined;
  following = false;
  /** The context of the most recent render, for plugins and debugging. */
  lastContext: RenderContext | undefined;

  private readonly plugins: AppPlugin[] = [];
  private readonly pluginCleanups = new Map<string, () => void>();
  private readonly panel: VesselPanel;
  private readonly controls: ControlPanel;
  private readonly settingsDialog: SettingsDialog;
  private readonly banner: HTMLElement;
  private readonly basemapNotice: HTMLElement;
  private renderQueued = false;
  private lastRender = 0;

  constructor(root: HTMLElement) {
    const firstVisit = !hasStoredSettings();
    this.settings = loadSettings();
    this.world.deadReckoning = this.settings.deadReckoning;

    const mapContainer = el('div', { className: 'vv-map' });
    this.basemapNotice = el('div', { className: 'vv-notice', hidden: true });
    this.banner = el('div', { className: 'vv-banner', hidden: true }, [
      el('span', { text: 'Showing simulated ships, not real vessels.' }),
      el('button', {
        type: 'button',
        className: 'vv-btn vv-btn-small vv-btn-primary',
        text: BUILD_ENCRYPTED_KEY ? 'Unlock live AIS' : 'Connect live AIS',
        onclick: () => (BUILD_ENCRYPTED_KEY ? this.settingsDialog.openUnlock() : this.settingsDialog.open()),
      }),
    ]);

    this.panel = new VesselPanel(this.world, {
      onClose: () => this.select(null),
      onFollow: (follow) => this.setFollowing(follow),
      onZoomTo: () => {
        const v = this.selectedVessel();
        if (v) this.mapView.flyToVessel(...this.world.positionOf(v), Math.max(this.mapView.zoom, 13));
      },
      onView3d: () => this.viewSelectedIn3d(),
    });

    const search = new SearchBox(
      (q) => this.source?.search(q) ?? Promise.resolve([]),
      (v) => this.focusVessel(v),
    );
    this.settingsDialog = new SettingsDialog(
      () => this.settings,
      (patch) => this.updateSettings(patch),
    );
    this.controls = new ControlPanel(this.world, this.settings, search.element, {
      onSettingsChange: (patch) => this.updateSettings(patch),
      onOpenSettings: () => this.settingsDialog.open(),
    });

    root.append(
      mapContainer,
      this.controls.element,
      this.panel.element,
      this.banner,
      this.basemapNotice,
      this.settingsDialog.element,
      attribution(),
    );

    this.mapView = new MapView({
      container: mapContainer,
      styleUrl: BASEMAPS[this.settings.basemap].url,
      onClick: (info) => this.handleClick(info),
      getTooltip: (info) => tooltipText(pickedVessel(info)),
      onBasemapError: (message) => {
        this.basemapNotice.textContent = message ?? '';
        this.basemapNotice.hidden = message === null;
      },
    });

    const map = this.mapView.map;
    map.on('moveend', () => {
      this.source?.setViewport(this.mapView.bbox());
      this.requestRender();
    });
    map.on('zoom', () => this.requestRender());
    map.on('dragstart', () => this.setFollowing(false));
    map.on('load', () => this.source?.setViewport(this.mapView.bbox()));

    this.world.on('vessels', () => this.requestRender());
    this.world.on('filters', () => this.requestRender());
    this.world.on('track', () => this.requestRender());
    this.world.on('status', (s) => {
      this.controls.renderStatus(s);
      this.banner.hidden = !s.simulated;
    });
    this.world.on('selection', (mmsi) => {
      this.source?.setSelected(mmsi);
      if (mmsi !== null) this.source?.requestTrack(mmsi);
      else this.setFollowing(false);
      this.panel.update();
      this.requestRender();
    });

    setInterval(() => {
      if (this.world.deadReckoning) this.requestRender();
      this.panel.update();
      this.follow();
    }, MOTION_INTERVAL_MS);

    this.connect();

    // A built-in encrypted key needs its passphrase: ask on first visit, or when
    // live data was chosen before but the key was not remembered.
    const needsUnlock = this.settings.source === 'direct' && !this.settings.apiKey;
    if (BUILD_ENCRYPTED_KEY && (firstVisit || needsUnlock)) this.settingsDialog.openUnlock();
  }

  // ---------------------------------------------------------------- public API

  registerPlugin(plugin: AppPlugin): void {
    if (this.plugins.some((p) => p.id === plugin.id)) throw new Error(`Plugin "${plugin.id}" already registered`);
    this.plugins.push(plugin);
    const cleanup = plugin.setup?.(this);
    if (typeof cleanup === 'function') this.pluginCleanups.set(plugin.id, cleanup);
    this.requestRender();
  }

  unregisterPlugin(id: string): void {
    const index = this.plugins.findIndex((p) => p.id === id);
    if (index === -1) return;
    this.plugins.splice(index, 1);
    this.pluginCleanups.get(id)?.();
    this.pluginCleanups.delete(id);
    this.requestRender();
  }

  select(mmsi: number | null): void {
    this.world.select(mmsi);
  }

  selectedVessel(): Vessel | undefined {
    return this.world.selected !== null ? this.world.store.get(this.world.selected) : undefined;
  }

  /** Select a vessel and fly the camera to it. */
  focusVessel(v: Vessel): void {
    if (!this.world.store.get(v.mmsi)) {
      this.world.store.upsert(v);
      this.world.store.takeChanges();
      this.world.notifyVessels();
    }
    this.select(v.mmsi);
    this.mapView.flyToVessel(...this.world.positionOf(v), Math.max(this.mapView.zoom, 12));
  }

  setFollowing(follow: boolean): void {
    this.following = follow && this.world.selected !== null;
    this.panel.setFollowing(this.following);
    this.follow();
  }

  viewSelectedIn3d(): void {
    const v = this.selectedVessel();
    if (!v) return;
    if (!this.settings.models3d) this.updateSettings({ models3d: true });
    const [lon, lat] = this.world.positionOf(v);
    const ship = this.lastContext?.ships.find((s) => s.vessel.mmsi === v.mmsi);
    this.mapView.viewIn3d(lon, lat, ship?.bearing ?? this.mapView.map.getBearing(), ship?.lengthM ?? 100);
  }

  updateSettings(patch: Partial<Settings>): void {
    const prev = this.settings;
    this.settings = { ...prev, ...patch };
    saveSettings(this.settings);
    this.world.deadReckoning = this.settings.deadReckoning;
    if (patch.basemap && patch.basemap !== prev.basemap) {
      void this.mapView.setBasemap(BASEMAPS[this.settings.basemap].url);
    }
    const sourceChanged =
      this.settings.source !== prev.source ||
      (this.settings.source === 'direct' && this.settings.apiKey !== prev.apiKey) ||
      (this.settings.source === 'relay' && this.settings.relayUrl !== prev.relayUrl);
    if (sourceChanged) this.connect();
    this.requestRender();
  }

  /** Schedule a layer rebuild (coalesced and rate-limited). */
  requestRender(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    const wait = Math.max(0, this.lastRender + RENDER_INTERVAL_MS - performance.now());
    setTimeout(() => requestAnimationFrame(() => this.render()), wait);
  }

  // ---------------------------------------------------------------- internals

  private connect(): void {
    this.source?.stop();
    this.world.clear();
    const s = this.settings;
    if (s.source === 'direct' && s.apiKey) {
      this.source = createDirectSource(this.world, s.apiKey);
    } else if (s.source === 'relay' && s.relayUrl) {
      this.source = createRelaySource(this.world, s.relayUrl);
    } else {
      this.source = createSimulatorSource(this.world);
    }
    this.world.setStatus({ kind: this.source.kind, state: 'connecting', simulated: this.source.kind === 'simulator' });
    this.source.start();
    if (this.mapView.map.loaded()) this.source.setViewport(this.mapView.bbox());
  }

  private render(): void {
    this.renderQueued = false;
    this.lastRender = performance.now();
    const zoom = this.mapView.zoom;
    const latitude = this.mapView.centreLatitude;
    const meshMode = this.settings.models3d && zoom >= MESH_MIN_ZOOM;
    const ships = buildRenderShips(this.world, zoom, latitude, meshMode);
    const ctx: RenderContext = {
      world: this.world,
      ships,
      zoom,
      latitude,
      now: this.world.now(),
      meshMode,
      showLabels: this.settings.showLabels,
    };
    this.lastContext = ctx;
    const layers: Layer[] = buildBaseLayers(ctx);
    for (const plugin of this.plugins) {
      if (!plugin.layers) continue;
      try {
        layers.push(...plugin.layers(ctx));
      } catch (err) {
        console.error(`[plugin ${plugin.id}] layers() failed`, err);
      }
    }
    this.mapView.setLayers(layers);

    const bbox = this.mapView.bbox();
    let inView = 0;
    for (const s of ships) {
      if (bboxContains(bbox, s.position[0], s.position[1])) inView++;
    }
    this.controls.renderCounts(inView);
  }

  private handleClick(info: PickingInfo): void {
    for (const plugin of this.plugins) {
      if (plugin.onClick?.(info) === true) return;
    }
    const vessel = pickedVessel(info);
    this.select(vessel ? vessel.mmsi : null);
  }

  private follow(): void {
    if (!this.following) return;
    const v = this.selectedVessel();
    const map = this.mapView.map;
    if (!v || map.isZooming() || map.isRotating()) return;
    map.easeTo({ center: this.world.positionOf(v), duration: MOTION_INTERVAL_MS, easing: (t) => t });
  }
}

function tooltipText(v: Vessel | undefined): string | null {
  if (!v) return null;
  const parts = [v.name ?? `MMSI ${v.mmsi}`, CATEGORY_LABELS[categoryOf(v.shipType)]];
  if (v.sog !== undefined) parts.push(`${v.sog.toFixed(1)} kn`);
  if (v.destination) parts.push(`→ ${v.destination}`);
  return parts.join(' · ');
}

function attribution(): HTMLElement {
  const link = (href: string, text: string) =>
    el('a', { href, text, target: '_blank', rel: 'noopener noreferrer' });
  return el('div', { className: 'vv-attribution' }, [
    link('https://openfreemap.org', 'OpenFreeMap'),
    ' ',
    link('https://www.openmaptiles.org/', '© OpenMapTiles'),
    ' Data from ',
    link('https://www.openstreetmap.org/copyright', 'OpenStreetMap'),
    ' · AIS: ',
    link('https://aisstream.io', 'aisstream.io'),
  ]);
}
