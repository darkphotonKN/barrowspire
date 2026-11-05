// A frame baked at `scale` px per screen px (spike/archer-2x), brought back to 1× for the measures
// the manifest records in screen px (`crown`, `length`), so a 2× sheet's head height means what a
// 1× sheet's does.

/**
 * Box-filters straight-alpha RGBA `w × h` down by `k` each way, averaging in premultiplied alpha
 * as the baker's own filter does (page/baker.js `downsample`). Integer arithmetic, so repeatable.
 *
 * @param {Uint8Array | Buffer} px straight RGBA, `w × h`
 * @param {number} w
 * @param {number} h
 * @param {number} k a whole factor of both `w` and `h`
 * @returns {Buffer} straight RGBA, `w / k × h / k`
 */
export function downscale(px, w, h, k) {
  if (k === 1) return Buffer.from(px);
  if (w % k || h % k) throw new Error(`downscale: ${w}×${h} is not a multiple of ${k}`);
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
