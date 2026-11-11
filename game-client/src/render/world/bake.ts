/**
 * Facts about the baked art that placement needs and the manifest does not carry.
 *
 * The bake runs outside the Next bundle, so these are mirrored here rather than imported. They
 * must equal `tools/bake/page/projection.js` (TILE_W, K1, VPX), `tools/bake/page/dimensions.js`
 * (WALL_BACK, WALL_FRONT, ROOF_RISE) and `tools/bake/page/shadow.js` (the key light, the shadow
 * catcher, the wall and post feet); `bake.test.ts` imports all three and fails on any drift. If
 * one side changes, both change and the art is re-baked.
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
  /**
   * The key light's direction (toward the light), not normalised, in the bake's axes: +x is world
   * x, +y is up, +z is world y. A point h up shadows the ground h · (-x / y) along world x and
   * h · (-z / y) along world y.
   */
  KEY_LIGHT: [-1, 2.83, 1],
  /** The bake's shadow catcher: black (`0x000000`), a fact of the bake and not a palette colour. */
  SHADOW_COLOR: 0,
  /** How dark a baked ground shadow is: the catcher's opacity. */
  SHADOW_OPACITY: 0.5,
  /** How thick a wall piece stands on the ground, by material, in tile edges. */
  WALL_FOOT: { timber: 0.18, masonry: 0.24 },
  /** The side of a corner post's square foot, in tile edges. */
  POST_FOOT: 0.24,
} as const;
