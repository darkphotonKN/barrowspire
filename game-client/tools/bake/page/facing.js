// The eight facings a character is baked in, and the order their frame lists are written.
//
// The names are the client's Facing8 (src/render/iso/facing.ts): world compass, n = world -y,
// e = world +x. The ORDER must equal DIRECTION_ORDER in src/render/art/manifest.ts, which the
// manifest records as `facings` and the client validates; facing.test.mjs holds the two equal.
// No three.js import, so it is testable in Node.

/** Clockwise from east, as seen from above the map with world y pointing down. */
export const FACINGS = ["e", "se", "s", "sw", "w", "nw", "n", "ne"];

const D = Math.SQRT1_2;
const VECTORS = {
  e: [1, 0],
  se: [D, D],
  s: [0, 1],
  sw: [-D, D],
  w: [-1, 0],
  nw: [-D, -D],
  n: [0, -1],
  ne: [D, -D],
};

/** The unit world vector (x, y) a facing points along. */
export function facingVector(facing) {
  const v = VECTORS[facing];
  if (!v) throw new Error(`facing: unknown facing "${facing}"`);
  return v;
}

/**
 * The y rotation that turns a model built facing three +z (world +y, "s") to `facing`.
 * three's +x is world +x and three's +z is world +y (projection.js); rotating +z by θ about +y
 * gives (sin θ, 0, cos θ), so θ = atan2(x, y).
 */
export function yawFor(facing) {
  const [x, y] = facingVector(facing);
  return Math.atan2(x, y);
}
