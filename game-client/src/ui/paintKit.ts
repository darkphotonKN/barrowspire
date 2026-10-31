/**
 * The brushes the container view's faces are painted with (FS-2325V §D.6, FS-1D6BX R17): a
 * canvas texture made once per key, rounded polygons, and deterministic noise, so every client
 * paints the same leather, wood and bone. Phaser-free apart from the scene the texture lands in.
 */

import type Phaser from "phaser";

export type Pt = [number, number];

/** Paints one canvas texture under `key`. */
export function paint(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
) {
  const texture = scene.textures.createCanvas(key, w, h);
  if (!texture) return;
  draw(texture.getContext(), w, h);
  texture.refresh();
}

/** A closed polygon with rounded corners. */
export function roundedPoly(pts: Pt[], r: number): Path2D {
  const p = new Path2D();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n];
    const c = pts[i];
    const d = pts[(i + 1) % n];
    if (i === 0) p.moveTo((a[0] + c[0]) / 2, (a[1] + c[1]) / 2);
    p.arcTo(c[0], c[1], (c[0] + d[0]) / 2, (c[1] + d[1]) / 2, r);
  }
  p.closePath();
  return p;
}

/** Hide grain: mottling, pores and the odd crease, multiplied into what is already painted. */
export function grain(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  seed: number,
  amount: number,
) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!d[i + 3]) continue;
      const crease = valueNoise(x / 2, y / 18, seed + 4) > 0.82 ? -0.12 : 0;
      const f =
        1 -
        amount / 2 +
        amount * fbm(x / 9, y / 9, seed) +
        (hash(x, y, seed) - 0.5) * 0.12 +
        crease;
      d[i] *= f;
      d[i + 1] *= f;
      d[i + 2] *= f;
    }
  ctx.putImageData(img, 0, 0);
}

// ── Noise (deterministic, so every client paints the same hide) ─────────────

export function hash(x: number, y: number, s: number): number {
  let h =
    (Math.imul(x | 0, 374761393) +
      Math.imul(y | 0, 668265263) +
      Math.imul(s | 0, 1442695041)) |
    0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function valueNoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const top = hash(xi, yi, s) + (hash(xi + 1, yi, s) - hash(xi, yi, s)) * u;
  const bottom =
    hash(xi, yi + 1, s) + (hash(xi + 1, yi + 1, s) - hash(xi, yi + 1, s)) * u;
  return top + (bottom - top) * v;
}

export function fbm(x: number, y: number, s: number, octaves = 3): number {
  let f = 0;
  let amp = 0.5;
  let n = 0;
  for (let i = 0; i < octaves; i++) {
    f += amp * valueNoise(x, y, s + i * 17);
    n += amp;
    x *= 2.03;
    y *= 2.03;
    amp *= 0.5;
  }
  return f / n;
}
