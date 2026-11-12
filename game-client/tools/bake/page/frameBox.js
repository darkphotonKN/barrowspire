// A sheet's frame box (FS-2325V §B, FS-HF0WW): the 1x box that holds every pose, padded, with the
// model origin (the footprint centre) on a whole px, and the frame a sheet baked at `scale` px
// per screen px takes over the same box. Pure arithmetic, so the bake page (baker.js) and the
// Node side share it, and it is tested without a browser.

import { K1 } from "./projection.js";

/**
 * The frame box of view-space `bounds` (world units in the camera's view plane: x right, y up,
 * the model origin at 0, 0), padded by `pad` world units each side, at `scale` px per screen px.
 * Returns the 1x box (`ax`, `ay`: the origin's px from its left and top edges; `w1`, `h1`: its
 * size) and the frame at `scale` (`frameWidth`, `frameHeight`, `anchorPx`).
 *
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
 * @param {{ pad: number, scale?: number }} options
 */
export function frameBox(bounds, { pad, scale = 1 }) {
  const ax = Math.ceil((-bounds.minX + pad) * K1);
  const ay = Math.ceil((bounds.maxY + pad) * K1);
  const w1 = ax + Math.ceil((bounds.maxX + pad) * K1);
  const h1 = ay + Math.ceil((-bounds.minY + pad) * K1);
  return { ax, ay, w1, h1, frameWidth: w1 * scale, frameHeight: h1 * scale, anchorPx: [ax * scale, ay * scale] };
}
