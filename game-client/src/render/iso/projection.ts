/**
 * The projection: world positions on the 2:1 isometric diamond and back.
 *
 * ADR-0020 §3 / FS-2325V §A.2. The server's `x, y` (the *world position*, see
 * game-client/CONTEXT.md "Rendering terms") stays the single source of truth.
 * `worldToScreen` is applied only to place things on screen; `screenToWorld` only
 * to turn a pointer into a world target. Nothing here may feed a gameplay
 * calculation: distance, range, proximity and bounds all use world positions.
 *
 * Pure maths, no Phaser, so it is unit-tested in isolation.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The on-screen diamond, 2:1. */
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;

/**
 * How many server (world) pixels one tile spans, along either world axis.
 *
 * Calibrated from the server's entity sizes so a delver's collision footprint
 * spans roughly one tile (game-server/game-service/common/constants/game.go,
 * game-server/game-service/internal/game/session.go, hub_map.go):
 *
 * - `PlayerRadius = 20` → a delver's footprint is 40 world px across: one tile.
 * - run and hub wall thickness is `20` → half a tile, a wall reads as a wall and
 *   not as a floor strip.
 * - a run building's door gap is `50` → 1.25 tiles, one delver wide with room to
 *   spare, which is what walking through it feels like.
 *
 * So 40. At this scale one world pixel moves a sprite about 0.9 screen px, and
 * the run map (1440×960) projects to a 1920×960 diamond.
 */
export const WORLD_PX_PER_TILE = 40;

const HALF_W = TILE_WIDTH / 2 / WORLD_PX_PER_TILE;
const HALF_H = TILE_HEIGHT / 2 / WORLD_PX_PER_TILE;

/**
 * Where a world position is drawn. The world origin is the diamond's top vertex;
 * world +x runs down-right on screen and world +y runs down-left.
 */
export function worldToScreen(x: number, y: number): Point {
  return { x: (x - y) * HALF_W, y: (x + y) * HALF_H };
}

/**
 * The world position under a screen point (camera scroll already applied, e.g.
 * Phaser's `pointer.worldX/worldY`). Exact inverse of `worldToScreen`.
 */
export function screenToWorld(sx: number, sy: number): Point {
  const a = sx / HALF_W; // x - y
  const b = sy / HALF_H; // x + y
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/**
 * `worldToScreen` expressed as a rotation followed by a non-uniform scale, which is
 * how a Phaser container pair can carry it (see `addWorldPlane`): rotate the world
 * 45°, then squash it to the 2:1 diamond. It is the same linear map, not a second
 * projection; a test holds the two equal.
 */
export const PLANE_TRANSFORM = {
  rotation: Math.PI / 4,
  scaleX: HALF_W * Math.SQRT2,
  scaleY: HALF_H * Math.SQRT2,
} as const;

/**
 * Draw order for a footprint: larger keys are nearer the viewer and draw later.
 * ADR-0020 §7. A footprint, never a sprite's pixel bounds.
 */
export function depthKey(x: number, y: number): number {
  return x + y;
}

/**
 * The screen-space rectangle bounding the projected world `[0,w] × [0,h]`, grown by
 * `margin` screen px on every side. Used to clamp the camera in projected space.
 */
export function projectedBounds(
  width: number,
  height: number,
  margin = 0,
): Rect {
  const left = worldToScreen(0, height).x;
  const right = worldToScreen(width, 0).x;
  const bottom = worldToScreen(width, height).y;

  return {
    x: left - margin,
    y: 0 - margin, // the top vertex is the world origin; `-margin` would be -0
    width: right - left + margin * 2,
    height: bottom + margin * 2,
  };
}
