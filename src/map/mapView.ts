/**
 * MapLibre base map with a deck.gl overlay on top for all vessel rendering.
 */
import type { Layer, PickingInfo } from '@deck.gl/core';
import { MapboxOverlay } from '@deck.gl/mapbox';
import {
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  type PaddingOptions,
  type StyleSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { normalizeBBox, type BBox } from '../../shared/geo.js';

/** Used when the basemap cannot be fetched (offline, blocked network). */
const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#cfe0ea' } }],
};

export interface MapViewOptions {
  container: HTMLElement;
  styleUrl: string;
  onClick: (info: PickingInfo) => void;
  getTooltip: (info: PickingInfo) => string | null;
  onBasemapError: (message: string | null) => void;
}

export class MapView {
  readonly map: MapLibreMap;
  readonly overlay: MapboxOverlay;
  private readonly onBasemapError: (message: string | null) => void;

  constructor(options: MapViewOptions) {
    this.onBasemapError = options.onBasemapError;
    this.map = new MapLibreMap({
      container: options.container,
      style: FALLBACK_STYLE,
      center: [1.0, 50.5],
      zoom: 5,
      maxPitch: 85,
      hash: 'map',
      // One world copy keeps vessel layers and the base map aligned at all zooms.
      renderWorldCopies: false,
      // Attribution is rendered by the app (see ui/attribution.ts).
      attributionControl: false,
    });
    this.map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
    this.map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
    this.map.dragRotate.enable();
    this.map.touchZoomRotate.enableRotation();

    this.overlay = new MapboxOverlay({
      interleaved: false,
      layers: [],
      onClick: options.onClick,
      getTooltip: (info: PickingInfo) => {
        const text = options.getTooltip(info);
        return text ? { text, className: 'vv-tooltip' } : null;
      },
      getCursor: ({ isHovering, isDragging }) => (isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab'),
    });
    this.map.addControl(this.overlay);
    void this.setBasemap(options.styleUrl);
  }

  /** Load a basemap style URL, falling back to a plain sea colour if unreachable. */
  async setBasemap(url: string): Promise<void> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const style = (await res.json()) as StyleSpecification;
      if (style?.version !== 8) throw new Error('not a MapLibre style');
      this.map.setStyle(style);
      this.onBasemapError(null);
    } catch (err) {
      this.map.setStyle(FALLBACK_STYLE);
      this.onBasemapError(`Base map unavailable (${(err as Error).message}). Vessels are still live.`);
    }
  }

  setLayers(layers: Layer[]): void {
    this.overlay.setProps({ layers });
  }

  get zoom(): number {
    return this.map.getZoom();
  }

  get centreLatitude(): number {
    return this.map.getCenter().lat;
  }

  /** Visible area as [west, south, east, north]. */
  bbox(): BBox {
    const b = this.map.getBounds();
    return normalizeBBox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
  }

  flyToVessel(lon: number, lat: number, zoom?: number): void {
    this.map.flyTo({ center: [lon, lat], zoom: zoom ?? Math.max(this.map.getZoom(), 11), essential: true });
  }

  /** Pitched three-quarter view from the vessel's starboard quarter to show the 3D model. */
  viewIn3d(lon: number, lat: number, heading: number, lengthM: number, padding?: PaddingOptions): void {
    // Fit the whole hull, with some margin, across the unobstructed part of the screen.
    const width = Math.max(200, (this.map.getContainer().clientWidth || 800) - (padding?.left ?? 0) - (padding?.right ?? 0));
    const targetMpp = Math.max(0.05, (lengthM * 1.05) / width);
    const zoom = Math.log2((40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * targetMpp));
    this.map.flyTo({
      center: [lon, lat],
      zoom: Math.min(20, Math.max(13, zoom)),
      pitch: 55,
      bearing: heading - 60,
      padding: padding ?? { top: 0, bottom: 0, left: 0, right: 0 },
      essential: true,
    });
  }
}
