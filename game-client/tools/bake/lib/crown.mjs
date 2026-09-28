// A character's head height: the manifest's `crown` (src/render/art/manifest.ts), so a scene can
// seat the name plate and HP bar just over the head (FS-2325V §C.9). A frame's top is no guide:
// frames are padded to fit the widest attack and the longest death, so the idle head sits well
// below it.

/** Alpha at or above which a pixel counts as part of the silhouette, not a fringe or a shadow. */
const OPAQUE = 128;

/**
 * Screen px from the anchor up to the top of the opaque silhouette, the tallest across `frames`.
 *
 * @param {Buffer[]} frames RGBA pixels, straight alpha, all `frameWidth` wide
 * @param {number} frameWidth
 * @param {number} anchorY the anchor's row in the frame, px
 * @returns {number | undefined} undefined when no pixel is opaque
 */
export function crownHeight(frames, frameWidth, anchorY) {
  let top = Infinity;
  for (const px of frames) {
    const rows = px.length / (frameWidth * 4);
    for (let y = 0; y < Math.min(rows, top); y++) {
      const row = y * frameWidth * 4;
      let hit = false;
      for (let x = 0; x < frameWidth && !hit; x++) hit = px[row + x * 4 + 3] >= OPAQUE;
      if (hit) {
        top = y;
        break;
      }
    }
  }
  return top === Infinity ? undefined : Math.round(anchorY - top);
}
