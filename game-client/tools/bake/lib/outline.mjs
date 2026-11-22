// The outline figure (FS-1J1CB §Change: Looks v2 R51): how far a spec look's outline in a black
// fill differs from another's. Each look's idle frame in the `n`, `e`, `s` and `w` facings is
// brought back to game scale (1x screen px) and cut to its opaque mask; two looks' masks are laid
// on one anchor and XORed, and the differing px over all four facings are divided by the px either
// covers. 0 is the same outline, 1 two that share nothing. Logged by the bake beside the dark-room
// floor and printed on the outline strip; never gated (R51: no approved number exists yet).

import { downscale } from "./downscale.mjs";

/** The facings the figure is measured over (R51). */
export const OUTLINE_FACINGS = ["n", "e", "s", "w"];

/** A px a black fill shows: half alpha and up. */
const OPAQUE = 128;

/** Straight RGBA (w × h) → a mask of its opaque px, 1 where a black fill would show it. */
export function opaqueMask(rgba, w, h) {
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = rgba[i * 4 + 3] >= OPAQUE ? 1 : 0;
  return m;
}

/**
 * The outline figure over `pairs` of anchored masks (`{ mask, w, h, ax, ay }`, the anchor in px):
 * each pair laid on one anchor, the px set in exactly one of the two summed over every pair and
 * divided by the px set in either. Two empty masks give 0.
 */
export function outlineFigure(pairs) {
  let xor = 0;
  let union = 0;
  for (const [a, b] of pairs) {
    // the two frames in one space, the anchor at the origin
    const x0 = Math.min(-a.ax, -b.ax);
    const y0 = Math.min(-a.ay, -b.ay);
    const x1 = Math.max(a.w - a.ax, b.w - b.ax);
    const y1 = Math.max(a.h - a.ay, b.h - b.ay);
    const at = (m, x, y) => {
      const u = x + m.ax;
      const v = y + m.ay;
      return u >= 0 && v >= 0 && u < m.w && v < m.h ? m.mask[v * m.w + u] : 0;
    };
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const p = at(a, x, y);
        const q = at(b, x, y);
        if (p || q) union++;
        if (p !== q) xor++;
      }
  }
  return union ? xor / union : 0;
}

/** A baked sheet's idle frame in `facing`, at game scale, as an anchored mask. */
function idleMask(s, facings, facing) {
  const k = s.scale ?? 1;
  const w = s.frameWidth / k;
  const h = s.frameHeight / k;
  const b64 = s.animations.idle.frames[facings.indexOf(facing)][0];
  const px = downscale(Buffer.from(b64, "base64"), s.frameWidth, s.frameHeight, k);
  return { mask: opaqueMask(px, w, h), w, h, ax: Math.round(s.anchor.x * w), ay: Math.round(s.anchor.y * h) };
}

/** Two baked sheets' outline figure over {@link OUTLINE_FACINGS}. */
const between = (a, b, facings) => outlineFigure(OUTLINE_FACINGS.map((f) => [idleMask(a, facings, f), idleMask(b, facings, f)]));

/**
 * Each look's figures (lib/contact.mjs `lookSets`' set: a class's `base` and its `looks`): against
 * the base, and against each sibling look.
 *
 * @returns {{ sheet: string, base: number, siblings: { sheet: string, figure: number }[] }[]}
 */
export function outlineFigures({ base, looks }, facings) {
  return looks.map((l) => ({
    sheet: l.name,
    base: between(l, base, facings),
    siblings: looks.filter((o) => o !== l).map((o) => ({ sheet: o.name, figure: between(l, o, facings) })),
  }));
}
