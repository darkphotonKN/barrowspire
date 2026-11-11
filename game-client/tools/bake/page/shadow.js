// What casts a ground shadow in the bake, and from what foot: the key light, the shadow catcher,
// and how thick a wall or a corner post stands on the ground, in world units (tile edges).
//
// Dependency-free on purpose, like dimensions.js: the client paints wall shadows into the ground
// itself (FS-V8FT3 §C), so it mirrors these in src/render/world/bake.ts, and its parity test
// imports this file directly. baker.js lights and catches with them; the wall models build with
// them.

/**
 * Key light direction (toward the light), not normalised, in three.js axes: +x is world x, +y is
 * up, +z is world y. From screen-left and above, so shadows fall screen-right.
 */
export const KEY_LIGHT = [-1, 2.83, 1];

/** The shadow catcher: every baked ground shadow is this colour at this opacity. */
export const SHADOW_COLOR = 0x000000;
export const SHADOW_OPACITY = 0.5;

/** How thick a wall piece stands on the ground, by material: timber frame, masonry partition. */
export const WALL_FOOT = { timber: 0.18, masonry: 0.24 };

/** The side of a corner post's square foot: the timber post, and the masonry pier's core. */
export const POST_FOOT = 0.24;
