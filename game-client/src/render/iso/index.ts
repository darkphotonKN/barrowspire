/**
 * The isometric projection layer (ADR-0020, FS-2325V §A). Scenes import from here.
 * World positions in, screen positions out; see game-client/CONTEXT.md
 * "Rendering terms".
 */
export {
  PLANE_TRANSFORM,
  TILE_HEIGHT,
  TILE_WIDTH,
  WORLD_PX_PER_TILE,
  depthKey,
  projectedBounds,
  screenToWorld,
  worldToScreen,
  type Point,
  type Rect,
} from "./projection";
export {
  facingFrom,
  nearestScreenFacing,
  type Facing8,
  type ScreenFacing,
} from "./facing";
export {
  WORLD_DEPTH,
  boxFaces,
  outsideConvex,
  projectRect,
  raise,
  splitAlongLength,
  worldDepth,
} from "./shapes";
export { addWorldPlane, type WorldPlane } from "./plane";
export { WALL_HEIGHT, addUprightBlock, standAt, type BlockStyle } from "./draw";
