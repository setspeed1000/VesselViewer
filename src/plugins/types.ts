/**
 * Extension point for features built on top of the tracker — a game mode,
 * extra overlays, custom 3D models. See README "Extending VesselViewer".
 */
import type { Layer, PickingInfo } from '@deck.gl/core';
import type { App } from '../app.js';
import type { RenderContext } from '../render/layers.js';

export interface AppPlugin {
  /** Unique id; also used as a deck.gl layer id prefix by convention. */
  id: string;
  /** Called once on registration. May return a cleanup function. */
  setup?(app: App): void | (() => void);
  /** Extra deck.gl layers, drawn above the built-in vessel layers. */
  layers?(ctx: RenderContext): Layer[];
  /** Called on map clicks; return true to stop the default vessel selection. */
  onClick?(info: PickingInfo): boolean | void;
}
