import { existsSync } from 'node:fs';
import type { DataSource } from '../shared/protocol.js';

// Load .env from the working directory when present (Node >= 20.12).
if (existsSync('.env')) process.loadEnvFile('.env');

export interface RelayConfig {
  source: DataSource;
  apiKey: string | undefined;
  upstreamUrl: string;
  /** aisstream bounding boxes, [[lat, lon], [lat, lon]] per box. */
  boundingBoxes: number[][][];
  host: string;
  port: number;
  /** Browser origins allowed to connect. Empty = any origin. */
  allowedOrigins: string[];
  vesselTtlMs: number;
  persistFile: string | undefined;
  simulatorVessels: number;
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}, got "${raw}"`);
  }
  return n;
}

function parseBoundingBoxes(raw: string | undefined): number[][][] {
  if (raw === undefined || raw.trim() === '') return [[[-90, -180], [90, 180]]];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('AIS_BOUNDING_BOXES must be JSON, e.g. [[[49,-6],[52,3]]]');
  }
  const ok =
    Array.isArray(parsed) &&
    parsed.length > 0 &&
    parsed.every(
      (box) =>
        Array.isArray(box) &&
        box.length === 2 &&
        box.every(
          (corner) =>
            Array.isArray(corner) &&
            corner.length === 2 &&
            typeof corner[0] === 'number' &&
            typeof corner[1] === 'number' &&
            Math.abs(corner[0]) <= 90 &&
            Math.abs(corner[1]) <= 180,
        ),
    );
  if (!ok) throw new Error('AIS_BOUNDING_BOXES must be a list of [[lat, lon], [lat, lon]] boxes');
  return parsed as number[][][];
}

export function loadConfig(): RelayConfig {
  const apiKey = process.env.AISSTREAM_API_KEY?.trim() || undefined;
  const requested = process.env.AIS_SOURCE?.trim().toLowerCase();
  if (requested && requested !== 'aisstream' && requested !== 'simulator') {
    throw new Error(`AIS_SOURCE must be "aisstream" or "simulator", got "${requested}"`);
  }
  const source: DataSource = requested === 'simulator' ? 'simulator' : 'aisstream';
  if (source === 'aisstream' && !apiKey) {
    throw new Error(
      'AISSTREAM_API_KEY is not set. Copy .env.example to .env and add your key, ' +
        'or set AIS_SOURCE=simulator to run with simulated traffic.',
    );
  }
  const persist = process.env.PERSIST_FILE;
  return {
    source,
    apiKey,
    upstreamUrl: process.env.AISSTREAM_URL?.trim() || 'wss://stream.aisstream.io/v0/stream',
    boundingBoxes: parseBoundingBoxes(process.env.AIS_BOUNDING_BOXES),
    host: process.env.HOST?.trim() || '127.0.0.1',
    port: intEnv('PORT', 8787, 1, 65535),
    allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim().replace(/\/$/, ''))
      .filter(Boolean),
    vesselTtlMs: intEnv('VESSEL_TTL_MINUTES', 60, 1, 24 * 60) * 60_000,
    persistFile: persist === undefined ? 'data/vessels.json' : persist.trim() || undefined,
    simulatorVessels: intEnv('SIMULATOR_VESSELS', 400, 1, 20_000),
  };
}
