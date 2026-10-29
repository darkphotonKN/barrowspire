// A quadruped's body length: the manifest's `length` (src/render/art/manifest.ts), the measure its
// size tier is taken by (guideline "Size is a threat tier", FS-X2F2H §H R61). A standing figure is
// measured by its height (`crown`, lib/crown.mjs); a quadruped by its length, rump to snout.
//
// It is measured side-on. In the isometric view a world tile edge runs at 45° to the screen, so
// the two facings whose world direction is (1, -1) or (-1, 1), ne and sw, lay the body along the
// screen's horizontal at K1 px per world unit, with no foreshortening. A height runs at
// K1·cos30° px per unit, so a length of L px reads as L·cos30° px of height.

/**
 * Alpha at or above which a pixel counts as part of the body. Higher than the crown's: the ground
 * shadow is drawn at half alpha (baker.js, 128 at its darkest), and side-on it lies along the body,
 * so it would lengthen a quadruped where it can never raise a head.
 */
const OPAQUE = 160;

/** The facings a body length is measured in: the body lies along the screen. */
export const SIDE_ON = ["sw", "ne"];

/**
 * Screen px across the opaque silhouette, the widest across `frames`.
 *
 * @param {Buffer[]} frames RGBA pixels, straight alpha, all `frameWidth` wide
 * @param {number} frameWidth
 * @returns {number | undefined} undefined when no pixel is opaque
 */
export function bodyLength(frames, frameWidth) {
  let longest;
  for (const px of frames) {
    let left = Infinity;
    let right = -1;
    for (let i = 3; i < px.length; i += 4) {
      if (px[i] < OPAQUE) continue;
      const x = ((i - 3) / 4) % frameWidth;
      if (x < left) left = x;
      if (x > right) right = x;
    }
    if (right >= 0) longest = Math.max(longest ?? 0, right - left + 1);
  }
  return longest;
}
