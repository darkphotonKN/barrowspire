/**
 * A world's view, closer (FS-ZAJMH § Change: Closer world camera; ADR-0103, amending ADR-0056). A world scene's main camera is
 * its world camera, zoomed by {@link WORLD_ZOOM} beyond the render scale ({@link zoomWorld}), so
 * the run, the town and a field show the logical view divided by it. Phaser zooms everything a
 * camera draws, a camera-fixed object as much as the ground, and a world scene draws part of its
 * HUD itself (the minimap and its icon and name, the floor indicator, the run's cards, the town's
 * queue panel); so that HUD is drawn by a second camera over the world's, fitted like every scene
 * camera and never zoomed beyond the render scale. HUD placement and hit tests stay in logical
 * units (§C, §D), and the UI scene is a scene of its own, untouched.
 *
 * The world camera stays `cameras.main`: follow, bounds, `viewRect`, the pixel grid, the light-map,
 * the masks and `pointer.worldX/worldY` (Phaser's hit test sets them from the world camera unless
 * a HUD control is under the pointer) all read it as before, and see the zoom through `zoomX` and
 * `displayWidth`.
 *
 * Which camera draws what is decided each frame, before the cameras draw: the HUD's camera draws a
 * camera-fixed object at {@link HUD_DEPTH_FLOOR} or over, and the world's draws everything else.
 * The camera-fixed layers under that depth belong to the world's view and are drawn between its
 * own depths (the mist, the light-map, the blackout's dark, the dust, the vignette; hostile
 * markers above the vignette, FS-2325V §C.9), so they stay on the world camera, which draws them
 * closer too: the light-map and the blackout follow its zoom, the vignette and the dust are laid
 * out for it (`atmosphere.ts`).
 *
 * The world camera's fade (the curtain a world fades in from, FS-C4JWH A1.5) covers the HUD too,
 * as it did when one camera drew both: the HUD camera's fade copies it each frame. Its shake (a
 * dread lore line's tremor) moves the world alone, as it always left the UI scene's HUD.
 *
 * No Phaser import: it reads only what a scene, a camera and a game object carry.
 */

import { onSceneEnd, type EndingScene } from "@/scenes/sceneEnd";
import { WORLD_ZOOM, fitCamera, zoomWorld, type ViewCamera } from "./camera";
import { viewport, type View } from "./viewport";

/**
 * The depth the HUD a world scene draws starts at: the arrival card's veil (960) and the HUD's
 * 1000 and over are its; the vignette (905), the dust (902) and every camera-fixed layer of the
 * world under them are not.
 */
export const HUD_DEPTH_FLOOR = 950;

/** What of a game object decides its camera. A Phaser game object is one; a Layer has no scroll factor. */
export interface Drawn {
  readonly scrollFactorX?: number;
  readonly scrollFactorY?: number;
  readonly depth?: number;
  /** Phaser's mask of the cameras that do not draw it, by camera id. */
  cameraFilter: number;
}

/**
 * What of a camera's fade the HUD camera copies. A Phaser `Fade` effect is one: it also keeps the
 * fill's `red`, `green`, `blue` and `alpha`, which Phaser 4.2.1's typings leave out
 * (`cameras/2d/effects/Fade.js`), copied all the same ({@link FADE_FIELDS}).
 */
export interface FadeState {
  isRunning: boolean;
  isComplete: boolean;
  direction: boolean;
  progress: number;
}

/** Every field of a fade that its draw reads (`renderNodes/Camera.js`, `Fade.postRenderWebGL`). */
const FADE_FIELDS = [
  "isRunning",
  "isComplete",
  "direction",
  "progress",
  "red",
  "green",
  "blue",
  "alpha",
] as const;

/** A scene camera as the world view shares the display list between two. */
export interface SharedCamera extends ViewCamera {
  readonly id: number;
  readonly fadeEffect: FadeState;
}

/** What of a world scene the view drives. A `Phaser.Scene` is one. */
export interface WorldViewScene extends EndingScene {
  cameras: {
    main: SharedCamera;
    add(x: number, y: number, width: number, height: number): SharedCamera;
  };
  children: { readonly list: readonly Drawn[] };
  events: EndingScene["events"] & {
    on(event: "prerender", fn: () => void): unknown;
    off(event: "prerender", fn: () => void): unknown;
  };
}

/** Whether the HUD's camera draws `object`: camera-fixed, at the HUD's depth or over. */
export function drawnByHud(object: Drawn): boolean {
  return (
    object.scrollFactorX === 0 &&
    object.scrollFactorY === 0 &&
    (object.depth ?? 0) >= HUD_DEPTH_FLOOR
  );
}

/**
 * Gives each of `list` to one camera: the HUD's ({@link drawnByHud}) or the world's. Only the two
 * cameras' bits of each object's filter are touched. Top-level objects only: a container's children
 * are drawn by whichever camera draws it.
 */
export function shareOut(
  list: readonly Drawn[],
  world: Pick<SharedCamera, "id">,
  hud: Pick<SharedCamera, "id">,
): void {
  for (const object of list) {
    const filter = object.cameraFilter;
    object.cameraFilter = drawnByHud(object)
      ? (filter | world.id) & ~hud.id
      : (filter | hud.id) & ~world.id;
  }
}

/** Copies `from`'s fade onto `to`, so `to` is faded as `from` is this frame. */
export function copyFade(from: FadeState, to: FadeState): void {
  const source = from as unknown as Record<string, unknown>;
  const target = to as unknown as Record<string, unknown>;
  for (const field of FADE_FIELDS) target[field] = source[field];
}

/**
 * Stands `scene`'s world camera {@link WORLD_ZOOM} closer and puts the HUD's camera over it, until
 * the scene ends; its cameras go with it, and the next start calls this again. Called first thing in
 * a world's `create`, before anything laid out for the world camera's zoom (the atmosphere) is made.
 * Returns the HUD's camera.
 */
export function zoomWorldView(
  scene: WorldViewScene,
  zoom: number = WORLD_ZOOM,
  view: View = viewport,
): SharedCamera {
  const world = scene.cameras.main;
  zoomWorld(world, zoom, view);
  const hud = scene.cameras.add(0, 0, world.width, world.height);
  fitCamera(hud, view);
  const share = () => {
    shareOut(scene.children.list, world, hud);
    copyFade(world.fadeEffect, hud.fadeEffect);
  };
  share();
  scene.events.on("prerender", share);
  onSceneEnd(scene, () => scene.events.off("prerender", share));
  return hud;
}
