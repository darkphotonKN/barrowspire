/**
 * HUD anchors (FS-ZAJMH §D R12–R13). The logical view's width follows the frame (1080–1280), so a
 * camera-fixed widget is placed by an edge of the view and an offset from it, never by a
 * hard-coded position, and is placed again whenever the view changes. Sizes stay in logical
 * units (R14): the HUD scales with the canvas.
 *
 * The view is always {@link LOGICAL_HEIGHT} tall, so only the right and centre anchors move today;
 * the bottom ones are anchors all the same, so a widget says where it belongs.
 */

import { viewport, type View, type Viewport } from "./viewport";

/** The edge or corner a widget keeps to. */
export type Anchor =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "bottom-centre"
  | "centre";

/** A widget's place: its anchor and its offset from it, in logical units (x right, y down). */
export interface Placement {
  anchor: Anchor;
  dx: number;
  dy: number;
}

type ViewSize = Pick<View, "width" | "height">;

const ANCHOR_X: Record<Anchor, number> = {
  "top-left": 0,
  "bottom-left": 0,
  "top-right": 1,
  "bottom-right": 1,
  "bottom-centre": 0.5,
  centre: 0.5,
};

const ANCHOR_Y: Record<Anchor, number> = {
  "top-left": 0,
  "top-right": 0,
  "bottom-left": 1,
  "bottom-right": 1,
  "bottom-centre": 1,
  centre: 0.5,
};

/** Where `place` lands in the logical view `view` (the current one by default). */
export function anchorAt(
  place: Placement,
  view: ViewSize = viewport,
): { x: number; y: number } {
  return {
    x: view.width * ANCHOR_X[place.anchor] + place.dx,
    y: view.height * ANCHOR_Y[place.anchor] + place.dy,
  };
}

/** What of a scene a re-layout listens to. A `Phaser.Scene` is one. */
export interface RelayoutScene {
  events: {
    once(event: SceneEnd, fn: () => void): unknown;
    off(event: SceneEnd, fn: () => void): unknown;
  };
}

/**
 * How a scene ends. A stop emits SHUTDOWN; `game.destroy(true)` (leaving /game) emits only
 * DESTROY and then drops every listener, so a re-layout listens for both.
 */
type SceneEnd = "shutdown" | "destroy";

const SCENE_ENDS: readonly SceneEnd[] = ["shutdown", "destroy"];

/**
 * Runs `layout` each time the logical view's size changes while `scene` runs, until it shuts
 * down or is destroyed: the scene's anchored widgets go back to their anchors, open panels
 * included (R13). A render-scale change alone moves nothing in logical units, so it does not run
 * it. Returns the stop.
 */
export function relayoutOn(
  scene: RelayoutScene,
  layout: () => void,
  vp: Viewport = viewport,
): () => void {
  let size = { width: vp.width, height: vp.height };
  const unsubscribe = vp.onChange((view) => {
    if (view.width === size.width && view.height === size.height) return;
    size = { width: view.width, height: view.height };
    layout();
  });
  const stop = () => {
    unsubscribe();
    for (const end of SCENE_ENDS) scene.events.off(end, stop);
  };
  for (const end of SCENE_ENDS) scene.events.once(end, stop);
  return stop;
}
