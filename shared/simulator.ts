/**
 * Synthetic AIS traffic for demos, offline development and tests.
 *
 * Emits messages in exactly the aisstream.io JSON format so they flow through
 * the same parser as live data. Simulated vessels use MMSIs 999990000+ and
 * names prefixed "SIM" so they can never be mistaken for real ships.
 */
import { FLEET_CLASSES, fleetShips, SHIP_CLASS_IDS, type CruiseLine } from './fleet.js';
import { destinationPoint, distanceM, initialBearing } from './geo.js';

type LonLat = [number, number];

/** Open-water shipping lanes, [lon, lat] waypoints. */
const LANES: LonLat[][] = [
  // English Channel → Strait of Dover
  [[-5.6, 49.2], [-3.5, 49.75], [-1.5, 50.1], [0.0, 50.35], [1.0, 50.75], [1.55, 51.0], [2.2, 51.3]],
  // Singapore Strait
  [[103.55, 1.18], [103.75, 1.19], [103.9, 1.2], [104.1, 1.25], [104.35, 1.3]],
  // North Atlantic
  [[-60, 42], [-45, 45], [-30, 47.5], [-15, 49]],
  // Gulf of Mexico → Florida Straits
  [[-94.5, 28.0], [-91, 27.5], [-87, 27], [-84.5, 25.5], [-83, 24.3]],
  // Mediterranean, Gibraltar → Ionian Sea
  [[-5.0, 35.95], [-2.0, 36.2], [3.0, 37.5], [8.0, 37.8], [11.3, 37.6], [15.0, 36.0], [20, 35]],
];

/** Anchorages: centre and radius in metres. */
const ANCHORAGES: { centre: LonLat; radius: number }[] = [
  { centre: [-118.25, 33.62], radius: 3000 }, // off San Pedro Bay
  { centre: [3.7, 52.05], radius: 4000 }, // off Rotterdam
];

interface Profile {
  shipType: number;
  classB: boolean;
  length: [number, number];
  speed: [number, number];
  weight: number;
}

const PROFILES: Profile[] = [
  { shipType: 70, classB: false, length: [120, 400], speed: [11, 20], weight: 30 },
  { shipType: 80, classB: false, length: [100, 330], speed: [10, 15], weight: 18 },
  { shipType: 60, classB: false, length: [80, 300], speed: [14, 22], weight: 8 },
  { shipType: 30, classB: false, length: [15, 60], speed: [3, 10], weight: 10 },
  { shipType: 52, classB: false, length: [25, 40], speed: [6, 12], weight: 6 },
  { shipType: 37, classB: true, length: [8, 25], speed: [4, 15], weight: 12 },
  { shipType: 36, classB: true, length: [8, 20], speed: [3, 8], weight: 6 },
  { shipType: 40, classB: false, length: [30, 90], speed: [25, 38], weight: 4 },
  { shipType: 35, classB: false, length: [60, 180], speed: [12, 25], weight: 3 },
  { shipType: 90, classB: false, length: [40, 120], speed: [8, 14], weight: 3 },
];

const NAMES = [
  'AURORA', 'BOREALIS', 'CORAL SEA', 'DELTA STAR', 'EASTERN DAWN', 'FJORD', 'GALE',
  'HARBOUR LIGHT', 'ISLANDER', 'JADE', 'KESTREL', 'LODESTAR', 'MERIDIAN', 'NORTHWIND',
  'OCEAN PEARL', 'PIONEER', 'QUAYSIDE', 'RIPTIDE', 'SEA SPIRIT', 'TRIDENT', 'UNITY',
  'VOYAGER', 'WESTERLY', 'XANTHE', 'YELLOWFIN', 'ZEPHYR',
];

const DESTINATIONS = ['ROTTERDAM', 'SINGAPORE', 'HOUSTON', 'ALGECIRAS', 'NEW YORK', 'PIRAEUS', 'LE HAVRE'];

/** Deterministic PRNG so a given seed always produces the same fleet. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Lane {
  points: LonLat[];
  /** Cumulative distance at each waypoint, metres. */
  cumulative: number[];
  length: number;
}

function buildLane(points: LonLat[]): Lane {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    const [aLon, aLat] = points[i - 1]!;
    const [bLon, bLat] = points[i]!;
    cumulative.push(cumulative[i - 1]! + distanceM(aLon, aLat, bLon, bLat));
  }
  return { points, cumulative, length: cumulative[cumulative.length - 1]! };
}

/** Position and forward bearing at distance `s` along a lane. */
function laneAt(lane: Lane, s: number): { lon: number; lat: number; bearing: number } {
  const d = Math.max(0, Math.min(lane.length, s));
  let i = 1;
  while (i < lane.cumulative.length - 1 && lane.cumulative[i]! < d) i++;
  const [aLon, aLat] = lane.points[i - 1]!;
  const [bLon, bLat] = lane.points[i]!;
  const segStart = lane.cumulative[i - 1]!;
  const segLen = lane.cumulative[i]! - segStart;
  const bearing = initialBearing(aLon, aLat, bLon, bLat);
  const [lon, lat] = destinationPoint(aLon, aLat, bearing, segLen > 0 ? d - segStart : 0);
  return { lon, lat, bearing: initialBearing(lon, lat, bLon, bLat) };
}

interface SimShip {
  mmsi: number;
  name: string;
  callSign: string;
  imo?: number;
  profile: Profile;
  length: number;
  beam: number;
  destination: string;
  lane?: Lane;
  s: number;
  direction: 1 | -1;
  offset: number;
  speed: number;
  anchorPos?: LonLat;
  anchorHeading: number;
  nextPositionAt: number;
  nextStaticAt: number;
}

export interface SimulatorOptions {
  vesselCount?: number;
  seed?: number;
}

export type RawAisMessage = Record<string, unknown>;

export class AisSimulator {
  private readonly ships: SimShip[] = [];
  private readonly rand: () => number;
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastTick = 0;

  constructor(options: SimulatorOptions = {}) {
    const count = options.vesselCount ?? 400;
    this.rand = mulberry32(options.seed ?? 1);
    const lanes = LANES.map(buildLane);
    const totalWeight = PROFILES.reduce((sum, p) => sum + p.weight, 0);

    for (let i = 0; i < count; i++) {
      let pick = this.rand() * totalWeight;
      let profile = PROFILES[0]!;
      for (const p of PROFILES) {
        pick -= p.weight;
        if (pick <= 0) {
          profile = p;
          break;
        }
      }
      const length = Math.round(this.range(profile.length));
      const beam = Math.max(3, Math.round(length / this.range([5.5, 7.5])));
      const anchored = !profile.classB && profile.shipType >= 70 && this.rand() < 0.2;
      const ship: SimShip = {
        mmsi: 999_990_000 + i,
        name: `SIM ${NAMES[i % NAMES.length]} ${Math.floor(i / NAMES.length) + 1}`,
        callSign: `SIM${String(i).padStart(4, '0')}`,
        imo: profile.classB ? undefined : 9_000_000 + i,
        profile,
        length,
        beam,
        destination: DESTINATIONS[Math.floor(this.rand() * DESTINATIONS.length)]!,
        s: 0,
        direction: this.rand() < 0.5 ? 1 : -1,
        offset: (this.rand() - 0.5) * 3000 + (this.rand() < 0.5 ? 1200 : -1200),
        speed: this.range(profile.speed),
        anchorHeading: Math.floor(this.rand() * 360),
        nextPositionAt: 0,
        nextStaticAt: 0,
      };
      if (anchored) {
        const a = ANCHORAGES[i % ANCHORAGES.length]!;
        ship.anchorPos = destinationPoint(a.centre[0], a.centre[1], this.rand() * 360, this.rand() * a.radius);
      } else {
        ship.lane = lanes[i % lanes.length]!;
        ship.s = this.rand() * ship.lane.length;
      }
      this.ships.push(ship);
    }

    // One cruise ship per fleet class with a detailed model, so the models
    // can be seen without live data. Names keep the "SIM" prefix.
    const destinations: Record<CruiseLine, string> = {
      'Royal Caribbean': 'COCOCAY',
      Carnival: 'CELEBRATION KEY',
      Norwegian: 'GREAT STIRRUP CAY',
    };
    SHIP_CLASS_IDS.forEach((id, k) => {
      const info = FLEET_CLASSES[id];
      const ships = fleetShips(id);
      const demo = ships.find((s) => !s.variant) ?? ships[0]!;
      const lane = lanes[k % lanes.length]!;
      this.ships.push({
        mmsi: 999_999_000 + k,
        name: `SIM ${demo.name.toUpperCase()}`,
        callSign: `SIMCR${k}`,
        imo: 9_999_000 + k,
        profile: { shipType: 60, classB: false, length: [info.lengthM, info.lengthM], speed: [16, 21], weight: 0 },
        // AIS dimensions are whole metres.
        length: Math.round(info.lengthM),
        beam: Math.round(info.beamM),
        destination: destinations[info.line],
        lane,
        s: lane.length * (0.1 + ((0.13 * k) % 0.8)),
        direction: k % 2 === 0 ? 1 : -1,
        offset: 1500 + (k % 3) * 900,
        speed: 16 + (k % 4),
        anchorHeading: 0,
        nextPositionAt: 0,
        nextStaticAt: 0,
      });
    });
  }

  /** Start emitting messages roughly every `tickMs`. */
  start(emit: (msg: RawAisMessage) => void, tickMs = 1000): void {
    this.stop();
    this.lastTick = Date.now();
    this.tick(emit, this.lastTick);
    this.timer = setInterval(() => this.tick(emit, Date.now()), tickMs);
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Advance the simulation to `now` and emit any messages that are due. */
  tick(emit: (msg: RawAisMessage) => void, now: number): void {
    const dt = Math.max(0, (now - this.lastTick) / 1000);
    this.lastTick = now;
    for (const ship of this.ships) {
      this.advance(ship, dt);
      if (now >= ship.nextStaticAt) {
        for (const msg of this.staticMessages(ship, now)) emit(msg);
        ship.nextStaticAt = now + 60_000 + this.rand() * 30_000;
      }
      if (now >= ship.nextPositionAt) {
        emit(this.positionMessage(ship, now));
        const interval = ship.anchorPos ? 30_000 : ship.profile.classB ? 15_000 : 5_000;
        ship.nextPositionAt = now + interval * (0.6 + this.rand() * 0.8);
      }
    }
  }

  private range([min, max]: [number, number]): number {
    return min + this.rand() * (max - min);
  }

  private advance(ship: SimShip, dtSeconds: number): void {
    if (!ship.lane) return;
    ship.s += ship.direction * ship.speed * (1852 / 3600) * dtSeconds;
    if (ship.s >= ship.lane.length) {
      ship.s = ship.lane.length;
      ship.direction = -1;
    } else if (ship.s <= 0) {
      ship.s = 0;
      ship.direction = 1;
    }
  }

  private state(ship: SimShip): { lon: number; lat: number; course: number; sog: number } {
    if (ship.anchorPos) {
      return { lon: ship.anchorPos[0], lat: ship.anchorPos[1], course: ship.anchorHeading, sog: 0 };
    }
    const lane = ship.lane!;
    const at = laneAt(lane, ship.s);
    const course = ship.direction === 1 ? at.bearing : (at.bearing + 180) % 360;
    // Keep right: offset to starboard of the direction of travel.
    const [lon, lat] = destinationPoint(at.lon, at.lat, (course + 90) % 360, Math.abs(ship.offset));
    return { lon, lat, course, sog: ship.speed };
  }

  private meta(ship: SimShip, now: number, lon: number, lat: number): RawAisMessage {
    const iso = new Date(now).toISOString(); // 2026-01-02T03:04:05.678Z
    const time = `${iso.slice(0, 10)} ${iso.slice(11, 23)}000 +0000 UTC`;
    return {
      MMSI: ship.mmsi,
      MMSI_String: ship.mmsi,
      ShipName: ship.name,
      latitude: lat,
      longitude: lon,
      time_utc: time,
    };
  }

  private positionMessage(ship: SimShip, now: number): RawAisMessage {
    const { lon, lat, course, sog } = this.state(ship);
    const cog = Math.round(course * 10) / 10;
    const heading = Math.round(course) % 360;
    const common = {
      UserID: ship.mmsi,
      Valid: true,
      Latitude: lat,
      Longitude: lon,
      Sog: Math.round(sog * 10) / 10,
      Cog: sog > 0 ? cog : 360,
      TrueHeading: heading,
    };
    if (ship.profile.classB) {
      return {
        MessageType: 'StandardClassBPositionReport',
        MetaData: this.meta(ship, now, lon, lat),
        Message: { StandardClassBPositionReport: { MessageID: 18, ...common } },
      };
    }
    const navStatus = ship.anchorPos ? 1 : ship.profile.shipType === 30 ? 7 : 0;
    return {
      MessageType: 'PositionReport',
      MetaData: this.meta(ship, now, lon, lat),
      Message: {
        PositionReport: { MessageID: 1, ...common, NavigationalStatus: navStatus, RateOfTurn: 0 },
      },
    };
  }

  private staticMessages(ship: SimShip, now: number): RawAisMessage[] {
    const { lon, lat } = this.state(ship);
    const a = Math.round(ship.length * 0.75);
    const c = Math.round(ship.beam / 2);
    const dimension = { A: a, B: ship.length - a, C: c, D: ship.beam - c };
    if (ship.profile.classB) {
      return [
        {
          MessageType: 'StaticDataReport',
          MetaData: this.meta(ship, now, lon, lat),
          Message: {
            StaticDataReport: {
              MessageID: 24,
              UserID: ship.mmsi,
              Valid: true,
              PartNumber: false,
              ReportA: { Valid: true, Name: ship.name },
              ReportB: { Valid: false },
            },
          },
        },
        {
          MessageType: 'StaticDataReport',
          MetaData: this.meta(ship, now, lon, lat),
          Message: {
            StaticDataReport: {
              MessageID: 24,
              UserID: ship.mmsi,
              Valid: true,
              PartNumber: true,
              ReportA: { Valid: false },
              ReportB: {
                Valid: true,
                ShipType: ship.profile.shipType,
                CallSign: ship.callSign,
                Dimension: dimension,
              },
            },
          },
        },
      ];
    }
    const eta = new Date(now + 3 * 86_400_000);
    return [
      {
        MessageType: 'ShipStaticData',
        MetaData: this.meta(ship, now, lon, lat),
        Message: {
          ShipStaticData: {
            MessageID: 5,
            UserID: ship.mmsi,
            Valid: true,
            ImoNumber: ship.imo ?? 0,
            CallSign: ship.callSign,
            Name: ship.name,
            Type: ship.profile.shipType,
            Dimension: dimension,
            Eta: {
              Month: eta.getUTCMonth() + 1,
              Day: eta.getUTCDate(),
              Hour: eta.getUTCHours(),
              Minute: eta.getUTCMinutes(),
            },
            MaximumStaticDraught: Math.min(25.5, Math.round(ship.length / 25) + 2),
            Destination: ship.destination,
          },
        },
      },
    ];
  }
}
