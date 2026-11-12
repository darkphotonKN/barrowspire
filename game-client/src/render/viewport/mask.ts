/**
 * A mask in screen space under Phaser 4 (Phaser 3's `GeometryMask` and `BitmapMask` both were):
 * the target shows only where `source` draws, or with `invert` only where it does not, `source`
 * drawn through the scene's camera as it would be drawn on screen. Phaser 4 has masks only as a
 * filter (`filters.external.addMask`) under WebGL; `setMask` is the canvas renderer's alone.
 *
 * Two Phaser 4.2.1 bugs (`gameobjects/components/Filters.js`) break a filtered object under this
 * game's camera (origin 0, zoom = render scale, ADR-0056), so the mask corrects them here, once
 * (ADR-0057 §Masks). Each has a test in `mask.test.ts`; a Phaser bump re-runs them and drops the
 * correction Phaser has fixed.
 *
 * - An object whose filters "focus the context" (every Shape, and a Container or Graphics, which
 *   have no bounds) is drawn through a filter camera that copies the main camera's scroll, zoom
 *   and size but not its origin (`focusFiltersOnCamera`), so at any zoom but 1 it lands as if the
 *   camera's origin were 0.5: half a view off. The filter camera is given the main camera's
 *   origin. Upstream: phaserjs/phaser#7402.
 * - Such an object is drawn with the camera's scroll whatever its scroll factor
 *   (`renderWebGLFilters`), so a camera-fixed one (`setScrollFactor(0)`) slides with the world.
 *   A camera-fixed object that has a size (a Shape: the blackout's darks) is focused on itself
 *   instead, where its scroll factor holds. A camera-fixed Graphics or Container has no size to
 *   focus on and is not corrected; none is masked today. The chat window's Layer is masked and
 *   has no size either, and is safe: a Layer has no transform or scroll factor of its own, its
 *   children keep theirs (Phaser forces only the filtered object's scroll factor to 1, not its
 *   children's), so its camera-fixed lines stay put under the camera's scroll. Not filed upstream
 *   (repro prepared in I-ADR0057-2).
 *
 * And one loss of detail (owner 2026-11-12: "信箱的內文好像解析度有點差"; FS-1GZGD § Change C6): an
 * object focused on itself (`focusFilters`) is drawn into a framebuffer of its own width and
 * height at zoom 1/scale (`setFilterSize`; `renderNodes/Camera.js` sizes the internal context by
 * the filter camera). A Text's width is in logical units while its texture is rasterised at the
 * render scale (`installCrispText`), so a masked Text was drawn down to one px a unit there and
 * scaled back up by the camera's zoom: soft at render scale 1.5 and 2. A Text (what carries a
 * `style`) is drawn through the context instead, whose framebuffer is the camera's own, in backing
 * px, with the main camera's origin (the first correction) and its filter camera scrolled as its
 * scroll factor says (the second bug's fix for it: Phaser's `focusFiltersOnCamera` copies the
 * camera's scroll whatever the factor, so the focus is wrapped to scroll it by the factor). An
 * Image keeps its own focus: its width is its frame's, in texture px, and loses nothing.
 *
 * No Phaser import: it reads only what a game object and a camera carry.
 */

import { viewport } from "./viewport";

/** What of a scene's camera the mask reads. A `Phaser.Cameras.Scene2D.Camera` is one. */
export interface MaskCamera {
  readonly originX: number;
  readonly originY: number;
}

/** The mask filter on a target: its source can be swapped (`setGameObject`). */
export interface ViewMask {
  setGameObject(source: object): unknown;
  invert: boolean;
}

/** The scene camera a context-focused filter camera copies on each draw (`focusFiltersOnCamera`). */
export interface FocusCamera {
  readonly scrollX: number;
  readonly scrollY: number;
}

/** What of a game object a mask is laid on. A Phaser 4 Image, Text, Shape or Container is one. */
export interface Maskable {
  readonly scrollFactorX: number;
  readonly scrollFactorY: number;
  readonly width?: number;
  readonly height?: number;
  /** A Text's style; nothing else carries one. */
  readonly style?: unknown;
  filtersFocusContext: boolean;
  readonly filterCamera?: {
    setOrigin(x: number, y?: number): unknown;
    setScroll?(x: number, y: number): unknown;
  } | null;
  /** Phaser's focus on the drawing camera, run on each draw of a context-focused object. */
  focusFiltersOnCamera?(camera: FocusCamera): unknown;
  readonly filters?: {
    external: {
      addMask(
        source: unknown,
        invert?: boolean,
        viewCamera?: unknown,
      ): ViewMask;
    };
  } | null;
  enableFilters(): unknown;
  setMask?(mask: unknown): unknown;
}

/** A shape a canvas-renderer fallback can clip by (a Graphics). */
interface GeometrySource {
  createGeometryMask?(): unknown;
}

/**
 * Masks `target` by `source` in screen space, through `camera` (the scene's main camera), and
 * returns the mask. Under the canvas renderer there are no filters: an uninverted shape (a
 * Graphics) still clips the target, as Phaser 3's geometry mask did there; anything else leaves
 * the target unmasked, as Phaser 3's bitmap mask did, and undefined is returned.
 */
export function maskInView(
  target: Maskable,
  source: object,
  camera: MaskCamera,
  invert = false,
): ViewMask | undefined {
  target.enableFilters();
  if (!target.filters) {
    const shape = source as GeometrySource;
    if (!invert && shape.createGeometryMask && target.setMask)
      target.setMask(shape.createGeometryMask());
    return undefined;
  }
  if (target.style !== undefined) {
    focusTextOnContext(target, camera);
  } else if (target.filtersFocusContext === true) {
    const fixed = target.scrollFactorX === 0 && target.scrollFactorY === 0;
    const sized = (target.width ?? 0) > 0 && (target.height ?? 0) > 0;
    if (fixed && sized) target.filtersFocusContext = false;
    else target.filterCamera?.setOrigin(camera.originX, camera.originY);
  }
  return target.filters.external.addMask(source, invert, camera);
}

/**
 * A Text drawn through the context, so its framebuffer is the camera's in backing px and the text
 * keeps the resolution it was rasterised at: the camera's origin (the first correction), and on
 * each draw, after Phaser's own focus copies the camera, its filter camera scrolled as the Text's
 * scroll factor says, so a camera-fixed Text stays put while the camera follows the player.
 */
function focusTextOnContext(target: Maskable, camera: MaskCamera): void {
  target.filtersFocusContext = true;
  const filterCamera = target.filterCamera;
  filterCamera?.setOrigin(camera.originX, camera.originY);
  const focus = target.focusFiltersOnCamera?.bind(target);
  if (!focus) return;
  target.focusFiltersOnCamera = (view: FocusCamera) => {
    focus(view);
    filterCamera?.setScroll?.(view.scrollX * target.scrollFactorX, view.scrollY * target.scrollFactorY);
    return target;
  };
}

/** What of a Graphics a mask's area is drawn with. */
export interface MaskShape {
  fillStyle(colour: number, alpha?: number): unknown;
  fillRect(x: number, y: number, width: number, height: number): unknown;
}

/** A rectangle in logical units. */
export interface MaskArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Fills `area` (logical units) on a mask's `shape` so that it clips as Phaser 3.90 clipped by
 * the same rectangle at `renderScale`. 3.90's geometry mask was a stencil drawn into the game's
 * multisampled canvas (antialiased, Phaser's default), so a backing px that an edge of the area
 * crosses was let through by the share of it the area covers. Phaser 4's mask filter multiplies
 * by its mask's alpha (`FilterMask-frag.js`), read from a texture with no multisampling, so a
 * rectangle drawn as it is would clip each such px wholly or not at all, a row or column off
 * 3.90 where an edge falls on half a px (render scale 1.5). So the area is drawn in whole backing
 * px: the inside at full alpha, each edge's row or column at the share the area covers (a
 * corner's at both shares). Where every edge lies on whole backing px (render scale 1 and 2 for
 * this game's layouts), that is the area itself, once, at full alpha. Whole backing px are also
 * what `fullAuto` rounding (ADR-0057) leaves where they are. `colour` is never seen, only alpha.
 *
 * 3.90 counted that share in samples (4 a px on the GPU probed, at 1/8, 3/8, 5/8, 7/8), so the
 * exact share here is 3.90's wherever an edge falls on a quarter px, and up to 1/8 off where it
 * falls on an eighth (a half-unit edge at render scale 1.25), or at a corner, where the samples
 * are not the product of the shares (I-ADR0057-2 Answer, left for Nick in I-ADR0057-5).
 */
export function fillMaskArea(
  shape: MaskShape,
  area: MaskArea,
  colour: number,
  renderScale: number = viewport.renderScale,
): void {
  const columns = shares(area.x * renderScale, (area.x + area.width) * renderScale);
  const rows = shares(area.y * renderScale, (area.y + area.height) * renderScale);
  for (const [top, bottom, rowShare] of rows)
    for (const [left, right, columnShare] of columns) {
      shape.fillStyle(colour, rowShare * columnShare);
      shape.fillRect(
        left / renderScale,
        top / renderScale,
        (right - left) / renderScale,
        (bottom - top) / renderScale,
      );
    }
}

/**
 * The backing px from `start` to `end` along one axis, as runs `[from, to, share]` of whole px:
 * the px each end falls inside, at the share of it covered, and the whole px between, at 1.
 */
function shares(start: number, end: number): [number, number, number][] {
  const from = onGrid(start);
  const to = onGrid(end);
  if (to <= from) return [];
  const first = Math.floor(from);
  const last = Math.ceil(to);
  if (last - first === 1) return [[first, last, to - from]];
  const runs: [number, number, number][] = [];
  const inside = [Math.ceil(from), Math.floor(to)];
  if (from > first) runs.push([first, first + 1, first + 1 - from]);
  if (inside[1] > inside[0]) runs.push([inside[0], inside[1], 1]);
  if (to > inside[1]) runs.push([inside[1], inside[1] + 1, to - inside[1]]);
  return runs;
}

/** `v` on the whole backing px it is within float error of (497 × 1.1 is 546.7000000000001). */
function onGrid(v: number): number {
  const whole = Math.round(v);
  return Math.abs(v - whole) < 1e-6 ? whole : v;
}
