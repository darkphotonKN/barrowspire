// A sheet's frame box (FS-2325V §B, FS-HF0WW): the 1x box that holds every pose, padded, with the
// model origin (the footprint centre) on a whole px, and the frame a sheet baked at `scale` px
// per screen px takes over the same box. Pure arithmetic, so it is tested without a browser.

import { K1 } from "./projection.js";
import { wholeStep } from "./step.mjs";

export { wholeStep };

/**
 * The frame box of view-space `bounds` (world units in the camera's view plane: x right, y up,
 * the model origin at 0, 0), padded by `pad` world units each side, at `scale` px per screen px.
 * Returns the 1x box (`ax`, `ay`: the origin's px from its left and top edges; `w1`, `h1`: its
 * size) and the frame at `scale` (`frameWidth`, `frameHeight`, `anchorPx`). At a whole scale the
 * box is the padded bounds rounded up to whole px; at 1.5 each side of the origin is rounded on up
 * to an even px, so it may grow by one 1x px each side (ADR-0076).
 *
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
 * @param {{ pad: number, scale?: number }} options
 */
export function frameBox(bounds, { pad, scale = 1 }) {
  // each side of the origin up to a whole px, and at a fractional scale up to a multiple of its
  // step, so the frame and the anchor are whole px at `scale` (1.5: an even number of 1x px)
  const q = wholeStep(scale);
  const side = (v) => Math.ceil(Math.ceil(v * K1) / q) * q;
  const ax = side(-bounds.minX + pad);
  const ay = side(bounds.maxY + pad);
  const w1 = ax + side(bounds.maxX + pad);
  const h1 = ay + side(-bounds.minY + pad);
  return { ax, ay, w1, h1, frameWidth: w1 * scale, frameHeight: h1 * scale, anchorPx: [ax * scale, ay * scale] };
}
