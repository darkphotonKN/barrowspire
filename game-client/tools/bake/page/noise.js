// Seeded randomness and noise. Nothing in the bake calls Math.random(): every value comes
// from a seed here, which is what makes a re-bake byte-identical (FS-2325V §B.3).

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const lerp = (a, b, t) => a + (b - a) * t;

/** mulberry32: a small, fast, seedable PRNG returning [0, 1). */
export function rng(seed) {
  let s = seed | 0;
  return function next() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function hash3(x, y, z, s) {
  return hash2(x + Math.imul(z | 0, 1619), y ^ Math.imul(z | 0, 31337), s);
}

const fade = (t) => t * t * (3 - 2 * t);

/** Value noise. With `period` > 0 it tiles every `period` lattice cells in x and y. */
export function vnoise(x, y, s, period = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = fade(x - xi);
  const v = fade(y - yi);
  const m = period > 0 ? (a) => ((a % period) + period) % period : (a) => a;
  const a = hash2(m(xi), m(yi), s);
  const b = hash2(m(xi + 1), m(yi), s);
  const c = hash2(m(xi), m(yi + 1), s);
  const d = hash2(m(xi + 1), m(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * Fractal value noise. Octaves double exactly, so with a `period` every octave still tiles and
 * the sum tiles too.
 */
export function fbm(x, y, s, oct = 4, period = 0) {
  let f = 0;
  let amp = 0.5;
  let n = 0;
  let p = period;
  for (let i = 0; i < oct; i++) {
    f += amp * vnoise(x, y, s + i * 17, p);
    n += amp;
    x *= 2;
    y *= 2;
    p *= 2;
    amp *= 0.5;
  }
  return f / n;
}

export function vnoise3(x, y, z, s) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const u = fade(x - xi);
  const v = fade(y - yi);
  const w = fade(z - zi);
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz, s);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

export function fbm3(x, y, z, s, oct = 3) {
  let f = 0;
  let amp = 0.5;
  let n = 0;
  for (let i = 0; i < oct; i++) {
    f += amp * vnoise3(x, y, z, s + i * 13);
    n += amp;
    x *= 2.1;
    y *= 2.1;
    z *= 2.1;
    amp *= 0.5;
  }
  return f / n;
}

/** Cellular noise: nearest (f1) and second-nearest (f2) feature distance, and the cell's id. */
export function voronoi(x, y, s, period = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const m = period > 0 ? (a) => ((a % period) + period) % period : (a) => a;
  let f1 = 9;
  let f2 = 9;
  let id = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i;
      const cy = yi + j;
      const hx = m(cx);
      const hy = m(cy);
      const px = cx + hash2(hx, hy, s);
      const py = cy + hash2(hx, hy, s + 7);
      const d = Math.hypot(px - x, py - y);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = hash2(hx, hy, s + 13);
      } else if (d < f2) f2 = d;
    }
  }
  return { f1, f2, id };
}
