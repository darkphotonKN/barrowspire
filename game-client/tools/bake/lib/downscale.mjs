// A frame baked at `scale` px per screen px (FS-HF0WW), brought back to 1× for the measures
// the manifest records in screen px (`crown`, `length`), so a 2× sheet's head height means what a
// 1× sheet's does.

import { wholeStep } from "../page/step.mjs";

/**
 * Box-filters straight-alpha RGBA `w × h` down by `k` each way, averaging in premultiplied alpha
 * as the baker's own filter does (page/baker.js `downsample`). Integer arithmetic, so repeatable.
 *
 * @param {Uint8Array | Buffer} px straight RGBA, `w × h`
 * @param {number} w
 * @param {number} h
 * @param {number} k a factor of both `w` and `h`: a whole number, or 1.5 (`w`, `h` multiples of 3)
 * @returns {Buffer} straight RGBA, `w / k × h / k`
 */
export function downscale(px, w, h, k) {
  if (k === 1) return Buffer.from(px);
  if (w % k || h % k) throw new Error(`downscale: ${w}×${h} is not a multiple of ${k}`);
  // a fractional factor (1.5, ADR-0076) is an exact area filter as a nearest blow-up by its step
  // and then a whole box: at 1.5, ×2 then /3, so a 1x px takes its corner 1.5x px whole, an edge
  // one half and the middle a quarter
  const q = wholeStep(k);
  if (q !== 1) return downscale(blowUp(px, w, h, q), w * q, h * q, k * q);
  const ow = w / k;
  const oh = h / k;
  const out = Buffer.alloc(ow * oh * 4);
  for (let y = 0; y < oh; y++)
    for (let x = 0; x < ow; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < k; sy++)
        for (let sx = 0; sx < k; sx++) {
          const i = ((y * k + sy) * w + x * k + sx) * 4;
          const al = px[i + 3];
          r += px[i] * al;
          g += px[i + 1] * al;
          b += px[i + 2] * al;
          a += al;
        }
      if (a === 0) continue;
      const o = (y * ow + x) * 4;
      out[o] = Math.round(r / a);
      out[o + 1] = Math.round(g / a);
      out[o + 2] = Math.round(b / a);
      out[o + 3] = Math.round(a / (k * k));
    }
  return out;
}

/** Each px of straight RGBA `w × h` repeated `q × q` times (nearest-neighbour). */
function blowUp(px, w, h, q) {
  const out = Buffer.alloc(w * q * h * q * 4);
  for (let y = 0; y < h * q; y++)
    for (let x = 0; x < w * q; x++) {
      const s = (Math.floor(y / q) * w + Math.floor(x / q)) * 4;
      const o = (y * w * q + x) * 4;
      out[o] = px[s];
      out[o + 1] = px[s + 1];
      out[o + 2] = px[s + 2];
      out[o + 3] = px[s + 3];
    }
  return out;
}
