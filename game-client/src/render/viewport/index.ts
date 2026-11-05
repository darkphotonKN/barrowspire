/**
 * The logical view and the render scale (FS-ZAJMH §A): who owns them (`viewport`), how a camera
 * is fitted, bounded and made to follow under them (`camera`), how the game follows a change
 * (`game`), how the HUD keeps to the view's edges (`anchor`), and the corner the fullscreen
 * button keeps (`fullscreenButton`). The Phaser plugin is imported from `./ViewportFit` by the game
 * bridge alone.
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
export { fitGame, mountViewport, watchDensity, watchFrame } from "./game";
export {
  FULLSCREEN_BUTTON,
  FULLSCREEN_BUTTON_CLEARANCE,
} from "./fullscreenButton";
