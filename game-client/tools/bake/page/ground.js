// Ground tiles and transitions (FS-2325V §B.4). Unlike everything else these are not rendered
// through three.js: each tile is shaded per pixel in world space (height field → normal →
// lambert from the same screen-left key light the props use) and written straight onto the
// 64×32 diamond.
//
// Seams. All noise is periodic with a period of one tile, so a tile abuts itself seamlessly.
// Variants differ only in the interior: toward the edges every variant blends back to the
// material's shared base field, so any two variants of one material abut seamlessly too.
// Transitions use the base field on both sides, so they abut any variant of either material.
//
// The diamond is cut hard on 1× pixel centres (never on a boundary for a 2:1 diamond), so
// neighbouring tiles interlock with no gap and no overlap. Colour is averaged from 2×2 samples.

import { clamp, fbm, smoothstep, vnoise, voronoi } from "./noise.js";
import { TILE_H, TILE_W } from "./projection.js";
import { mix, shade } from "./palette.js";

const GRASS_DARK = mix("arcaneDeep", "barrowDeep", 0.4);
const GRASS_LIGHT = mix("arcane", "barrowBrown", 0.35);
const GRASS_DRY = mix("barrowBrown", "brass", 0.3);
const DIRT_DARK = mix("barrowDeep", "charcoal", 0.15);
const DIRT_LIGHT = mix("barrowBrown", "vellumFaint", 0.2);
const PEBBLE = mix("vellumFaint", "slateLight", 0.5);
const COBBLE_A = mix("slate", "slateLight", 0.6);
const COBBLE_B = mix("vellumFaint", "slateLight", 0.4);
const MORTAR = mix("charcoal", "barrowDeep", 0.3);
const FLAG_A = mix("vellumDark", "slateLight", 0.35);
const FLAG_B = mix("slateLight", "slate", 0.3);
const FLAG_JOINT = mix("charcoal", "umber", 0.4);

/** Each material: (u, v, seed) → { c: [r, g, b], h: height 0..~1.5 }, periodic in u and v. */
export const MATERIALS = {
  grass(u, v, s) {
    const g1 = fbm(u * 2, v * 2, s + 1, 3, 2);
    const g2 = fbm(u * 6, v * 6, s + 2, 3, 6);
    const g3 = vnoise(u * 26, v * 26, s + 3, 26);
    const g4 = vnoise(u * 58, v * 58, s + 4, 58);
    let c = mix(GRASS_DARK, GRASS_LIGHT, g1);
    c = mix(c, GRASS_DRY, 0.7 * smoothstep(0.58, 0.74, fbm(u * 2, v * 2, s + 5, 2, 2)));
    c = shade(c, 0.72 + 0.36 * g3 + 0.18 * (g4 - 0.5));
    return { c, h: g2 * 0.5 + g3 * 0.35 + g4 * 0.25 };
  },
  dirt(u, v, s) {
    const dn = fbm(u * 3, v * 3, s + 8, 3, 3);
    let c = mix(DIRT_DARK, DIRT_LIGHT, dn);
    let h = dn * 0.6 + vnoise(u * 22, v * 22, s + 9, 22) * 0.25;
    const pv = voronoi(u * 7, v * 7, s + 10, 7);
    if (pv.id > 0.62 && pv.f1 < 0.22) {
      const t = 1 - pv.f1 / 0.22;
      c = mix(c, shade(PEBBLE, 0.75 + 0.4 * pv.id), smoothstep(0, 0.35, t));
      h += t * 0.7;
    }
    return { c, h };
  },
  cobble(u, v, s) {
    const cell = voronoi(u * 3, v * 3, s + 11, 3);
    const e = cell.f2 - cell.f1;
    const gr = fbm(u * 3, v * 3, s + 12, 3, 3);
    let c = shade(mix(COBBLE_A, COBBLE_B, cell.id > 0.72 ? 1 : 0.15), (0.78 + 0.34 * cell.id) * (0.8 + 0.3 * gr));
    c = mix(c, MORTAR, 1 - smoothstep(0.04, 0.12, e));
    return { c, h: smoothstep(0.02, 0.22, e) * 1.3 + gr * 0.2 };
  },
  flagstone(u, v, s) {
    const vv = v * 2;
    const row = Math.floor(vv);
    const uu = u * 2 + (((row % 2) + 2) % 2) * 0.5;
    const cell = Math.floor(uu);
    const fu = uu - cell;
    const fv = vv - row;
    const hc = fbm(((cell % 2) + 2) % 2, ((row % 2) + 2) % 2, s + 21, 1);
    const gr = fbm(u * 5, v * 5, s + 23, 3, 5);
    const e = Math.min(fu, 1 - fu, fv, 1 - fv) + (vnoise(u * 18, v * 18, s + 22, 18) - 0.5) * 0.05;
    const c = mix(shade(mix(FLAG_A, FLAG_B, hc), 0.8 + 0.28 * gr), FLAG_JOINT, 1 - smoothstep(0.02, 0.075, e));
    return { c, h: smoothstep(0.02, 0.15, e) + gr * 0.25 };
  },
};

const BASE_SEED = 1000;
/** Key light, (world x, world y, up), toward the light: screen-left and high. */
const L = (() => {
  const l = [-0.33, 0.33, 0.94];
  const n = Math.hypot(...l);
  return l.map((x) => x / n);
})();

/** A material sample blending the variant's interior into the shared base at the edges. */
function sampler(material, variant) {
  const fn = MATERIALS[material];
  if (variant === 0) return (u, v) => fn(u, v, BASE_SEED);
  const seed = BASE_SEED + variant * 101;
  return (u, v) => {
    const w = smoothstep(0.04, 0.3, Math.min(u, 1 - u, v, 1 - v));
    const a = fn(u, v, BASE_SEED);
    if (w <= 0) return a;
    const b = fn(u, v, seed);
    return { c: mix(a.c, b.c, w), h: a.h + (b.h - a.h) * w };
  };
}

/** How much of material B shows at (u, v) for a transition toward `edge`. */
function transitionMask(edge) {
  const n = (u, v) => (fbm(u * 4, v * 4, 99, 3, 4) - 0.5) * 0.3;
  const t = {
    n: (u, v) => v,
    s: (u, v) => 1 - v,
    w: (u, v) => u,
    e: (u, v) => 1 - u,
    ne: (u, v) => Math.hypot(v, 1 - u) * 1.1,
    nw: (u, v) => Math.hypot(v, u) * 1.1,
    se: (u, v) => Math.hypot(1 - v, 1 - u) * 1.1,
    sw: (u, v) => Math.hypot(1 - v, u) * 1.1,
  }[edge];
  return (u, v) => 1 - smoothstep(0.3, 0.62, t(u, v) + n(u, v));
}

/** A transition sampler: material A with B intruding from `edge` (world n = -y, e = +x). */
function transitionSampler(a, b, edge) {
  const fa = sampler(a, 0);
  const fb = sampler(b, 0);
  const mask = transitionMask(edge);
  return (u, v) => {
    const w = mask(u, v);
    const x = fa(u, v);
    if (w <= 0) return x;
    const y = fb(u, v);
    return { c: mix(x.c, y.c, w), h: x.h + (y.h - x.h) * w };
  };
}

function shadeAt(sample, u, v) {
  const e = 1 / 160;
  const s = sample(u, v);
  const hx = sample(u + e, v).h - sample(u - e, v).h;
  const hy = sample(u, v + e).h - sample(u, v - e).h;
  const k = 0.012 / e;
  let nx = -hx * k;
  let ny = -hy * k;
  let nz = 1;
  const nl = Math.hypot(nx, ny, nz);
  nx /= nl;
  ny /= nl;
  nz /= nl;
  const lam = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]) / L[2];
  const sh = 0.45 + 0.55 * lam;
  let [r, g, b] = s.c.map((x) => x * sh);
  const lum = 0.3 * r + 0.59 * g + 0.11 * b;
  r += (lum - r) * 0.12;
  g += (lum - g) * 0.12;
  b += (lum - b) * 0.12;
  return [r, g, b];
}

/** Renders a sampler onto the 64×32 diamond as straight-alpha RGBA. */
function renderTile(sample) {
  const out = new Uint8ClampedArray(TILE_W * TILE_H * 4);
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;
  for (let j = 0; j < TILE_H; j++)
    for (let i = 0; i < TILE_W; i++) {
      const cx = i + 0.5;
      const cy = j + 0.5;
      if (Math.abs(cx - hw) / hw + Math.abs(cy - hh) / hh >= 1) continue;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < 2; sy++)
        for (let sx = 0; sx < 2; sx++) {
          const px = i + 0.25 + sx * 0.5 - hw;
          const py = j + 0.25 + sy * 0.5;
          const u = (px / hw + py / hh) / 2;
          const v = (py / hh - px / hw) / 2;
          const c = shadeAt(sample, u, v);
          r += c[0];
          g += c[1];
          b += c[2];
        }
      const o = (j * TILE_W + i) * 4;
      out[o] = clamp(Math.round(r / 4), 0, 255);
      out[o + 1] = clamp(Math.round(g / 4), 0, 255);
      out[o + 2] = clamp(Math.round(b / 4), 0, 255);
      out[o + 3] = 255;
    }
  return out;
}

export const groundTile = (material, variant) => renderTile(sampler(material, variant));
export const transitionTile = (a, b, edge) => renderTile(transitionSampler(a, b, edge));
