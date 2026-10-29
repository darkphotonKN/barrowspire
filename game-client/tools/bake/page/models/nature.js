// Trees, bushes, rocks and ground decals, and the Forlorn Forest's dead trees and floor dressing.
//
// Foliage is LEAF CARDS, not faceted blobs (the spike's faceted low-poly trees were rejected):
// hundreds of small alpha-tested quads scattered over a few canopy lumps, each lit with the
// lump's RADIAL normal rather than its own, so the silhouette is leafy and the shading reads as
// a volume. A dark core sphere behind the cards stops the canopy looking see-through.

import * as THREE from "three";
import { clamp, fbm, fbm3, hash2, rng, vnoise, vnoise3 } from "../noise.js";
import { color, mix, shade } from "../palette.js";
import { leafTexture, materials, pixelTexture, plain, textured } from "../materials.js";
import { part, scaled, V3 } from "./util.js";

export const LEAF = {
  oak: "arcane",
  oakDeep: mix("arcane", "arcaneDeep", 0.35),
  autumn: mix("brass", "amber", 0.35),
  pine: mix("arcaneDeep", "necrotic", 0.3),
  bush: mix("arcaneDeep", "barrowBrown", 0.25),
  grass: mix("arcane", "arcaneDeep", 0.5),
  // the Forlorn Forest (FS-3QHQZ §C R24): live, but dark and drained of colour, toward slate
  oakGloom: mix(mix("arcaneDeep", "slate", 0.42), "necrotic", 0.1),
  oakGloomDeep: mix(mix("arcaneDeep", "charcoal", 0.28), "slate", 0.3),
  pineGloom: mix(mix("arcaneDeep", "necrotic", 0.22), "charcoal", 0.38),
};

function cardCloud(cards) {
  const pos = [];
  const nor = [];
  const uv = [];
  const col = [];
  const idx = [];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  cards.forEach((cd, i) => {
    q.setFromEuler(e.set(cd.rx, cd.ry, cd.rz));
    const h = cd.size / 2;
    for (const [x, y, u, w] of [
      [-h, -h, 0, 0],
      [h, -h, 1, 0],
      [h, h, 1, 1],
      [-h, h, 0, 1],
    ]) {
      v.set(x, y, 0).applyQuaternion(q).add(cd.p);
      pos.push(v.x, v.y, v.z);
      nor.push(cd.n.x, cd.n.y, cd.n.z);
      uv.push(u, w);
      col.push(cd.c, cd.c * cd.g, cd.c * 0.95);
    }
    const b = i * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

const cardMaterial = (leaf, needle) =>
  new THREE.MeshStandardMaterial({
    map: leafTexture(needle, rng),
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    vertexColors: true,
    color: color(leaf),
    roughness: 0.9,
  });

const coreMaterial = (leaf, v = 0.55) =>
  new THREE.MeshStandardMaterial({ color: color(shade(leaf, v)), roughness: 1 });

function randDir(R, upBias = 0.25) {
  const v = new THREE.Vector3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1);
  if (v.lengthSq() < 1e-4) v.set(0, 1, 0);
  v.normalize();
  v.y = v.y * 0.8 + upBias;
  return v.normalize();
}

export function oak(seed, leaf) {
  const M = materials();
  const R = rng(seed);
  const g = new THREE.Group();
  const h = 1.15 + R() * 0.4;
  g.add(part(new THREE.CylinderGeometry(0.14, 0.26, h, 10, 4), M.bark, { y: h / 2 }));
  g.add(part(new THREE.ConeGeometry(0.42, 0.5, 10), M.bark, { y: 0.2 }));
  for (let i = 0; i < 4; i++) {
    const a = R() * Math.PI * 2;
    g.add(
      part(new THREE.CylinderGeometry(0.04, 0.09, 1.0, 6), M.bark, {
        x: Math.cos(a) * 0.3,
        y: h - 0.1 + R() * 0.3,
        z: Math.sin(a) * 0.3,
        rz: -Math.cos(a) * 0.8,
        rx: Math.sin(a) * 0.8,
      }),
    );
  }
  const core = coreMaterial(leaf);
  const cards = [];
  const lumps = 7 + Math.floor(R() * 3);
  for (let i = 0; i < lumps; i++) {
    const a = R() * Math.PI * 2;
    const d = R() * 0.85;
    const C = new THREE.Vector3(Math.cos(a) * d, h + 0.55 + R() * 1.0, Math.sin(a) * d);
    const r = 0.6 + R() * 0.35;
    g.add(part(new THREE.SphereGeometry(r * 0.75, 12, 10), core, { x: C.x, y: C.y, z: C.z }));
    for (let k = 0; k < 95; k++) {
      const dir = randDir(R);
      const dist = r * (0.62 + 0.45 * R());
      cards.push({
        p: C.clone().addScaledVector(dir, dist),
        n: dir.clone().add(new THREE.Vector3(0, 0.35, 0)).normalize(),
        size: 0.46 + R() * 0.3,
        rx: R() * 6.3,
        ry: R() * 6.3,
        rz: R() * 6.3,
        c: clamp(0.62 + 0.38 * dir.y + 0.45 * (dist / r - 0.62), 0.35, 1.35),
        g: 0.94 + R() * 0.12,
      });
    }
  }
  g.add(new THREE.Mesh(cardCloud(cards), cardMaterial(leaf, false)));
  return g;
}

export function pine(seed, leaf = LEAF.pine) {
  const M = materials();
  const R = rng(seed);
  const g = new THREE.Group();
  const core = coreMaterial(leaf, 0.3);
  const cards = [];
  g.add(part(new THREE.CylinderGeometry(0.06, 0.16, 3.6, 8), M.bark, { y: 1.8 }));
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const r = 1.15 - t * 0.85;
    const h = 1.15 - t * 0.4;
    const y0 = 1.0 + t * 2.7;
    g.add(part(new THREE.ConeGeometry(r * 0.72, h * 0.9, 12, 1, true), core, { y: y0 + h * 0.45 }));
    for (let k = 0; k < 70; k++) {
      const a = R() * Math.PI * 2;
      const rr = Math.sqrt(R());
      const y = y0 + h * (1 - rr) * 0.95 + (R() - 0.5) * 0.12;
      cards.push({
        p: new THREE.Vector3(Math.cos(a) * r * rr, y, Math.sin(a) * r * rr),
        n: new THREE.Vector3(Math.cos(a) * 0.7, 0.75, Math.sin(a) * 0.7).normalize(),
        size: 0.42 + R() * 0.2,
        rx: -1.2 + (R() - 0.5) * 1.2,
        ry: -a + Math.PI / 2,
        rz: (R() - 0.5) * 0.8,
        c: clamp(0.45 + 0.55 * rr + 0.25 * t, 0.3, 1.2),
        g: 0.95 + R() * 0.1,
      });
    }
  }
  g.add(new THREE.Mesh(cardCloud(cards), cardMaterial(leaf, true)));
  return g;
}

export function bush(seed) {
  const R = rng(seed);
  const g = new THREE.Group();
  const cards = [];
  const core = coreMaterial(LEAF.bush, 0.35);
  for (let i = 0; i < 3; i++) {
    const C = new THREE.Vector3((R() - 0.5) * 0.6, 0.3, (R() - 0.5) * 0.6);
    const r = 0.3 + R() * 0.15;
    g.add(part(new THREE.SphereGeometry(r * 0.7, 10, 8), core, { x: C.x, y: C.y, z: C.z }));
    for (let k = 0; k < 40; k++) {
      const dir = randDir(R, 0.35);
      const dist = r * (0.6 + 0.4 * R());
      cards.push({
        p: C.clone().addScaledVector(dir, dist),
        n: dir,
        size: 0.3 + R() * 0.15,
        rx: R() * 6.3,
        ry: R() * 6.3,
        rz: R() * 6.3,
        c: clamp(0.5 + 0.4 * dir.y, 0.3, 1.2),
        g: 0.95 + R() * 0.1,
      });
    }
  }
  g.add(new THREE.Mesh(cardCloud(cards), cardMaterial(LEAF.bush, false)));
  return g;
}

/** A noise-displaced icosphere with per-face grey jitter baked into vertex colours. */
function blob(r, seed, detail = 3, amp = 0.32, freq = 1.4) {
  const geo = new THREE.IcosahedronGeometry(r, detail);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const cols = new Float32Array(pos.count * 3);
  const R = rng(seed * 97 + 1);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.copy(v).normalize();
    const f = fbm3((v.x * freq) / r + seed, (v.y * freq) / r, (v.z * freq) / r, seed, 3);
    const hi = vnoise3((v.x * 7) / r, (v.y * 7) / r, (v.z * 7) / r, seed + 3);
    v.addScaledVector(n, ((f - 0.5) * 2 * amp + (hi - 0.5) * 0.22) * r);
    pos.setXYZ(i, v.x, v.y, v.z);
    const c = clamp(0.5 + (f - 0.45) * 1.2 + n.y * 0.28, 0.15, 1.3);
    cols[i * 3] = cols[i * 3 + 1] = cols[i * 3 + 2] = c;
  }
  for (let f = 0; f < pos.count; f += 3) {
    const j = 0.72 + R() * 0.56;
    const gj = 0.94 + R() * 0.12;
    for (let k = 0; k < 3; k++) {
      const q = (f + k) * 3;
      cols[q] *= j;
      cols[q + 1] *= j * gj;
      cols[q + 2] *= j;
    }
  }
  geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  return geo;
}

export function rock(seed) {
  const M = materials();
  const R = rng(seed);
  const g = new THREE.Group();
  g.add(part(blob(0.5, seed, 2, 0.35, 1.1), M.stoneVc, { y: 0.16, sy: 0.62, ry: R() * 6 }));
  if (R() > 0.4) g.add(part(blob(0.28, seed + 3, 1, 0.3, 1.2), M.stoneVc, { x: 0.45, y: 0.08, z: 0.2, sy: 0.6 }));
  return g;
}

/** Decal: a clump of grass blades (thin tapered cards) for scattering over ground tiles. */
export function grassTuft(seed) {
  const R = rng(seed);
  const g = new THREE.Group();
  const pos = [];
  const col = [];
  const nor = [];
  const blades = 16 + Math.floor(R() * 10);
  for (let i = 0; i < blades; i++) {
    const a = R() * Math.PI * 2;
    const d = Math.sqrt(R()) * 0.2;
    const bx = Math.cos(a) * d;
    const bz = Math.sin(a) * d;
    const h = 0.16 + R() * 0.22;
    const lean = (R() - 0.5) * 0.5;
    const yaw = R() * Math.PI;
    const w = 0.018 + R() * 0.012;
    const cx = Math.cos(yaw) * w;
    const cz = Math.sin(yaw) * w;
    const tx = bx + Math.cos(a) * lean * h;
    const tz = bz + Math.sin(a) * lean * h;
    pos.push(bx - cx, 0, bz - cz, bx + cx, 0, bz + cz, tx, h, tz);
    const dark = 0.45 + R() * 0.2;
    const lite = 0.95 + R() * 0.35 + 0.15 * hash2(i, seed, 3);
    col.push(dark, dark, dark * 0.9, dark, dark, dark * 0.9, lite, lite, lite * 0.9);
    for (let k = 0; k < 3; k++) nor.push(0, 1, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.MeshStandardMaterial({
    color: color(LEAF.grass),
    vertexColors: true,
    roughness: 0.95,
    side: THREE.DoubleSide,
  });
  g.add(new THREE.Mesh(geo, mat));
  return g;
}

/** Decal: a few pebbles, half-sunk. */
export function pebbles(seed) {
  const M = materials();
  const R = rng(seed);
  const g = new THREE.Group();
  const n = 3 + Math.floor(R() * 4);
  for (let i = 0; i < n; i++) {
    const r = 0.04 + R() * 0.05;
    g.add(
      part(blob(r, seed * 11 + i, 1, 0.25, 1.3), M.stoneVc, {
        x: (R() - 0.5) * 0.5,
        y: r * 0.25,
        z: (R() - 0.5) * 0.4,
        sy: 0.6,
        ry: R() * 6,
      }),
    );
  }
  return g;
}

// ── The Forlorn Forest (FS-3QHQZ §C R24, R28) ─────────────────────────────────────
// Dead trees, broken snags, and the floor dressing between the stands: ferns, stumps, fallen
// logs, toadstools. Cold and dim but never black: dead wood weathers to a silvered grey-brown,
// moss and lichen sit toward slate, and nothing is amber (amber means interactable) or bright.

const DEAD_BARK = mix(mix("barrowBrown", "slateLight", 0.45), "vellumDark", 0.1);
const HEARTWOOD = mix("vellumDark", "barrowBrown", 0.5);
const MOSS = mix(mix("arcaneDeep", "slate", 0.35), "barrowDeep", 0.15);
const LICHEN = mix(mix("slateLight", "vellumDark", 0.45), "arcaneDeep", 0.2);
const FUNGUS = mix("vellumDark", "barrowBrown", 0.45);
const FERN = mix(mix("arcaneDeep", "slate", 0.3), "barrowDeep", 0.12);
const FERN_DYING = mix("barrowBrown", "vellumDark", 0.25);
const SOIL = mix("barrowDeep", "charcoal", 0.35);
const STEM = shade(mix("vellumDark", "vellum", 0.3), 0.85);
const GILLS = mix("barrowDeep", "vellumDark", 0.3);
/** Toadstool caps, by variant: dusky brown, grave-pale, ash grey. Never amber, red or glowing. */
const CAPS = [mix("barrowBrown", "vellumDark", 0.3), mix("vellumDark", "slate", 0.35), mix("slateLight", "vellumDark", 0.4)];

let FOREST = null;

/** The forest's own materials, built once per bake (seeded textures, so deterministic). */
function forestMaterials() {
  if (FOREST) return FOREST;
  // furrows run along the texture's x, which a tube maps along its length: the grain follows
  // the limb
  const bark = pixelTexture(64, 128, (x, y) =>
    shade(DEAD_BARK, (0.5 + 0.5 * Math.abs(Math.sin(y * 0.4 + fbm(x / 30, y / 5, 31) * 5))) * (0.75 + 0.45 * fbm(x / 6, y / 3, 32))),
  );
  bark.repeat.set(3, 1);
  const rings = pixelTexture(64, 64, (x, y) => {
    const r = Math.hypot(x - 32, y - 32) + fbm(x / 9, y / 9, 33) * 3;
    return shade(HEARTWOOD, (r > 29 ? 0.45 : 0.78 + 0.16 * Math.sin(r * 1.3)) * (0.85 + 0.25 * vnoise(x / 3, y / 3, 34)));
  });
  FOREST = {
    deadBark: textured(bark, { rough: 1, bump: 0.8 }),
    rings: textured(rings, { rough: 1, bump: 0.3 }),
    heartwood: plain(HEARTWOOD, { rough: 1, flat: true }),
    moss: plain(MOSS, { rough: 1, flat: true }),
    lichen: plain(LICHEN, { rough: 1, side: THREE.DoubleSide }),
    fungus: plain(FUNGUS, { rough: 0.9 }),
    soil: plain(SOIL, { rough: 1, flat: true }),
    stem: plain(STEM, { rough: 0.8 }),
    gills: plain(GILLS, { rough: 1, side: THREE.DoubleSide }),
  };
  return FOREST;
}

/** A tapered, knotted tube along `points`, radius r0 at the first point to r1 at the last. */
function limb(points, r0, r1, material, seed) {
  const curve = new THREE.CatmullRomCurve3(points);
  const tubular = Math.max(6, points.length * 4);
  const radial = r0 > 0.08 ? 10 : 6;
  const geo = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    const p = curve.getPointAt(t);
    const r = r0 + (r1 - r0) * Math.pow(t, 0.8);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      const knot = 0.85 + 0.3 * vnoise3(p.x * 6, p.y * 6, p.z * 6 + j * 0.7, seed);
      v.fromBufferAttribute(pos, k).sub(p).multiplyScalar(r * knot);
      pos.setXYZ(k, p.x + v.x, p.y + v.y, p.z + v.z);
    }
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

/** `dir` bent by a random angle up to `amount` radians, then nudged by `bias` and renormalised. */
function bend(dir, R, amount, bias = V3(0, 0, 0)) {
  const axis = V3(R() - 0.5, R() - 0.5, R() - 0.5);
  if (axis.lengthSq() < 1e-4) axis.set(1, 0, 0);
  return dir.clone().applyAxisAngle(axis.normalize(), (R() - 0.3) * amount).add(bias).normalize();
}

/**
 * One gnarled branch and, while `depth` lasts, the branches it forks into: each segment kinks as
 * it grows, so nothing reads as a straight pole. Twig tips are collected in `ends`.
 */
function branch(g, M, R, from, dir, len, r0, depth, seed, ends) {
  const pts = [from.clone()];
  let p = from.clone();
  let d = dir.clone();
  for (let i = 0; i < 4; i++) {
    d = bend(d, R, 0.55, V3(0, 0.04, 0));
    p = p.clone().addScaledVector(d, len / 4);
    pts.push(p);
  }
  const r1 = depth > 0 ? r0 * 0.62 : Math.max(0.008, r0 * 0.3);
  g.add(limb(pts, r0, r1, M.deadBark, seed));
  if (depth <= 0) {
    ends.push(p);
    return;
  }
  g.add(part(new THREE.SphereGeometry(r1 * 1.05, 8, 6), M.deadBark, { x: p.x, y: p.y, z: p.z }));
  const forks = depth > 1 && R() > 0.6 ? 3 : 2;
  for (let k = 0; k < forks; k++) {
    const child = bend(d, R, (0.5 + R() * 0.55) * 1.6, V3((R() - 0.5) * 0.6, 0.05, (R() - 0.5) * 0.6));
    branch(g, M, R, p, child, len * (0.6 + R() * 0.18), r1 * 0.95, depth - 1, seed + k + 1, ends);
  }
  // a broken-off stub partway along, where a limb fell
  if (R() > 0.55) {
    const at = pts[2];
    const stub = bend(d, R, 1.4, V3(0, -0.1, 0));
    g.add(limb([at, at.clone().addScaledVector(stub, len * 0.18)], r0 * 0.5, r0 * 0.35, M.deadBark, seed + 9));
  }
}

/** Root flares where a trunk meets the ground. */
function rootFlares(g, M, R, r, n, seed) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + R() * 0.6;
    const out = V3(Math.cos(a), 0, Math.sin(a));
    const len = r * (2.2 + R() * 1.4);
    g.add(
      limb(
        [V3(0, r * 1.6, 0).addScaledVector(out, r * 0.4), V3(0, r * 0.5, 0).addScaledVector(out, r * 1.2), V3(0, -0.02, 0).addScaledVector(out, len)],
        r * 0.55,
        r * 0.12,
        M.deadBark,
        seed + i,
      ),
    );
  }
}

/** Grey-green lichen beard hanging from a twig: a few thin strands tapering to a point. */
function lichenBeard(g, M, R, at) {
  const n = 2 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const h = 0.18 + R() * 0.3;
    g.add(part(new THREE.ConeGeometry(0.012 + R() * 0.008, h, 4), M.lichen, { x: at.x + (R() - 0.5) * 0.06, y: at.y - h / 2, z: at.z + (R() - 0.5) * 0.06, rx: Math.PI }));
  }
}

/** A dead tree: bare, gnarled, its crown a tangle of kinked limbs, lichen hanging from a few. */
export function deadTree(seed) {
  const M = forestMaterials();
  const R = rng(seed);
  const g = new THREE.Group();
  const r = 0.2 + R() * 0.05;
  const h = 1.7 + R() * 0.6;
  // the trunk leans and twists on its way up
  const trunk = [V3(0, 0, 0)];
  let p = V3(0, 0, 0);
  let d = V3((R() - 0.5) * 0.35, 1, (R() - 0.5) * 0.35).normalize();
  for (let i = 0; i < 4; i++) {
    d = bend(d, R, 0.25, V3(0, 0.15, 0));
    p = p.clone().addScaledVector(d, h / 4);
    trunk.push(p);
  }
  g.add(limb(trunk, r, r * 0.62, M.deadBark, seed));
  rootFlares(g, M, R, r, 4 + Math.floor(R() * 2), seed + 40);
  const ends = [];
  // a low limb off the trunk, then the crown
  const la = R() * Math.PI * 2;
  branch(g, M, R, trunk[2], V3(Math.cos(la), 0.5, Math.sin(la)).normalize(), 0.9, r * 0.45, 1, seed + 50, ends);
  g.add(part(new THREE.SphereGeometry(r * 0.66, 10, 8), M.deadBark, { x: p.x, y: p.y, z: p.z }));
  const crown = R() > 0.4 ? 3 : 2;
  for (let k = 0; k < crown; k++) {
    const a = (k / crown) * Math.PI * 2 + R();
    const dir = V3(Math.cos(a) * 0.75, 0.75 + R() * 0.3, Math.sin(a) * 0.75).normalize();
    branch(g, M, R, p, dir, 0.85 + R() * 0.3, r * 0.6, 3, seed + 60 + k * 7, ends);
  }
  for (const at of ends) if (R() > 0.8) lichenBeard(g, M, R, at);
  return g;
}

/** Pale broken spikes of heartwood round a snapped trunk's top. */
function breakCrown(g, M, R, at, r, n) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + R() * 0.5;
    const h = 0.08 + R() * (i % 3 === 0 ? 0.42 : 0.18);
    g.add(
      part(new THREE.ConeGeometry(r * (0.22 + R() * 0.15), h, 4), i % 2 ? M.heartwood : M.deadBark, {
        x: at.x + Math.cos(a) * r * 0.62,
        y: at.y + h / 2 - 0.02,
        z: at.z + Math.sin(a) * r * 0.62,
        rx: (R() - 0.5) * 0.35,
        rz: (R() - 0.5) * 0.35,
      }),
    );
  }
  g.add(part(new THREE.CylinderGeometry(r * 0.55, r * 0.6, 0.04, 10), M.heartwood, { x: at.x, y: at.y - 0.01, z: at.z }));
}

/** Shelf fungus: a few half-discs stacked up a trunk's side, facing angle `a`. */
function brackets(g, M, R, y0, r, a) {
  for (let i = 0; i < 3; i++) {
    const w = 0.07 + R() * 0.05;
    g.add(
      part(new THREE.CylinderGeometry(w, w * 0.9, 0.025, 10, 1, false, 0, Math.PI), M.fungus, {
        x: Math.cos(a) * r * 0.9,
        y: y0 + i * 0.09,
        z: Math.sin(a) * r * 0.9,
        ry: -a + Math.PI / 2,
      }),
    );
  }
}

/** A dead snag: a trunk snapped part way up, its top a crown of splinters, its fallen top beside it. */
export function deadSnag(seed) {
  const M = forestMaterials();
  const R = rng(seed);
  const g = new THREE.Group();
  const r = 0.24 + R() * 0.05;
  const h = 1.15 + R() * 0.55;
  const top = V3((R() - 0.5) * 0.2, h, (R() - 0.5) * 0.2);
  g.add(limb([V3(0, 0, 0), V3(top.x * 0.4, h * 0.5, top.z * 0.4), top], r, r * 0.8, M.deadBark, seed));
  rootFlares(g, M, R, r, 4, seed + 40);
  breakCrown(g, M, R, top, r * 0.8, 9);
  // a stub branch, snapped short
  const a = R() * Math.PI * 2;
  const at = V3(top.x * 0.7, h * 0.68, top.z * 0.7);
  g.add(limb([at, at.clone().add(V3(Math.cos(a) * 0.32, 0.18, Math.sin(a) * 0.32))], r * 0.38, r * 0.25, M.deadBark, seed + 5));
  brackets(g, M, R, h * 0.3, r, a + Math.PI * 0.8);
  // the fallen top, lying where it dropped
  const fa = a + Math.PI * (0.6 + R() * 0.8);
  const f0 = V3(Math.cos(fa) * 0.45, r * 0.55, Math.sin(fa) * 0.45);
  g.add(
    limb(
      [f0, f0.clone().add(V3(Math.cos(fa) * 0.5, -0.03, Math.sin(fa) * 0.5)), f0.clone().add(V3(Math.cos(fa + 0.2) * 1.0, -0.06, Math.sin(fa + 0.2) * 1.0))],
      r * 0.62,
      r * 0.3,
      M.deadBark,
      seed + 7,
    ),
  );
  return g;
}

/** Leaflet triangles of one fern frond, appended to `out` ({ pos, col }). */
function frond(out, R, a, seed, f) {
  const len = 0.45 + R() * 0.25;
  const rise = 0.28 + R() * 0.16;
  const dir = V3(Math.cos(a), 0, Math.sin(a));
  const side = V3(-dir.z, 0, dir.x);
  const at = (t) => V3(dir.x * len * t, rise * Math.sin(t * Math.PI * 0.82) + 0.01, dir.z * len * t);
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const p = at(t);
    const q = at(Math.min(1, t + 0.08));
    const w = 0.11 * Math.sin(t * Math.PI * 0.92) + 0.015;
    const dark = 0.62 + 0.12 * t;
    const lite = 0.8 + 0.3 * t + 0.1 * hash2(f, i, seed);
    for (const s of [-1, 1]) {
      const tip = p.clone().addScaledVector(side, s * w).add(V3(0, -0.03 * t, 0)).addScaledVector(dir, w * 0.4);
      out.pos.push(p.x, p.y, p.z, q.x, q.y, q.z, tip.x, tip.y, tip.z);
      out.col.push(dark, dark, dark, dark, dark, dark, lite, lite, lite);
    }
  }
}

/** A fern: arching fronds, each a rachis lined with paired leaflets; some variants dying back. */
export function fern(seed) {
  const R = rng(seed);
  const g = new THREE.Group();
  const green = { pos: [], col: [] };
  const brown = { pos: [], col: [] };
  const fronds = 8 + Math.floor(R() * 4);
  // every third frond of a dying fern has browned
  const dying = seed % 3 === 0;
  for (let f = 0; f < fronds; f++) frond(dying && f % 3 === 0 ? brown : green, R, (f / fronds) * Math.PI * 2 + (R() - 0.5) * 0.5, seed, f);
  for (const [set, tone] of [
    [green, FERN],
    [brown, FERN_DYING],
  ]) {
    if (!set.pos.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(set.pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(set.pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(set.col, 3));
    g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: color(tone), vertexColors: true, roughness: 0.95, side: THREE.DoubleSide })));
  }
  return scaled(g, 1.1);
}

/** A stump: flared roots, a slanted saw-cut top showing its rings, moss up one side. */
export function stump(seed) {
  const M = forestMaterials();
  const R = rng(seed);
  const g = new THREE.Group();
  const r = 0.26 + R() * 0.06;
  const h = 0.26 + R() * 0.12;
  g.add(limb([V3(0, 0, 0), V3(0, h * 0.5, 0), V3(0, h, 0)], r * 1.08, r, M.deadBark, seed));
  rootFlares(g, M, R, r * 0.7, 5, seed + 40);
  const tilt = 0.12 + R() * 0.1;
  g.add(part(new THREE.CylinderGeometry(r * 0.98, r * 0.98, 0.05, 20), M.rings, { y: h, rx: tilt, ry: R() * 3 }));
  // the even variant has rotted at the heart
  if (seed % 2 === 0) g.add(part(new THREE.CylinderGeometry(r * 0.42, r * 0.3, 0.06, 12), M.soil, { y: h + 0.006, rx: tilt }));
  const ma = R() * Math.PI * 2;
  for (let i = 0; i < 5; i++)
    g.add(
      part(new THREE.SphereGeometry(0.07 + R() * 0.04, 6, 5), M.moss, {
        x: Math.cos(ma + (R() - 0.5) * 1.2) * r * 0.95,
        y: 0.04 + R() * h * 0.8,
        z: Math.sin(ma + (R() - 0.5) * 1.2) * r * 0.95,
        sy: 0.55,
      }),
    );
  brackets(g, M, R, h * 0.35, r, ma + Math.PI);
  return g;
}

/** A fallen log, half sunk: one end sawn, the other snapped, moss along its back. */
export function fallenLog(seed) {
  const M = forestMaterials();
  const R = rng(seed);
  const g = new THREE.Group();
  const r = 0.17 + R() * 0.05;
  const len = 1.5 + R() * 0.35;
  const a = R() * Math.PI;
  const dir = V3(Math.cos(a), 0, Math.sin(a));
  const side = V3(-dir.z, 0, dir.x);
  const y = r * 0.78;
  const along = (t) => dir.clone().multiplyScalar(t * len).add(V3(0, y, 0));
  const pts = [along(-0.5), along(-0.17).addScaledVector(side, 0.04), along(0.17).addScaledVector(side, -0.03).add(V3(0, 0.02, 0)), along(0.5)];
  g.add(limb(pts, r, r * 0.86, M.deadBark, seed));
  // the sawn end shows its rings; the snapped end splinters
  const sawn = part(new THREE.CylinderGeometry(r * 0.97, r * 0.97, 0.04, 16), M.rings);
  sawn.position.copy(pts[0]).addScaledVector(dir, -0.01);
  sawn.quaternion.setFromUnitVectors(V3(0, 1, 0), dir);
  g.add(sawn);
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * Math.PI * 2;
    const l = 0.06 + R() * 0.16;
    const s = part(new THREE.ConeGeometry(r * 0.24, l, 4), i % 2 ? M.heartwood : M.deadBark);
    s.position
      .copy(pts[3])
      .addScaledVector(side, Math.cos(ang) * r * 0.55)
      .add(V3(0, Math.sin(ang) * r * 0.55, 0))
      .addScaledVector(dir, l / 2 - 0.02);
    s.quaternion.setFromUnitVectors(V3(0, 1, 0), dir.clone().add(V3((R() - 0.5) * 0.3, (R() - 0.5) * 0.3, (R() - 0.5) * 0.3)).normalize());
    g.add(s);
  }
  // a broken-off branch stub, and moss along the top
  const b0 = along(0.05).add(V3(0, r * 0.6, 0));
  g.add(limb([b0, b0.clone().addScaledVector(side, 0.18).add(V3(0, 0.2, 0))], r * 0.35, r * 0.22, M.deadBark, seed + 3));
  for (let i = 0; i < 7; i++) {
    const p = along(-0.42 + R() * 0.8);
    g.add(
      part(new THREE.SphereGeometry(0.06 + R() * 0.05, 6, 5), M.moss, {
        x: p.x + side.x * (R() - 0.5) * 0.1,
        y: p.y + r * 0.8,
        z: p.z + side.z * (R() - 0.5) * 0.1,
        sx: 1.4,
        sy: 0.45,
        ry: -a,
      }),
    );
  }
  return g;
}

/** A clump of toadstools on a hump of soil: pale stems, dull caps, dark gills. */
export function toadstools(seed) {
  const M = forestMaterials();
  const R = rng(seed);
  const g = new THREE.Group();
  const cap = plain(CAPS[seed % CAPS.length], { rough: 0.75 });
  g.add(part(new THREE.SphereGeometry(0.3, 10, 6), M.soil, { y: -0.2, sy: 0.75 }));
  const n = 4 + Math.floor(R() * 4);
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2;
    const d = Math.sqrt(R()) * 0.24;
    const big = i === 0 ? 1.5 : 0.7 + R() * 0.6;
    const h = 0.11 * big + R() * 0.04;
    const cr = 0.06 * big + R() * 0.02;
    const t = new THREE.Group();
    t.position.set(Math.cos(a) * d, 0, Math.sin(a) * d * 0.85);
    t.rotation.set((R() - 0.5) * 0.4, 0, (R() - 0.5) * 0.4);
    t.add(part(new THREE.CylinderGeometry(cr * 0.22, cr * 0.32, h, 7), M.stem, { y: h / 2 }));
    t.add(part(new THREE.SphereGeometry(cr, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), cap, { y: h - 0.005, sy: 0.55 + R() * 0.25 }));
    t.add(part(new THREE.CircleGeometry(cr * 0.98, 12), M.gills, { y: h - 0.006, rx: Math.PI / 2 }));
    g.add(t);
  }
  return scaled(g, 1.25);
}
