/**
 * The logical view and the render scale (FS-ZAJMH §A): who owns them (`viewport`), how a camera
 * is fitted, bounded and made to follow under them (`camera`), how the game follows a change
 * (`game`), how a mask is laid in screen space (`mask`), how the HUD keeps to the view's edges
 * (`anchor`), the corner the fullscreen button keeps (`fullscreenButton`), and every game object
 * rounded to the backing px (`rounding`, ADR-0057), installed once by whatever configures a game
 * (the game bridge, the dev gallery). The Phaser plugin is imported from `./ViewportFit` by the
 * game bridge alone.
 */
export {
  LOGICAL_HEIGHT,
  LOGICAL_MAX_WIDTH,
  LOGICAL_MIN_WIDTH,
  LOGICAL_WIDTH,
  RENDER_SCALE_CAP,
  backingSize,
  fitView,
  viewport,
  type View,
} from "./viewport";
export { anchorAt, relayoutOn, type Anchor, type Placement } from "./anchor";
export {
  STAGE_WIDTH,
  boundCamera,
  centreStage,
  followWith,
  roundAtAnyZoom,
  roundsPixels,
  stagePoint,
  viewRect,
  type ViewCamera,
} from "./camera";
export { crispen } from "./crispen";
export { roundEveryObject } from "./rounding";
export {
  fillMaskArea,
  maskInView,
  type MaskArea,
  type MaskCamera,
  type Maskable,
  type MaskShape,
  type ViewMask,
} from "./mask";
export { fitGame, mountViewport, watchDensity, watchFrame } from "./game";
export {
  FULLSCREEN_BUTTON,
  FULLSCREEN_BUTTON_CLEARANCE,
} from "./fullscreenButton";
