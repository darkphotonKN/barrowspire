// Architectural heights the client places baked art by, in world units (tile edges).
//
// Dependency-free on purpose, like projection.js: the client mirrors these in
// src/render/world/bake.ts, and its parity test imports this file directly. models/architecture.js
// builds with them and re-exports them.

/** Full-height (back) and cut-away (front) wall heights. A roof's eave sits on the back wall's top. */
export const WALL_BACK = 3.6;
export const WALL_FRONT = 1.1;

/** How much higher each roof slope row sits than the one below it. */
export const ROOF_RISE = 0.7;
