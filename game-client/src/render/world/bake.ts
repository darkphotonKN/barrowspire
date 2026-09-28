/**
 * Facts about the baked art that placement needs and the manifest does not carry.
 *
 * The bake runs outside the Next bundle, so these are mirrored here rather than imported. They
 * must equal `tools/bake/page/projection.js` (TILE_W, K1, VPX) and `tools/bake/page/dimensions.js`
 * (WALL_BACK, WALL_FRONT, ROOF_RISE); `bake.test.ts` imports both and fails on any drift. If one
 * side changes, both change and the art is re-baked.
 */

/** Screen px per world unit in the bake's view plane: `TILE_WIDTH / 2 / cos45°`. */
const K1 = 32 / Math.SQRT1_2;

export const BAKE = {
  /** Screen px per three.js unit (one tile edge) of height: `K1 · cos30°` ≈ 39.19. */
  VPX: K1 * Math.cos(Math.PI / 6),
  /** Full-height (back) wall, in tile edges. A roof's eave sits on its top. */
  WALL_BACK: 3.6,
  /** Cut-away (front) wall, in tile edges. */
  WALL_FRONT: 1.1,
  /** How much higher each roof slope row sits than the one below it, in tile edges. */
  ROOF_RISE: 0.7,
} as const;
