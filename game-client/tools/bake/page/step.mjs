// A sheet's step (ADR-0076): the least whole number of screen (1x) px that is a whole number of
// px at its `scale`. An ES module (.mjs) so both sides of the bake import it: the page (served
// from /page/, baker.js through frameBox.js) and Node (lib/trim.mjs, lib/downscale.mjs).

/**
 * The least whole number of 1x px that is a whole number of px at `scale` (ADR-0076 Decision 2):
 * 1 at a whole scale, 2 at 1.5. A sheet's frame box, and its trim grid in screen px, are cut on
 * it. Throws for a scale that is not a positive whole number of halves (the manifest validator
 * then narrows it to 1, 1.5, 2, 3 and 4).
 *
 * @param {number} scale
 */
export function wholeStep(scale) {
  if (!(scale > 0) || !Number.isInteger(scale * 2)) throw new Error(`bake: scale ${scale} is not a whole number of halves`);
  return Number.isInteger(scale) ? 1 : 2;
}
