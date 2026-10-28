/**
 * User settings persisted in this browser only (localStorage). The aisstream
 * API key entered here never leaves the browser except to aisstream.io itself.
 */
export type SourceKind = 'simulator' | 'direct' | 'relay';
export type BasemapId = 'positron' | 'liberty' | 'bright';

export interface Settings {
  source: SourceKind;
  /** aisstream.io API key for direct mode. */
  apiKey: string;
  /** VesselViewer relay WebSocket URL for relay mode, e.g. wss://relay.example.com/ws */
  relayUrl: string;
  basemap: BasemapId;
  /** Render true-scale 3D hulls when zoomed in. */
  models3d: boolean;
  /** Extrapolate positions between reports using speed and course. */
  deadReckoning: boolean;
  showLabels: boolean;
}

const STORAGE_KEY = 'vesselviewer.settings.v1';

/** Relay URL baked in at build time (GitHub Actions variable VITE_RELAY_URL). */
const BUILD_RELAY_URL = (import.meta.env.VITE_RELAY_URL as string | undefined)?.trim() ?? '';

export const DEFAULT_SETTINGS: Settings = {
  source: BUILD_RELAY_URL ? 'relay' : 'simulator',
  apiKey: '',
  relayUrl: BUILD_RELAY_URL,
  basemap: 'positron',
  models3d: true,
  deadReckoning: true,
  showLabels: true,
};

export const BASEMAPS: Record<BasemapId, { label: string; url: string }> = {
  positron: { label: 'Light', url: 'https://tiles.openfreemap.org/styles/positron' },
  liberty: { label: 'Liberty', url: 'https://tiles.openfreemap.org/styles/liberty' },
  bright: { label: 'Bright', url: 'https://tiles.openfreemap.org/styles/bright' },
};

export function hasStoredSettings(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function loadSettings(): Settings {
  let stored: Partial<Settings> = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) stored = JSON.parse(raw) as Partial<Settings>;
  } catch {
    stored = {};
  }
  const s: Settings = { ...DEFAULT_SETTINGS };
  if (stored.source === 'simulator' || stored.source === 'direct' || stored.source === 'relay') {
    s.source = stored.source;
  }
  if (typeof stored.apiKey === 'string') s.apiKey = stored.apiKey;
  if (typeof stored.relayUrl === 'string' && stored.relayUrl) s.relayUrl = stored.relayUrl;
  if (typeof stored.basemap === 'string' && stored.basemap in BASEMAPS) s.basemap = stored.basemap;
  if (typeof stored.models3d === 'boolean') s.models3d = stored.models3d;
  if (typeof stored.deadReckoning === 'boolean') s.deadReckoning = stored.deadReckoning;
  if (typeof stored.showLabels === 'boolean') s.showLabels = stored.showLabels;
  return s;
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Storage unavailable (private mode, blocked): settings last for this visit only.
  }
}

/** Accepts ws:// or wss:// URLs; https:// and http:// are converted. */
export function normalizeRelayUrl(input: string): string | undefined {
  let s = input.trim();
  if (!s) return undefined;
  if (s.startsWith('https://')) s = `wss://${s.slice(8)}`;
  else if (s.startsWith('http://')) s = `ws://${s.slice(7)}`;
  try {
    const url = new URL(s);
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return undefined;
    if (url.pathname === '/' || url.pathname === '') url.pathname = '/ws';
    return url.toString();
  } catch {
    return undefined;
  }
}
