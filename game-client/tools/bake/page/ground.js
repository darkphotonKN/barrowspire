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

import { clamp, fbm, hash2, smoothstep, vnoise, voronoi } from "./noise.js";
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

// ── Tower interior grounds (FS-8RBQY §D.2) ──────────────────────────────────────────
//
// Each layout (where the joints run) is fixed, independent of the seed, so a variant's interior
// never shows a second set of joints where it blends back to the base field. The seed varies only
// what lies on a stone or board: tone, wear, cracks, grime, stains.

const TF_A = mix("slate", "barrowBrown", 0.45);
const TF_B = mix("slateLight", "barrowBrown", 0.3);
const TF_GRIME = mix("charcoal", "barrowDeep", 0.55);
const TF_JOINT = mix("pitch", "barrowDeep", 0.4);
const TF_DAMP = mix("slate", "necrotic", 0.18);
const TD_A = mix("slateLight", "vellumFaint", 0.3);
const TD_B = mix("slateLight", "vellumDark", 0.35);
const TD_JOINT = mix("charcoal", "slate", 0.35);
const TP_A = mix("barrowBrown", "barrowDeep", 0.45);
const TP_B = mix("barrowBrown", "brass", 0.22);
const TP_GAP = mix("pitch", "barrowDeep", 0.3);
const TP_NAIL = mix("slate", "charcoal", 0.4);

const frac = (x) => x - Math.floor(x);
const wrap = (n, p) => ((n % p) + p) % p;

/**
 * A row-and-stone layout, periodic in one tile: `rows` row heights (fractions summing to 1) and,
 * per row, stone widths (fractions summing to 1) and a shift. Returns the stone under (u, v):
 * its id and its distance to the nearest joint, in tile units.
 */
function coursed(u, v, rows) {
  let r = 0;
  let v0 = 0;
  const vv = frac(v);
  while (r < rows.length - 1 && vv >= v0 + rows[r].h) v0 += rows[r++].h;
  const row = rows[r];
  const uu = frac(u + row.shift);
  let i = 0;
  let u0 = 0;
  while (i < row.w.length - 1 && uu >= u0 + row.w[i]) u0 += row.w[i++];
  const w = row.w[i];
  const du = Math.min(uu - u0, u0 + w - uu);
  const dv = Math.min(vv - v0, v0 + row.h - vv);
  return { id: hash2(r, i, 4410), r, i, e: Math.min(du, dv), du, dv, fu: (uu - u0) / w, fv: (vv - v0) / row.h };
}

/** Worn cut-stone flags: two courses of uneven stones, rounded worn arrises, grime in the joints. */
const FLAG_ROWS = [
  { h: 0.54, shift: 0.13, w: [0.58, 0.42] },
  { h: 0.46, shift: 0.61, w: [0.36, 0.3, 0.34] },
];
/** Dressed stone: regular ashlar slabs in running bond, crisp narrow joints. */
const DRESSED_ROWS = [
  { h: 0.5, shift: 0, w: [0.5, 0.5] },
  { h: 0.5, shift: 0.25, w: [0.5, 0.5] },
];
/** Old timber planks: five boards along world x, each with one butt joint per tile. */
const PLANK_ROWS = [0, 1, 2, 3, 4].map((b) => {
  const cut = 0.2 + 0.6 * hash2(b, 0, 4420);
  return { h: 0.2, shift: hash2(b, 1, 4421), w: [cut, 1 - cut] };
});

Object.assign(MATERIALS, {
  flags(u, v, s) {
    const st = coursed(u, v, FLAG_ROWS);
    // chipped, uneven arrises: the joint line wanders
    const wob = (vnoise(u * 20, v * 20, 4430, 20) - 0.5) * 0.03 + (vnoise(u * 52, v * 52, 4431, 52) - 0.5) * 0.012;
    const e = st.e + wob;
    const gr = fbm(u * 6, v * 6, s + 31, 3, 6);
    const fine = vnoise(u * 44, v * 44, s + 32, 44);
    const tone = 0.84 + 0.12 * st.id + 0.26 * (hash2(st.r, st.i, s + 33) - 0.5);
    let c = shade(mix(TF_A, TF_B, smoothstep(0.2, 0.9, hash2(st.r, st.i, s + 37) * 0.5 + gr * 0.6)), tone * (0.86 + 0.22 * gr) * (0.94 + 0.1 * fine));
    // wear: the middle of a stone is polished a touch lighter, its edges carry grime
    const worn = smoothstep(0.02, 0.16, e);
    c = mix(c, TF_GRIME, (1 - worn) * 0.55);
    // damp blotches and grime stains, a little in every variant
    c = mix(c, TF_DAMP, 0.35 * smoothstep(0.62, 0.8, fbm(u * 3, v * 3, s + 34, 3, 3)));
    c = mix(c, TF_GRIME, 0.5 * smoothstep(0.6, 0.78, fbm(u * 4, v * 4, s + 35, 3, 4)));
    // a crack across some stones
    const crackField = Math.abs(fbm(u * 5, v * 5, s + 36, 3, 5) - 0.5);
    const crack = st.id > 0.55 ? 1 - smoothstep(0.004, 0.014, crackField) : 0;
    c = mix(c, TF_JOINT, crack * 0.8);
    const joint = 1 - smoothstep(0.006, 0.022, e);
    c = mix(c, TF_JOINT, joint);
    const sunk = (hash2(st.r, st.i, 4432) - 0.5) * 0.25;
    return { c, h: smoothstep(0.004, 0.05, e) * (1 + sunk) + gr * 0.22 + fine * 0.06 - crack * 0.3 };
  },
  dressed(u, v, s) {
    const st = coursed(u, v, DRESSED_ROWS);
    const e = st.e + (vnoise(u * 40, v * 40, 4440, 40) - 0.5) * 0.004;
    const gr = fbm(u * 5, v * 5, s + 41, 3, 5);
    const tone = 0.8 + 0.08 * st.id + 0.16 * (hash2(st.r, st.i, s + 42) - 0.5);
    // tooled face: a faint diagonal chisel texture, and a drafted margin round each slab
    const tool = 0.97 + 0.03 * Math.sin(2 * Math.PI * 48 * (u + v) + vnoise(u * 16, v * 16, 4441, 16) * 3);
    const draft = 1 - 0.06 * (1 - smoothstep(0.02, 0.035, e));
    let c = shade(mix(TD_A, TD_B, smoothstep(0.3, 0.8, gr)), tone * tool * draft * (0.9 + 0.16 * gr));
    c = mix(c, TF_GRIME, 0.3 * smoothstep(0.66, 0.84, fbm(u * 3, v * 3, s + 43, 3, 3)));
    c = mix(c, TD_JOINT, 1 - smoothstep(0.003, 0.009, e));
    return { c, h: smoothstep(0.002, 0.014, e) * 0.9 + gr * 0.12 + (tool - 0.97) * 2 };
  },
  planks(u, v, s) {
    const b = coursed(u, v, PLANK_ROWS);
    const board = b.r;
    // grain runs along world x (u): stretched noise, a period that tiles in both axes
    const grain = fbm(u * 4, v * 40, 4450 + board, 3, 4);
    const streak = vnoise(u * 2, v * 120, s + 51, 2);
    const tone = 0.78 + 0.34 * hash2(board, b.i, 4451) + 0.1 * (hash2(board, b.i, s + 52) - 0.5);
    let c = shade(mix(TP_A, TP_B, smoothstep(0.25, 0.8, grain)), tone * (0.82 + 0.26 * streak));
    // a knot on some boards
    const kn = voronoi(u * 6, v * 6, 4452, 6);
    if (kn.id > 0.8 && kn.f1 < 0.12) c = mix(c, TP_GAP, 0.55 * (1 - kn.f1 / 0.12));
    // worn traffic sheen and dark spills
    c = mix(c, TF_GRIME, 0.45 * smoothstep(0.62, 0.8, fbm(u * 3, v * 3, s + 53, 3, 3)));
    // the gap between boards (long joints) is deeper than a butt joint
    const gap = 1 - smoothstep(0.006, 0.016, b.dv);
    const butt = 1 - smoothstep(0.003, 0.009, b.du);
    c = mix(c, TP_GAP, Math.max(gap, butt * 0.9));
    // a pair of nail heads by each butt joint
    for (const dvv of [0.28, 0.72]) {
      const d = Math.hypot(b.du - 0.022, (b.fv - dvv) * 0.2);
      if (d < 0.0065) c = mix(c, TP_NAIL, 0.85 * (1 - d / 0.0065));
    }
    const cup = smoothstep(0, 0.05, b.dv) * 0.6;
    return { c, h: cup + grain * 0.2 + streak * 0.05 - gap * 0.4 };
  },
});

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
