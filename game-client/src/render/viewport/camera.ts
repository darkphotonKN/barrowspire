/**
 * The camera side of the render scale (FS-ZAJMH §A, mechanism from I-ZAJMH-1's spike).
 *
 * One camera per scene, sized to the backing store, zoomed by the render scale, origin 0: a
 * camera-fixed object at logical (x, y) draws at backing (rs·x, rs·y), so the HUD keeps its
 * logical coordinates. Phaser's follow, bounds and view maths assume origin 0.5, so scenes
 * reach `setBounds` and `startFollow` only through here, and never read `worldView` or
 * `midPoint` (both wrong under origin 0): {@link viewRect} is the visible world.
 */

import {
  LOGICAL_MIN_WIDTH,
  backingSize,
  viewport,
  type View,
  type Viewport,
} from "./viewport";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

/** What of Phaser's `TransformMatrix` the pixel grid moves: a camera's view matrices. */
interface ViewMatrix {
  translate(x: number, y: number): unknown;
}

/** What of a Phaser camera the viewport drives. A `Phaser.Cameras.Scene2D.Camera` is one. */
export interface ViewCamera {
  readonly width: number;
  readonly height: number;
  readonly zoomX: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
  scrollX: number;
  scrollY: number;
  roundPixels: boolean;
  renderRoundPixels: boolean;
  useBounds: boolean;
  setSize(width: number, height: number): unknown;
  setZoom(zoom: number): unknown;
  setOrigin(x: number, y?: number): unknown;
  setBounds(x: number, y: number, width: number, height: number): unknown;
  setScroll(x: number, y: number): unknown;
  setFollowOffset(x: number, y: number): unknown;
  startFollow(
    target: Point,
    roundPixels: boolean,
    lerpX: number,
    lerpY: number,
    offsetX: number,
    offsetY: number,
  ): unknown;
  clampX(x: number): number;
  clampY(y: number): number;
  preRender(): void;
  /**
   * Built by `preRender` from the scroll. `getViewMatrix(true)` is the camera's own `matrix`
   * (Phaser's typings leave the field out); the renderer reads it or `matrixCombined`.
   */
  getViewMatrix(forceComposite: boolean): ViewMatrix;
  readonly matrixCombined: ViewMatrix;
}

/** What of a camera the pixel grid reads and writes ({@link keepOnPixelGrid}). */
export type PixelGridCamera = Pick<
  ViewCamera,
  | "preRender"
  | "roundPixels"
  | "renderRoundPixels"
  | "zoomX"
  | "scrollX"
  | "scrollY"
  | "useBounds"
  | "clampX"
  | "clampY"
  | "getViewMatrix"
  | "matrixCombined"
>;

/** How fast the camera catches its target, as every world has always followed. */
const FOLLOW_LERP = 0.1;

/** What the viewport remembers of a camera, to put it back after a re-fit. */
interface Fitted {
  bounds?: Rect;
  target?: Point;
  /** A canvas menu's stage width, centred in the view ({@link centreStage}). */
  stage?: number;
}

/**
 * The width a canvas menu is laid out in: today's view, the narrowest the logical view gets. A
 * wider view shows the same stage centred, its backdrop reaching the edges.
 */
export const STAGE_WIDTH = LOGICAL_MIN_WIDTH;

const fitted = new WeakMap<ViewCamera, Fitted>();

function stateOf(cam: ViewCamera): Fitted {
  let state = fitted.get(cam);
  if (!state) {
    state = {};
    fitted.set(cam, state);
  }
  return state;
}

/**
 * Sizes `cam` to the backing store at the view's render scale, zoomed by it, origin 0. Safe to
 * call again on a re-fit: bounds and follow set through here are put back for the new size. The
 * first fit also puts the camera on the pixel grid ({@link keepOnPixelGrid}, once per camera).
 */
export function fitCamera(cam: ViewCamera, view: View = viewport): void {
  keepOnPixelGrid(cam);
  const state = stateOf(cam);
  const { width, height } = backingSize(view);
  cam.setSize(width, height);
  cam.setZoom(view.renderScale);
  cam.setOrigin(0, 0);
  if (state.bounds) applyBounds(cam, state.bounds);
  if (state.target) centreOn(cam, state.target);
  if (state.stage !== undefined) applyStage(cam, state.stage);
}

/**
 * Centres a stage `width` logical units wide in the camera's view, now and after every re-fit:
 * a canvas menu laid out at {@link STAGE_WIDTH} stays in the middle of a wider view (FS-ZAJMH
 * R11). For a camera with no bounds and no follow.
 */
export function centreStage(cam: ViewCamera, width = STAGE_WIDTH): void {
  const state = stateOf(cam);
  state.stage = width;
  applyStage(cam, width);
}

function applyStage(cam: ViewCamera, width: number): void {
  cam.setScroll((width - cam.displayWidth) / 2, 0);
}

/**
 * A pointer's place on a centred stage ({@link centreStage}), in the logical units the menu is
 * laid out in: its logical position plus the camera's scroll. Phaser's own hit tests need none
 * of this; a menu's hand-made hit test reads it.
 */
export function stagePoint(
  cam: Pick<ViewCamera, "scrollX" | "scrollY">,
  pointer: { x: number; y: number },
  vp: Pick<Viewport, "toLogical"> = viewport,
): Point {
  const at = vp.toLogical(pointer);
  return { x: at.x + cam.scrollX, y: at.y + cam.scrollY };
}

/**
 * Bounds the camera to `rect` in world units. Phaser's clamp assumes origin 0.5; shifting the
 * rect by half the difference between the camera's px and its view cancels that exactly.
 */
export function boundCamera(cam: ViewCamera, rect: Rect): void {
  const state = stateOf(cam);
  state.bounds = { ...rect };
  applyBounds(cam, state.bounds);
}

function applyBounds(cam: ViewCamera, b: Rect): void {
  const sx = (cam.width - cam.displayWidth) / 2;
  const sy = (cam.height - cam.displayHeight) / 2;
  cam.setBounds(b.x + sx, b.y + sy, b.width, b.height);
}

/**
 * Follows `target`, kept in the middle of the view, and on it from this frame: Phaser's own snap
 * uses the origin-0.5 half width and would start a whole view off. The camera's rounding is left
 * as it is (Phaser's `startFollow` sets `roundPixels` to its argument); the pixel grid keeps the
 * scroll on whole backing px.
 */
export function followWith(cam: ViewCamera, target: Point): void {
  const state = stateOf(cam);
  state.target = target;
  cam.startFollow(
    target,
    roundsPixels(cam),
    FOLLOW_LERP,
    FOLLOW_LERP,
    cam.displayWidth / 2,
    cam.displayHeight / 2,
  );
  centreOn(cam, target);
}

function centreOn(cam: ViewCamera, target: Point): void {
  cam.setFollowOffset(cam.displayWidth / 2, cam.displayHeight / 2);
  cam.setScroll(
    target.x - cam.displayWidth / 2,
    target.y - cam.displayHeight / 2,
  );
}

/** The world the camera shows, in world units: its scroll and its logical size. */
export function viewRect(
  cam: Pick<
    ViewCamera,
    "scrollX" | "scrollY" | "displayWidth" | "displayHeight"
  >,
): Rect {
  return {
    x: cam.scrollX,
    y: cam.scrollY,
    width: cam.displayWidth,
    height: cam.displayHeight,
  };
}

/**
 * `value` floored onto the 1/`scale` grid, or with a clamp, the nearest step inside it. A value
 * already on the grid stays put (no float creep down a step).
 */
export function onGrid(
  value: number,
  scale: number,
  clamp?: (v: number) => number,
): number {
  const snapped = Math.floor(value * scale + GRID_EPSILON) / scale;
  if (!clamp) return snapped;
  const held = clamp(snapped);
  if (held === snapped) return snapped;
  return held > snapped
    ? Math.ceil(held * scale - GRID_EPSILON) / scale
    : Math.floor(held * scale + GRID_EPSILON) / scale;
}

/** How far below a grid step a value may sit and still count as on it: float error, not distance. */
const GRID_EPSILON = 1e-6;

/** The cameras on the pixel grid, and whether each one's game asked for px rounding. */
const gridded = new WeakMap<object, boolean>();

/**
 * Whether `cam` draws rounded to px: for a camera on the pixel grid, the rounding it keeps
 * ({@link keepOnPixelGrid}), which a `startFollow` may have cleared from Phaser's flag until the
 * next frame; for any other, its `roundPixels`. What another texture matching it reads.
 */
export function roundsPixels(cam: { roundPixels: boolean }): boolean {
  return gridded.get(cam) ?? cam.roundPixels;
}

/**
 * Keeps px rounding on at a fractional render scale (FS-ZAJMH R4, ADR-0057). Every game object
 * rounds its quad's corners to backing px whenever the camera's `roundPixels` is on (`fullAuto`,
 * `roundEveryObject`), at any zoom; so this camera's `roundPixels` stays on, and after Phaser's
 * own frame set-up its scroll is floored onto the 1/zoom grid (whole backing px), and the view
 * matrix Phaser built from the unfloored scroll is moved with it, so the frame is drawn at the
 * scroll kept. A still world then keeps its px, and each sprite its width, as the camera moves,
 * at 1.25 and 1.5 too, and every lerp step left or up moves it, so a following camera never
 * sticks. At zoom 1 the grid is whole world units.
 *
 * The game's `roundPixels` at the first wrap is the wish, and a later `roundPixels = true` is
 * taken over; it is put back before each frame, since Phaser's `startFollow` sets the flag to
 * its argument. Phaser 4's `preRender` no longer floors scroll under `roundPixels` (3.90 did, which
 * threw away lerp steps under a unit), so the flag can stay on. `renderRoundPixels` is forced on
 * for the canvas renderer alone, which reads it and which Phaser sets at a whole zoom only; WebGL
 * never reads it. Wraps a camera's frame set-up once, however often it is called.
 */
export function keepOnPixelGrid(cam: PixelGridCamera): void {
  if (gridded.has(cam)) return;
  gridded.set(cam, cam.roundPixels);
  const frame = cam.preRender.bind(cam);
  cam.preRender = () => {
    if (cam.roundPixels) gridded.set(cam, true);
    const rounds = gridded.get(cam) === true;
    cam.roundPixels = rounds;
    frame();
    if (!rounds) return;
    const z = cam.zoomX;
    const x = onGrid(
      cam.scrollX,
      z,
      cam.useBounds ? (v) => cam.clampX(v) : undefined,
    );
    const y = onGrid(
      cam.scrollY,
      z,
      cam.useBounds ? (v) => cam.clampY(v) : undefined,
    );
    drawAt(cam, x, y);
    cam.renderRoundPixels = true;
  };
}

/**
 * Moves `cam` to scroll (`x`, `y`) after its frame set-up, its view matrices with it. Phaser built
 * `matrix` from the scroll as it was, the scroll applied last (innermost), and `matrixCombined` as
 * `matrixExternal` × `matrix`; so moving the scroll by d is a translate by −d on the right of
 * both, which is what `translate` does.
 */
function drawAt(cam: PixelGridCamera, x: number, y: number): void {
  const dx = x - cam.scrollX;
  const dy = y - cam.scrollY;
  cam.scrollX = x;
  cam.scrollY = y;
  if (dx === 0 && dy === 0) return;
  cam.getViewMatrix(true).translate(-dx, -dy);
  cam.matrixCombined.translate(-dx, -dy);
}

/**
 * Px rounding switched on or off after each of `cam`'s frame set-ups as `rounds()` says, at any
 * zoom, its scroll untouched: for a camera whose owner keeps its scroll on the 1/zoom grid itself
 * (a render texture's, whose frame set-up Phaser 4 runs from `DynamicTexture.render`). Its
 * `roundPixels` is what an object stamped into the texture reads (`fullAuto`, ADR-0057), so the
 * stamps round as the main camera rounds the world; `renderRoundPixels` is the same for the
 * canvas renderer. Phaser types a render texture's camera as a `BaseCamera`, which has no frame
 * set-up; the one it makes is a full `Camera`, but a camera without one is left as it is.
 */
export function roundAtAnyZoom(
  cam: {
    preRender?: () => void;
    roundPixels: boolean;
    renderRoundPixels: boolean;
  },
  rounds: () => boolean,
): void {
  if (!cam.preRender) return;
  const frame = cam.preRender.bind(cam);
  cam.preRender = () => {
    frame();
    const on = rounds();
    cam.roundPixels = on;
    cam.renderRoundPixels = on;
  };
}
