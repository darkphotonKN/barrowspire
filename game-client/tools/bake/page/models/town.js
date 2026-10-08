// The hub's town props and dressing (FS-KYPQ9 §A.1): market stalls, carts, the well, crates,
// fences, troughs, the woodpile, sacks, signposts, the washing line, flower boxes and chimneys.
// Authored in code (ADR-0021), on the same materials, key light and scale as the furniture in
// props.js: modelled a little over life size, so a delver (about 1.6 tiles) reads against them as
// against a barrel or a lamp post.
//
// One three.js unit is one tile edge (40 world px); +x is world +x, +z is world +y. Each model's
// origin is the centre of its footprint, the point the scene places it on. A prop's footprint
// radius in world px (the scene's `r`, hubKeepOut.ts) bounds its silhouette: r 40 is 1 tile each
// side of the origin, r 10 is a quarter tile.

import * as THREE from "three";
import { fbm, rng, smoothstep, vnoise, vnoise3 } from "../noise.js";
import { mix, shade } from "../palette.js";
import { materials, pixelTexture, plain, textured, TONE } from "../materials.js";
import { part, rod, V3 } from "./util.js";

/** The awnings a market stall cycles through, by index (HubScene: "a little colour is honest"). */
export const AWNINGS = ["oxblood", "arcaneDeep", "barrowBrown"];
/** The two sacks variants, by index. */
export const SACKS = ["grain", "goods"];

const STRAW = mix("vellumDark", "brass", 0.35);
const BURLAP = mix("vellumFaint", "barrowBrown", 0.35);

/** Woven cloth in one colour: weave, slub and grime (materials.js TEX.cloth's recipe). */
const clothTex = (c, s) =>
  pixelTexture(128, 128, (x, y) =>
    shade(c, (0.72 + 0.5 * fbm(x / 14, y / 14, s)) * ((x + y) % 4 < 2 ? 1 : 0.9) * (0.92 + 0.12 * vnoise(x / 2, y / 40, s + 3))),
  );

let TOWN = null;

/** The town's own materials, built once per bake (seeded, so deterministic). */
function townMaterials() {
  if (TOWN) return TOWN;
  const D = THREE.DoubleSide;
  TOWN = {
    awning: AWNINGS.map((tone, i) => textured(clothTex(mix(tone, "barrowDeep", 0.3), 31 + i), { side: D, bump: 0.3 })),
    trim: textured(clothTex(mix("vellumFaint", "barrowBrown", 0.2), 37), { side: D, bump: 0.3 }),
    burlap: textured(
      pixelTexture(128, 128, (x, y) =>
        shade(BURLAP, (0.68 + 0.45 * fbm(x / 16, y / 16, 41)) * (x % 3 === 0 || y % 3 === 0 ? 0.82 : 1)),
      ),
      { bump: 0.8 },
    ),
    straw: textured(
      pixelTexture(128, 128, (x, y) =>
        shade(STRAW, (0.55 + 0.6 * vnoise(x / 1.6, y / 24, 43)) * (0.8 + 0.3 * fbm(x / 10, y / 10, 44))),
      ),
      { bump: 1, rough: 1 },
    ),
    endGrain: textured(
      pixelTexture(64, 64, (x, y) => {
        const r = Math.hypot(x - 32, y - 32);
        const ring = 0.75 + 0.2 * Math.sin(r * 1.3 + fbm(x / 9, y / 9, 45) * 4);
        const bark = smoothstep(27, 30, r);
        return mix(shade(mix("vellumFaint", "barrowBrown", 0.45), ring), TONE.bark, bark);
      }),
      { bump: 0.4 },
    ),
    // still, dark water: low roughness so the environment gives it a sheen
    water: plain(mix("slate", "necrotic", 0.25), { rough: 0.12, metal: 0.4 }),
    soil: textured(pixelTexture(64, 64, (x, y) => shade(mix("barrowDeep", "charcoal", 0.4), 0.7 + 0.5 * fbm(x / 6, y / 6, 47))), { rough: 1 }),
    grain: plain(mix("vellumDark", "brassBright", 0.2), { rough: 0.95 }),
    leaf: plain(mix("arcaneDeep", "arcane", 0.3), { rough: 0.85, flat: true }),
    leafDark: plain(mix("arcaneDeep", "charcoal", 0.25), { rough: 0.9, flat: true }),
    // blossoms stay muted: no amber (amber means interactable on the canvas)
    bloomRed: plain(mix("oxblood", "oxbloodText", 0.45), { rough: 0.8 }),
    bloomPale: plain(mix("vellum", "vellumDark", 0.2), { rough: 0.8 }),
    bloomBlue: plain(mix("necrotic", "slateLight", 0.3), { rough: 0.8 }),
    apple: plain(mix("oxblood", "ember", 0.2), { rough: 0.45 }),
    cabbage: plain(mix("arcane", "vellumDark", 0.35), { rough: 0.7 }),
    bread: plain(mix("barrowBrown", "brass", 0.5), { rough: 0.9 }),
    rope: plain(mix("vellumFaint", "barrowBrown", 0.3), { rough: 1 }),
    linen: textured(clothTex(mix("vellum", "vellumFaint", 0.35), 49), { side: D, bump: 0.3 }),
    wool: textured(clothTex(mix("slateLight", "necrotic", 0.25), 50), { side: D, bump: 0.3 }),
    shirt: textured(clothTex(mix("oxblood", "barrowBrown", 0.35), 51), { side: D, bump: 0.3 }),
    pot: plain(mix("ember", "barrowBrown", 0.55), { rough: 0.8 }),
  };
  return TOWN;
}

/** A plank box. Planks get a hair of random tilt so a stack does not look machined. */
const plank = (w, h, d, material, o = {}) => part(new THREE.BoxGeometry(w, h, d), material, o);

/** A spoked wheel standing in the x-y plane at `x`, its axle along z at `z`. */
function wheel(g, x, z, r, M, seed) {
  const R = rng(seed);
  const w = new THREE.Group();
  w.position.set(x, r, z);
  w.add(part(new THREE.TorusGeometry(r - 0.035, 0.04, 6, 24), M.woodDark));
  w.add(part(new THREE.TorusGeometry(r - 0.005, 0.016, 5, 24), M.iron));
  w.add(part(new THREE.CylinderGeometry(0.07, 0.07, 0.14, 10), M.woodDark, { rx: Math.PI / 2 }));
  w.add(part(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 8), M.iron, { rx: Math.PI / 2 }));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + R() * 0.05;
    w.add(rod(V3(0, 0, 0), V3(Math.cos(a) * (r - 0.05), Math.sin(a) * (r - 0.05), 0), 0.02, 0.016, M.wood, 6));
  }
  w.rotation.z = R() * 0.4;
  g.add(w);
}

/** A two-wheeled hand cart: plank bed with side boards, spoked wheels, a pair of shafts. */
function cartBody(M) {
  const g = new THREE.Group();
  const bx = -0.2;
  const bedY = 0.62;
  g.add(plank(1.2, 0.07, 0.72, M.wood, { x: bx, y: bedY }));
  for (const sz of [-1, 1]) {
    g.add(plank(1.2, 0.22, 0.05, M.wood, { x: bx, y: bedY + 0.14, z: sz * 0.36, rx: sz * -0.06 }));
    g.add(plank(1.24, 0.05, 0.06, M.woodDark, { x: bx, y: bedY + 0.27, z: sz * 0.37 }));
  }
  g.add(plank(0.05, 0.22, 0.72, M.wood, { x: bx - 0.6, y: bedY + 0.14 }));
  g.add(plank(0.05, 0.22, 0.72, M.wood, { x: bx + 0.6, y: bedY + 0.14 }));
  for (const px of [-0.55, 0.15]) g.add(plank(0.06, 0.32, 0.06, M.woodDark, { x: bx + px + 0.2, y: bedY - 0.12, z: 0.33 }));
  // iron corner straps
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(plank(0.04, 0.24, 0.04, M.iron, { x: bx + sx * 0.61, y: bedY + 0.14, z: sz * 0.37 }));
  g.add(plank(0.1, 0.08, 0.95, M.woodDark, { x: -0.1, y: 0.4 })); // the axle beam
  wheel(g, -0.1, 0.48, 0.4, M, 61);
  wheel(g, -0.1, -0.48, 0.4, M, 62);
  // shafts rest on the ground ahead, the cart tipped forward on them
  for (const sz of [-1, 1]) g.add(rod(V3(bx + 0.5, bedY - 0.02, sz * 0.3), V3(0.98, 0.05, sz * 0.24), 0.035, 0.03, M.woodDark));
  g.add(rod(V3(0.92, 0.07, -0.25), V3(0.92, 0.07, 0.25), 0.025, 0.025, M.woodDark));
  return { g, bx, bedY };
}

export function cart() {
  const M = materials();
  const { g, bx, bedY } = cartBody(M);
  // a little left in it: a sack and an empty crate
  const T = townMaterials();
  g.add(part(sackGeometry(0.2, 0.42, 71), T.burlap, { x: bx - 0.3, y: bedY + 0.04, z: -0.1, rz: 1.35, ry: 0.4 }));
  g.add(crateModel(0.34, M, { x: bx + 0.25, y: bedY + 0.04, z: 0.08, ry: 0.3 }));
  return g;
}

/** A noise-shagged mound of loose hay. */
function hayMound(seed) {
  const geo = new THREE.SphereGeometry(1, 28, 18);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = vnoise3(v.x * 2.5 + 3, v.y * 2.5, v.z * 2.5, seed);
    const fine = vnoise3(v.x * 9, v.y * 9, v.z * 9, seed + 1);
    v.multiplyScalar(1 + (n - 0.5) * 0.3 + (fine - 0.5) * 0.12);
    if (v.y < 0) v.y *= 0.25;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

export function hayCart() {
  const M = materials();
  const T = townMaterials();
  const { g, bx, bedY } = cartBody(M);
  g.add(part(hayMound(73), T.straw, { x: bx, y: bedY + 0.12, sx: 0.66, sy: 0.42, sz: 0.44 }));
  const R = rng(74);
  // wisps over the side boards
  for (let i = 0; i < 26; i++) {
    const x = bx + (R() - 0.5) * 1.1;
    const z = (R() > 0.5 ? 1 : -1) * (0.3 + R() * 0.1);
    g.add(part(new THREE.CylinderGeometry(0.006, 0.006, 0.26, 3), T.straw, { x, y: bedY + 0.3, z, rx: (R() - 0.5) * 1.6, rz: (R() - 0.5) * 1.6 }));
  }
  g.add(part(hayMound(75), T.straw, { x: 0.45, y: 0, z: 0.42, sx: 0.2, sy: 0.08, sz: 0.16 }));
  // a hay fork leaning on the wheel
  g.add(rod(V3(-0.75, 0, 0.62), V3(-0.25, 1.0, 0.5), 0.02, 0.018, M.wood));
  return g;
}

/** A gabled roof along x: two slopes of shingle planks and a ridge beam. */
function gable(g, len, half, rise, y, M) {
  const slope = Math.hypot(half, rise) + 0.06;
  const pitch = Math.atan2(rise, half);
  for (const sz of [-1, 1])
    g.add(plank(len, 0.05, slope, M.woodDark, { y: y + rise / 2, z: (sz * half) / 2, rx: sz * pitch }));
  g.add(plank(len + 0.04, 0.07, 0.08, M.beam, { y: y + rise + 0.02 }));
}

export function well() {
  const M = materials();
  const T = townMaterials();
  const g = new THREE.Group();
  const ring = [
    [0.36, 0],
    [0.5, 0],
    [0.52, 0.08],
    [0.5, 0.56],
    [0.54, 0.6],
    [0.54, 0.66],
    [0.36, 0.66],
    [0.36, 0.1],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  g.add(part(new THREE.LatheGeometry(ring, 28), M.stone));
  // the coping: a ring of capstones
  const R = rng(81);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    g.add(plank(0.3, 0.07, 0.2, M.cap, { x: Math.cos(a) * 0.45, y: 0.69, z: Math.sin(a) * 0.45, ry: -a + Math.PI / 2 + (R() - 0.5) * 0.08 }));
  }
  g.add(part(new THREE.CircleGeometry(0.36, 24), T.water, { y: 0.32, rx: -Math.PI / 2 }));
  // uprights, windlass, rope and bucket
  for (const sx of [-1, 1]) g.add(plank(0.1, 1.85, 0.1, M.beam, { x: sx * 0.55, y: 0.93 }));
  g.add(part(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 10), M.woodDark, { y: 1.42, rz: Math.PI / 2 }));
  g.add(part(new THREE.CylinderGeometry(0.075, 0.075, 0.4, 10), T.rope, { y: 1.42, rz: Math.PI / 2 }));
  g.add(rod(V3(0.6, 1.42, 0), V3(0.72, 1.3, 0.12), 0.015, 0.015, M.iron));
  g.add(rod(V3(0.72, 1.3, 0.12), V3(0.72, 1.18, 0.0), 0.02, 0.02, M.woodDark));
  g.add(rod(V3(0.05, 1.36, 0), V3(0.05, 0.98, 0), 0.008, 0.008, T.rope, 4));
  const bucket = [
    [0.08, 0],
    [0.11, 0.18],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  g.add(part(new THREE.LatheGeometry(bucket, 14), M.staves, { x: 0.05, y: 0.8 }));
  g.add(part(new THREE.TorusGeometry(0.105, 0.008, 4, 16), M.iron, { x: 0.05, y: 0.94, rx: Math.PI / 2 }));
  gable(g, 1.35, 0.42, 0.34, 1.86, M);
  return g;
}

/** A plank crate of side `s` with darker battens on its edges and a brace across each face. */
function crateModel(s, M, o = {}) {
  const g = new THREE.Group();
  g.add(plank(s, s, s, M.wood, { y: s / 2 }));
  const b = s * 0.09;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.add(plank(b, s + 0.01, b, M.woodDark, { x: (sx * (s - b)) / 2, y: s / 2, z: (sz * (s - b)) / 2 }));
  for (const y of [b / 2, s - b / 2]) {
    for (const sz of [-1, 1]) g.add(plank(s + 0.01, b, b, M.woodDark, { y, z: (sz * (s - b)) / 2 }));
    for (const sx of [-1, 1]) g.add(plank(b, b, s + 0.01, M.woodDark, { x: (sx * (s - b)) / 2, y }));
  }
  const diag = Math.SQRT2 * (s - 2 * b);
  g.add(plank(diag, b * 0.8, 0.012, M.woodDark, { y: s / 2, z: s / 2 + 0.004, rz: Math.PI / 4 }));
  g.add(plank(0.012, b * 0.8, diag, M.woodDark, { x: s / 2 + 0.004, y: s / 2, rx: Math.PI / 4 }));
  g.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  g.rotation.y = o.ry ?? 0;
  return g;
}

export function crate() {
  const g = new THREE.Group();
  g.add(crateModel(0.6, materials(), { ry: 0.12 }));
  return g;
}

/** Three crates: two on the ground, one across them. */
export function crateStack() {
  const M = materials();
  const g = new THREE.Group();
  g.add(crateModel(0.5, M, { x: -0.22, z: 0.06, ry: 0.08 }));
  g.add(crateModel(0.5, M, { x: 0.3, z: -0.1, ry: -0.1 }));
  g.add(crateModel(0.46, M, { x: 0.04, y: 0.5, z: -0.02, ry: 0.35 }));
  return g;
}

/** One tile of post-and-rail fence along `axis`, its post at the tile's centre. */
export function fenceSegment(axis) {
  const M = materials();
  const g = new THREE.Group();
  const R = rng(axis === "x" ? 91 : 92);
  g.add(plank(0.1, 0.92, 0.1, M.woodDark, { y: 0.46, rz: (R() - 0.5) * 0.05 }));
  for (const y of [0.36, 0.72]) g.add(plank(1.03, 0.07, 0.05, M.wood, { y: y + (R() - 0.5) * 0.03, z: 0.06, rz: (R() - 0.5) * 0.03 }));
  if (axis === "y") g.rotation.y = Math.PI / 2;
  return g;
}

/** A fence's end post: a little stouter, with a weathered sloped top. */
export function fencePost() {
  const M = materials();
  const g = new THREE.Group();
  g.add(plank(0.13, 1.0, 0.13, M.woodDark, { y: 0.5 }));
  g.add(plank(0.15, 0.05, 0.15, M.beam, { y: 1.02, rx: 0.2 }));
  return g;
}

export function waterTrough() {
  const M = materials();
  const T = townMaterials();
  const g = new THREE.Group();
  const L = 1.0;
  const W = 0.44;
  const H = 0.36;
  const y0 = 0.1;
  g.add(plank(L, 0.05, W, M.woodDark, { y: y0 + 0.025 }));
  for (const sz of [-1, 1]) g.add(plank(L, H, 0.05, M.wood, { y: y0 + H / 2, z: (sz * (W - 0.05)) / 2, rx: sz * 0.08 }));
  for (const sx of [-1, 1]) g.add(plank(0.05, H, W, M.wood, { x: (sx * (L - 0.05)) / 2, y: y0 + H / 2 }));
  for (const sx of [-1, 1]) {
    g.add(plank(0.07, y0, W + 0.1, M.beam, { x: sx * 0.34, y: y0 / 2 }));
    g.add(plank(0.035, H + 0.02, W + 0.04, M.iron, { x: sx * 0.3, y: y0 + H / 2, sz: 1 }));
  }
  g.add(plank(L - 0.1, 0.01, W - 0.1, T.water, { y: y0 + H - 0.06 }));
  return g;
}

/** A split log lying along z, bark round the outside and end grain on its cut faces. */
function log(r, len, M, T, o) {
  return part(new THREE.CylinderGeometry(r, r * 1.04, len, 9), [M.bark, T.endGrain, T.endGrain], { ...o, rx: Math.PI / 2 });
}

export function woodpile() {
  const M = materials();
  const T = townMaterials();
  const g = new THREE.Group();
  const R = rng(101);
  const r = 0.085;
  const rows = [6, 5, 4, 3];
  rows.forEach((n, row) => {
    for (let i = 0; i < n; i++) {
      const x = -0.36 + (i - (n - 1) / 2) * r * 2.05;
      g.add(log(r * (0.9 + R() * 0.2), 0.62 + R() * 0.08, M, T, { x, y: r + row * r * 1.75, z: (R() - 0.5) * 0.06, ry: (R() - 0.5) * 0.1 }));
    }
  });
  // the chopping block with its axe, and split pieces at its foot
  g.add(part(new THREE.CylinderGeometry(0.2, 0.22, 0.34, 12), [M.bark, T.endGrain, T.endGrain], { x: 0.4, y: 0.17, z: 0.18 }));
  g.add(rod(V3(0.42, 0.34, 0.18), V3(0.56, 0.72, 0.3), 0.022, 0.02, M.wood));
  g.add(plank(0.16, 0.1, 0.02, M.steel, { x: 0.43, y: 0.36, z: 0.19, rz: 0.4, ry: -0.7 }));
  for (let i = 0; i < 3; i++)
    g.add(plank(0.07, 0.07, 0.3, M.wood, { x: 0.2 + R() * 0.4, y: 0.035, z: 0.45 + R() * 0.1, ry: R() * 3 }));
  return g;
}

/** A filled sack, its neck tied, as a lathe of radius `r` and height `h`. */
function sackGeometry(r, h, seed) {
  const prof = [
    [0.02, 0],
    [0.8, 0.02],
    [1.0, 0.18],
    [1.04, 0.45],
    [0.92, 0.72],
    [0.5, 0.88],
    [0.28, 0.92],
    [0.34, 1.0],
    [0.02, 1.04],
  ].map(([x, y]) => new THREE.Vector2(x * r, y * h));
  const geo = new THREE.LatheGeometry(prof, 16);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = vnoise3(v.x * 9, v.y * 9, v.z * 9, seed);
    // slumped: wider at the base front, lumpy
    pos.setXYZ(i, v.x * (1 + (n - 0.5) * 0.18), v.y, v.z * (0.82 + (n - 0.5) * 0.18));
  }
  geo.computeVertexNormals();
  return geo;
}

export function sacks(variant) {
  const M = materials();
  const T = townMaterials();
  const g = new THREE.Group();
  if (variant === "grain") {
    g.add(part(sackGeometry(0.2, 0.55, 111), T.burlap, { x: -0.12, z: -0.08, ry: 0.3 }));
    g.add(part(sackGeometry(0.19, 0.5, 112), T.burlap, { x: 0.16, z: 0.02, ry: -0.5 }));
    // an open one, rolled down, showing its grain
    g.add(part(new THREE.CylinderGeometry(0.17, 0.19, 0.28, 14, 1, true), T.burlap, { x: 0.0, y: 0.14, z: 0.22 }));
    g.add(part(new THREE.TorusGeometry(0.17, 0.035, 6, 16), T.burlap, { x: 0.0, y: 0.28, z: 0.22, rx: Math.PI / 2 }));
    g.add(part(new THREE.SphereGeometry(0.165, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), T.grain, { x: 0.0, y: 0.22, z: 0.22, sy: 0.45 }));
    g.add(part(new THREE.CylinderGeometry(0.015, 0.015, 0.06, 6), M.wood, { x: 0.06, y: 0.3, z: 0.24, rz: 0.6 }));
    return g;
  }
  // market goods: two sacks, a basket of apples and a cabbage crate
  g.add(part(sackGeometry(0.18, 0.5, 113), T.burlap, { x: -0.18, z: -0.12, ry: 0.6 }));
  g.add(part(sackGeometry(0.16, 0.42, 114), T.burlap, { x: 0.1, z: -0.2, ry: -0.2, rz: 0.12 }));
  const basket = [
    [0.12, 0],
    [0.18, 0.04],
    [0.2, 0.16],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  g.add(part(new THREE.LatheGeometry(basket, 16), M.staves, { x: 0.1, z: 0.16 }));
  g.add(part(new THREE.TorusGeometry(0.2, 0.014, 5, 18), M.woodDark, { x: 0.1, y: 0.16, z: 0.16, rx: Math.PI / 2 }));
  const R = rng(115);
  for (let i = 0; i < 9; i++) {
    const a = R() * Math.PI * 2;
    const d = Math.sqrt(R()) * 0.13;
    g.add(part(new THREE.SphereGeometry(0.045, 8, 6), T.apple, { x: 0.1 + Math.cos(a) * d, y: 0.16 + R() * 0.04, z: 0.16 + Math.sin(a) * d }));
  }
  g.add(crateModel(0.26, M, { x: -0.18, z: 0.2, ry: 0.4 }));
  for (let i = 0; i < 2; i++)
    g.add(part(new THREE.IcosahedronGeometry(0.075, 1), T.cabbage, { x: -0.22 + i * 0.09, y: 0.29, z: 0.19 + i * 0.03 }));
  g.add(part(new THREE.CapsuleGeometry(0.05, 0.12, 4, 8), T.bread, { x: 0.22, y: 0.05, z: -0.02, rz: Math.PI / 2, ry: 0.5 }));
  return g;
}

/** A plank arm pointing along `ry`, its tip cut to a point. */
function signArm(g, y, ry, len, M) {
  const arm = new THREE.Group();
  arm.position.set(0, y, 0);
  arm.rotation.y = ry;
  arm.add(plank(len, 0.13, 0.035, M.wood, { x: len / 2 + 0.03 }));
  arm.add(plank(0.1, 0.1, 0.034, M.wood, { x: len + 0.03, rz: Math.PI / 4 }));
  arm.add(plank(0.02, 0.02, 0.04, M.iron, { x: 0.1 }));
  g.add(arm);
}

export function signpost() {
  const M = materials();
  const g = new THREE.Group();
  g.add(plank(0.11, 2.1, 0.11, M.beam, { y: 1.05 }));
  g.add(part(new THREE.ConeGeometry(0.1, 0.1, 4), M.woodDark, { y: 2.15, ry: Math.PI / 4 }));
  signArm(g, 1.82, 0.25, 0.5, M);
  signArm(g, 1.58, Math.PI + 0.5, 0.42, M);
  signArm(g, 1.36, -1.1, 0.38, M);
  // a stone at its foot to wedge it
  g.add(part(new THREE.DodecahedronGeometry(0.1, 0), M.stone, { x: 0.08, y: 0.04, z: 0.06, sy: 0.6 }));
  return g;
}

/** Height the washing line hangs from, on its posts. */
const LINE_Y = 1.8;
/** The washing line's posts stand this far either side of its midpoint: 80 world px apart. */
const LINE_HALF = 1.0;

export function washingPost() {
  const M = materials();
  const T = townMaterials();
  const g = new THREE.Group();
  g.add(plank(0.09, 1.95, 0.09, M.beam, { y: 0.975 }));
  g.add(plank(0.06, 0.06, 0.34, M.woodDark, { y: LINE_Y + 0.05 }));
  g.add(rod(V3(0, 0.45, 0), V3(0.18, 0, 0.12), 0.025, 0.025, M.woodDark));
  g.add(part(new THREE.TorusGeometry(0.05, 0.012, 4, 10), T.rope, { y: LINE_Y + 0.02 }));
  return g;
}

/** The line itself, sagging between the posts, with linen, a shirt and a blanket pegged on. */
export function washingLine() {
  const T = townMaterials();
  const g = new THREE.Group();
  const sag = (x) => LINE_Y - 0.16 * (1 - (x / LINE_HALF) ** 2);
  const N = 12;
  for (let i = 0; i < N; i++) {
    const x0 = -LINE_HALF + (2 * LINE_HALF * i) / N;
    const x1 = -LINE_HALF + (2 * LINE_HALF * (i + 1)) / N;
    g.add(rod(V3(x0, sag(x0), 0), V3(x1, sag(x1), 0), 0.008, 0.008, T.rope, 4));
  }
  const R = rng(121);
  const cloth = (x, w, h, material) => {
    const top = sag(x);
    g.add(plank(w, h, 0.012, material, { x, y: top - h / 2, z: (R() - 0.5) * 0.02, ry: (R() - 0.5) * 0.2, rz: (R() - 0.5) * 0.04 }));
    for (const dx of [-w / 2 + 0.04, w / 2 - 0.04]) g.add(plank(0.02, 0.05, 0.03, T.rope, { x: x + dx, y: sag(x + dx) }));
  };
  cloth(-0.55, 0.42, 0.62, T.linen);
  cloth(-0.02, 0.36, 0.48, T.shirt);
  cloth(0.5, 0.48, 0.7, T.wool);
  return g;
}

/** A planter box against a wall, along `axis`, spilling leaves and muted blossoms. */
export function flowerBox(axis) {
  const M = materials();
  const T = townMaterials();
  const g = new THREE.Group();
  const L = 0.55;
  const W = 0.24;
  const H = 0.22;
  for (const sz of [-1, 1]) g.add(plank(L, H, 0.035, M.wood, { y: H / 2, z: (sz * (W - 0.035)) / 2 }));
  for (const sx of [-1, 1]) g.add(plank(0.035, H, W, M.wood, { x: (sx * (L - 0.035)) / 2, y: H / 2 }));
  g.add(plank(L + 0.02, 0.03, W + 0.02, M.woodDark, { y: H + 0.005 }));
  g.add(plank(L - 0.06, 0.02, W - 0.06, T.soil, { y: H - 0.02 }));
  const R = rng(axis === "x" ? 131 : 132);
  const blooms = [T.bloomRed, T.bloomPale, T.bloomBlue];
  for (let i = 0; i < 14; i++) {
    const x = (R() - 0.5) * (L - 0.1);
    const z = (R() - 0.5) * (W - 0.1);
    g.add(part(new THREE.IcosahedronGeometry(0.05 + R() * 0.03, 0), R() > 0.4 ? T.leaf : T.leafDark, { x, y: H + 0.03 + R() * 0.05, z, sy: 0.8 }));
  }
  for (let i = 0; i < 10; i++) {
    const x = (R() - 0.5) * (L - 0.12);
    const z = (R() - 0.5) * (W - 0.12);
    g.add(part(new THREE.SphereGeometry(0.024, 6, 4), blooms[i % blooms.length], { x, y: H + 0.1 + R() * 0.06, z }));
  }
  // a few trailing over the front edge
  for (let i = 0; i < 4; i++)
    g.add(part(new THREE.IcosahedronGeometry(0.035, 0), T.leaf, { x: (R() - 0.5) * (L - 0.1), y: H - 0.04, z: W / 2 + 0.02 }));
  if (axis === "y") g.rotation.y = Math.PI / 2;
  return g;
}

/** A stone chimney stack with a corbelled cap and a clay pot, standing on a roof. */
export function chimney() {
  const M = materials();
  const T = townMaterials();
  const g = new THREE.Group();
  g.add(plank(0.5, 1.2, 0.5, M.stone, { y: 0.6 }));
  g.add(plank(0.6, 0.08, 0.6, M.cap, { y: 1.24 }));
  g.add(plank(0.52, 0.1, 0.52, M.stone, { y: 1.33 }));
  g.add(plank(0.58, 0.06, 0.58, M.cap, { y: 1.41 }));
  const pot = [
    [0.1, 0],
    [0.12, 0.08],
    [0.09, 0.22],
    [0.11, 0.26],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  g.add(part(new THREE.LatheGeometry(pot, 12), T.pot, { y: 1.44 }));
  g.add(part(new THREE.CircleGeometry(0.085, 12), materials().black, { y: 1.69, rx: -Math.PI / 2 }));
  return g;
}

/** A timber market stall facing +z (world south): counter, awning, goods. */
export function marketStall(awning) {
  const M = materials();
  const T = townMaterials();
  const g = new THREE.Group();
  const W = 1.7;
  const D = 0.8;
  const counterY = 0.95;
  // the counter: a plank top over a boarded front
  g.add(plank(W, 0.07, D, M.wood, { y: counterY }));
  g.add(plank(W, counterY - 0.1, 0.04, M.wood, { y: (counterY - 0.1) / 2 + 0.05, z: D / 2 - 0.02 }));
  for (const sx of [-1, 1]) g.add(plank(0.04, counterY - 0.1, D, M.woodDark, { x: (sx * (W - 0.04)) / 2, y: (counterY - 0.1) / 2 + 0.05 }));
  g.add(plank(W + 0.04, 0.06, 0.06, M.woodDark, { y: counterY - 0.06, z: D / 2 + 0.01 }));
  // posts: taller at the back, so the awning sheds rain forward
  const back = 2.25;
  const front = 1.85;
  for (const sx of [-1, 1]) {
    g.add(plank(0.09, back, 0.09, M.beam, { x: (sx * W) / 2, y: back / 2, z: -D / 2 }));
    g.add(plank(0.09, front, 0.09, M.beam, { x: (sx * W) / 2, y: front / 2, z: D / 2 }));
  }
  const over = 0.3;
  const run = D + over;
  const drop = back - front + (over * (back - front)) / D;
  const len = Math.hypot(run, drop);
  const tilt = Math.atan2(drop, run);
  const cloth = T.awning[awning];
  g.add(plank(W + 0.16, 0.025, len, cloth, { y: back - drop / 2 + 0.03, z: -D / 2 + run / 2, rx: tilt }));
  // the valance: a scalloped hem along the front
  const hemZ = -D / 2 + run;
  const hemY = back - drop + 0.02;
  for (let i = 0; i < 7; i++) {
    const x = -W / 2 - 0.05 + (i + 0.5) * ((W + 0.1) / 7);
    g.add(plank((W + 0.1) / 7 - 0.015, 0.16, 0.012, cloth, { x, y: hemY - 0.08, z: hemZ }));
    g.add(part(new THREE.CircleGeometry(0.11, 10, Math.PI, Math.PI), cloth, { x, y: hemY - 0.16, z: hemZ }));
  }
  g.add(plank(W + 0.12, 0.03, 0.02, T.trim, { y: hemY, z: hemZ + 0.01 }));
  // goods on the counter: a basket of apples, cloth bolts, a jar or two, a cabbage
  const R = rng(141 + awning);
  const basket = [
    [0.12, 0],
    [0.17, 0.03],
    [0.19, 0.13],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  g.add(part(new THREE.LatheGeometry(basket, 14), M.staves, { x: -0.5, y: counterY + 0.035, z: 0.05 }));
  for (let i = 0; i < 8; i++) {
    const a = R() * Math.PI * 2;
    const d = Math.sqrt(R()) * 0.12;
    g.add(part(new THREE.SphereGeometry(0.042, 8, 6), T.apple, { x: -0.5 + Math.cos(a) * d, y: counterY + 0.15 + R() * 0.03, z: 0.05 + Math.sin(a) * d }));
  }
  for (let i = 0; i < 3; i++)
    g.add(part(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 12), [T.linen, T.wool, T.shirt][i], { x: 0.15 + i * 0.03, y: counterY + 0.11 + i * 0.12, z: -0.08 + (i % 2) * 0.12, rz: Math.PI / 2, ry: 0.2 }));
  for (const [x, z] of [
    [0.58, 0.1],
    [0.66, -0.08],
  ])
    g.add(part(new THREE.CylinderGeometry(0.05, 0.06, 0.16, 10), T.pot, { x, y: counterY + 0.115, z }));
  g.add(part(new THREE.IcosahedronGeometry(0.08, 1), T.cabbage, { x: -0.15, y: counterY + 0.11, z: 0.18 }));
  // stock beneath the counter's open back and at its side
  g.add(crateModel(0.34, M, { x: W / 2 + 0.24, z: 0.12, ry: 0.25 }));
  g.add(part(sackGeometry(0.15, 0.4, 142 + awning), T.burlap, { x: -W / 2 - 0.2, z: 0.14, ry: 0.4 }));
  return g;
}
