/**
 * WebSocket protocol between the VesselViewer server (/ws) and browser clients.
 * All messages are JSON objects with a `type` discriminator.
 */
import type { BBox } from './geo.js';
import type { Vessel } from './vessel.js';

export const PROTOCOL_VERSION = 1;
export const WS_PATH = '/ws';

/** [lon, lat, epoch ms] */
export type TrackPoint = [number, number, number];

export type DataSource = 'aisstream' | 'simulator';

export type UpstreamState = 'connecting' | 'connected' | 'disconnected' | 'error';

// ---------------------------------------------------------------- client → server

export interface ViewportRequest {
  type: 'viewport';
  bbox: BBox;
}

export interface SelectRequest {
  type: 'select';
  /** Vessel to always receive updates for, regardless of viewport. null clears. */
  mmsi: number | null;
}

export interface TrackRequest {
  type: 'track';
  mmsi: number;
}

export interface SearchRequest {
  type: 'search';
  query: string;
}

export type ClientMessage = ViewportRequest | SelectRequest | TrackRequest | SearchRequest;

// ---------------------------------------------------------------- server → client

export interface WelcomeMessage {
  type: 'welcome';
  protocol: number;
  source: DataSource;
  serverTime: number;
  /** Vessels not heard from for this long are dropped. */
  vesselTtlMs: number;
}

export interface SnapshotMessage {
  type: 'snapshot';
  serverTime: number;
  bbox: BBox;
  vessels: Vessel[];
}

export interface DeltaMessage {
  type: 'delta';
  serverTime: number;
  vessels: Vessel[];
  removed: number[];
}

export interface StatusMessage {
  type: 'status';
  serverTime: number;
  source: DataSource;
  upstream: UpstreamState;
  upstreamError?: string;
  totalVessels: number;
  messagesPerSecond: number;
}

export interface TrackMessage {
  type: 'track';
  mmsi: number;
  points: TrackPoint[];
}

export interface SearchResultsMessage {
  type: 'searchResults';
  query: string;
  vessels: Vessel[];
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export type ServerMessage =
  | WelcomeMessage
  | SnapshotMessage
  | DeltaMessage
  | StatusMessage
  | TrackMessage
  | SearchResultsMessage
  | ErrorMessage;
