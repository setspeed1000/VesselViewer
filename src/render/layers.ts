/**
 * Builds the deck.gl layers for the current world state. Pure functions of
 * a RenderContext, so plugins (e.g. a game mode) can add their own layers in
 * the same way.
 */
import type { Layer, PickingInfo } from '@deck.gl/core';
import { IconLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import {
  categoryOf,
  isMoving,
  vesselBeam,
  vesselBearing,
  vesselLength,
  VESSEL_CATEGORIES,
  type Vessel,
  type VesselCategory,
} from '../../shared/vessel.js';
import { FLEET_CLASSES, fleetClassOf, type FleetMatch } from '../../shared/fleet.js';
import type { World } from '../core/world.js';
import { createIconAtlas, ICON_MAPPING, ICON_SIZE, type IconName } from './icons.js';
import { getShipModel, modelKey } from './models/index.js';
import { buildHullMesh, buildSuperstructureMesh, hullHeightM, type MeshData } from './shipMesh.js';
import { CATEGORY_COLORS, DEFAULT_LENGTH_M, type RGB } from './style.js';

/** Everything the renderer knows about one vessel for this frame. */
export interface RenderShip {
  vessel: Vessel;
  /** Current (possibly dead-reckoned) position, [lon, lat]. */
  position: [number, number];
  /** Bow direction in degrees true, if known. */
  bearing: number | undefined;
  category: VesselCategory;
  color: RGB;
  icon: IconName;
  /** True-scale dimensions in metres (category defaults when not reported). */
  lengthM: number;
  beamM: number;
  heightM: number;
  /** ≥ 1: enlargement applied so small vessels stay visible when zoomed out. */
  sizeFactor: number;
  /** Offset from the AIS reference point to the hull centre, metres east/north. */
  centreOffset: [number, number, number];
  /** Fleet class (and ship variant) whose detailed model replaces the generic hull, when enabled. */
  fleet?: FleetMatch;
}

export interface RenderContext {
  world: World;
  ships: RenderShip[];
  zoom: number;
  /** Map centre latitude, for metres-per-pixel estimates. */
  latitude: number;
  now: number;
  /** True when true-scale 3D models are drawn instead of icons. */
  meshMode: boolean;
  showLabels: boolean;
  /** Draw detailed class models for recognised ships. */
  advancedModels: boolean;
}

/** Zoom at which icons give way to 3D models. */
export const MESH_MIN_ZOOM = 12;
const LABEL_MIN_ZOOM = 11.5;
const MAX_LABELS = 1500;
/** Smallest on-screen length of a 3D model, in pixels. */
const MIN_MODEL_LENGTH_PX = 26;
const EARTH_CIRCUMFERENCE_M = 40_075_016.686;

export function metresPerPixel(zoom: number, latitude: number): number {
  return (EARTH_CIRCUMFERENCE_M * Math.cos((latitude * Math.PI) / 180)) / (512 * 2 ** zoom);
}

const classCache = new WeakMap<Vessel, FleetMatch | null>();

/** Royal Caribbean class of a vessel, memoised per vessel record. */
/** Fleet class of a vessel, memoised per vessel record. */
export function shipFleetOf(v: Vessel): FleetMatch | undefined {
  let match = classCache.get(v);
  if (match === undefined) {
    match = fleetClassOf(v) ?? null;
    classCache.set(v, match);
  }
  return match ?? undefined;
}

export function buildRenderShips(
  world: World,
  zoom: number,
  latitude: number,
  meshMode: boolean,
  advancedModels = false,
): RenderShip[] {
  const now = world.now();
  const minLength = MIN_MODEL_LENGTH_PX * metresPerPixel(zoom, latitude);
  const ships: RenderShip[] = [];
  for (const v of world.store.values()) {
    if (!world.isVisible(v) && v.mmsi !== world.selected) continue;
    const category = categoryOf(v.shipType);
    const bearing = vesselBearing(v);
    const fleet = advancedModels ? shipFleetOf(v) : undefined;
    const lengthM =
      vesselLength(v) ?? (fleet ? FLEET_CLASSES[fleet.classId].lengthM : DEFAULT_LENGTH_M[category]);
    const beamM = vesselBeam(v) ?? Math.max(2, lengthM / 6.5);
    const sizeFactor = meshMode ? Math.max(1, minLength / lengthM) : 1;
    let centreOffset: [number, number, number] = [0, 0, 0];
    if (meshMode && bearing !== undefined && v.dimA !== undefined && v.dimB !== undefined) {
      // Hull centre relative to the GPS antenna, in the ship's frame
      // (+forward, +starboard), rotated into east/north.
      const fwd = ((v.dimA - v.dimB) / 2) * sizeFactor;
      const stbd = (((v.dimD ?? 0) - (v.dimC ?? 0)) / 2) * sizeFactor;
      const h = (bearing * Math.PI) / 180;
      centreOffset = [
        fwd * Math.sin(h) + stbd * Math.cos(h),
        fwd * Math.cos(h) - stbd * Math.sin(h),
        0,
      ];
    }
    ships.push({
      vessel: v,
      position: world.positionOf(v, now),
      bearing,
      category,
      color: CATEGORY_COLORS[category],
      icon: bearing === undefined ? 'dot' : isMoving(v) ? 'arrow' : 'hull',
      lengthM,
      beamM,
      heightM: hullHeightM(lengthM),
      sizeFactor,
      centreOffset,
      fleet,
    });
  }
  return ships;
}

// ------------------------------------------------------------------ shared resources

let iconAtlas: string | undefined;
let hullMesh: MeshData | undefined;
const superstructureMeshes = new Map<VesselCategory, MeshData>();

function getIconAtlas(): string {
  return (iconAtlas ??= createIconAtlas());
}

function getHullMesh(): MeshData {
  return (hullMesh ??= buildHullMesh());
}

function getSuperstructureMesh(category: VesselCategory): MeshData {
  let mesh = superstructureMeshes.get(category);
  if (!mesh) {
    mesh = buildSuperstructureMesh(category);
    superstructureMeshes.set(category, mesh);
  }
  return mesh;
}

// ------------------------------------------------------------------ layers

const meshScale = (s: RenderShip): [number, number, number] => [
  s.beamM * s.sizeFactor,
  s.lengthM * s.sizeFactor,
  s.heightM * s.sizeFactor,
];
// deck.gl yaw is counter-clockwise from +X; AIS bearings are clockwise from north.
const meshOrientation = (s: RenderShip): [number, number, number] => [0, -(s.bearing ?? 0), 0];

/** Where the middle of the hull is drawn (the AIS position is the GPS antenna). */
function hullCentre(s: RenderShip): [number, number] {
  const [east, north] = s.centreOffset;
  if (east === 0 && north === 0) return s.position;
  const [lon, lat] = s.position;
  return [lon + east / (111_320 * Math.cos((lat * Math.PI) / 180)), lat + north / 111_320];
}

function trailLayer(ctx: RenderContext): Layer | undefined {
  const { world } = ctx;
  if (world.selected === null) return undefined;
  const vessel = world.store.get(world.selected);
  if (!vessel) return undefined;
  const path: [number, number][] = world.store.track(vessel.mmsi).map((p) => [p[0], p[1]]);
  path.push(world.positionOf(vessel, ctx.now));
  if (path.length < 2) return undefined;
  const color = CATEGORY_COLORS[categoryOf(vessel.shipType)];
  return new PathLayer<{ path: [number, number][] }>({
    id: 'vessel-trail',
    data: [{ path }],
    getPath: (d) => d.path,
    getColor: [...color, 200],
    getWidth: 3,
    widthUnits: 'pixels',
    jointRounded: true,
    capRounded: true,
  });
}

function iconLayers(ctx: RenderContext): Layer[] {
  const common = {
    data: ctx.ships,
    iconAtlas: getIconAtlas(),
    iconMapping: ICON_MAPPING,
    getIcon: (s: RenderShip) => s.icon,
    getPosition: (s: RenderShip) => s.position,
    getAngle: (s: RenderShip) => -(s.bearing ?? 0),
    sizeUnits: 'pixels' as const,
    // Lie flat on the map so headings stay correct when it is rotated or pitched.
    billboard: false,
  };
  return [
    new IconLayer<RenderShip>({
      ...common,
      id: 'vessel-icons-halo',
      getColor: [255, 255, 255, 235],
      getSize: (s) => ICON_SIZE[s.icon] + 6,
    }),
    new IconLayer<RenderShip>({
      ...common,
      id: 'vessel-icons',
      pickable: true,
      getColor: (s) => s.color,
      getSize: (s) => ICON_SIZE[s.icon],
    }),
  ];
}

/** Detailed class models, one layer per class, scaled uniformly to reported length. */
function advancedModelLayers(ships: RenderShip[]): Layer[] {
  const byModel = new Map<string, RenderShip[]>();
  for (const s of ships) {
    const key = modelKey(s.fleet!);
    let list = byModel.get(key);
    if (!list) byModel.set(key, (list = []));
    list.push(s);
  }
  const layers: Layer[] = [];
  for (const data of byModel.values()) {
    const match = data[0]!.fleet!;
    const model = getShipModel(match);
    layers.push(
      new SimpleMeshLayer<RenderShip>({
        id: `vessel-model-${modelKey(match)}`,
        data,
        mesh: model.mesh,
        pickable: true,
        // White leaves the model's own vertex colours unchanged.
        getColor: [255, 255, 255],
        getPosition: (s) => s.position,
        getOrientation: meshOrientation,
        getScale: (s) => {
          const k = (s.lengthM * s.sizeFactor) / model.lengthM;
          return [k, k, k];
        },
        getTranslation: (s) => s.centreOffset,
      }),
    );
  }
  return layers;
}

function meshLayers(ctx: RenderContext): Layer[] {
  const detailed = ctx.ships.filter((s) => s.fleet);
  const generic = detailed.length > 0 ? ctx.ships.filter((s) => !s.fleet) : ctx.ships;
  const layers: Layer[] = [
    ...advancedModelLayers(detailed),
    new SimpleMeshLayer<RenderShip>({
      id: 'vessel-hulls',
      data: generic,
      mesh: getHullMesh(),
      pickable: true,
      getPosition: (s) => s.position,
      getColor: (s) => s.color,
      getOrientation: meshOrientation,
      getScale: meshScale,
      getTranslation: (s) => s.centreOffset,
    }),
  ];
  const byCategory = new Map<VesselCategory, RenderShip[]>();
  for (const s of generic) {
    let list = byCategory.get(s.category);
    if (!list) byCategory.set(s.category, (list = []));
    list.push(s);
  }
  for (const category of VESSEL_CATEGORIES) {
    const data = byCategory.get(category);
    if (!data) continue;
    layers.push(
      new SimpleMeshLayer<RenderShip>({
        id: `vessel-superstructure-${category}`,
        data,
        mesh: getSuperstructureMesh(category),
        pickable: true,
        getPosition: (s) => s.position,
        getColor: [238, 238, 232],
        getOrientation: meshOrientation,
        getScale: meshScale,
        getTranslation: (s) => s.centreOffset,
      }),
    );
  }
  return layers;
}

function labelLayer(ctx: RenderContext): Layer | undefined {
  if (!ctx.showLabels || ctx.zoom < LABEL_MIN_ZOOM) return undefined;
  const named = ctx.ships.filter((s) => s.vessel.name);
  if (named.length > MAX_LABELS) return undefined;
  const mpp = metresPerPixel(ctx.zoom, ctx.latitude);
  return new TextLayer<RenderShip>({
    id: 'vessel-labels',
    data: named,
    characterSet: 'auto',
    getText: (s) => s.vessel.name!,
    getPosition: hullCentre,
    getSize: 12,
    getColor: [25, 30, 40],
    getPixelOffset: (s) => [
      0,
      ctx.meshMode ? Math.min(80, (s.lengthM * s.sizeFactor) / mpp / 2) + 10 : 16,
    ],
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'top',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    fontWeight: 600,
    fontSettings: { sdf: true },
    outlineWidth: 3,
    outlineColor: [255, 255, 255, 230],
  });
}

function selectionLayer(ctx: RenderContext): Layer | undefined {
  const selected = ctx.world.selected;
  if (selected === null) return undefined;
  const ship = ctx.ships.find((s) => s.vessel.mmsi === selected);
  if (!ship) return undefined;
  const mpp = metresPerPixel(ctx.zoom, ctx.latitude);
  const radius = ctx.meshMode ? (ship.lengthM * ship.sizeFactor * 0.62) / mpp + 4 : 17;
  return new ScatterplotLayer<RenderShip>({
    id: 'vessel-selection',
    data: [ship],
    getPosition: hullCentre,
    getRadius: radius,
    radiusUnits: 'pixels',
    filled: false,
    stroked: true,
    getLineColor: [20, 20, 20, 230],
    getLineWidth: 2.5,
    lineWidthUnits: 'pixels',
  });
}

export function buildBaseLayers(ctx: RenderContext): Layer[] {
  const layers: (Layer | undefined)[] = [
    trailLayer(ctx),
    ...(ctx.meshMode ? meshLayers(ctx) : iconLayers(ctx)),
    selectionLayer(ctx),
    labelLayer(ctx),
  ];
  return layers.filter((l): l is Layer => l !== undefined);
}

/** The vessel under the pointer, if a built-in vessel layer was picked. */
export function pickedVessel(info: PickingInfo): Vessel | undefined {
  const obj = info.object as RenderShip | undefined;
  return obj && typeof obj === 'object' && 'vessel' in obj ? obj.vessel : undefined;
}
