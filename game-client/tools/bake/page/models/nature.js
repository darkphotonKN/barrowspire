// Trees, bushes, rocks and ground decals.
//
// Foliage is LEAF CARDS, not faceted blobs (the spike's faceted low-poly trees were rejected):
// hundreds of small alpha-tested quads scattered over a few canopy lumps, each lit with the
// lump's RADIAL normal rather than its own, so the silhouette is leafy and the shading reads as
// a volume. A dark core sphere behind the cards stops the canopy looking see-through.

import * as THREE from "three";
import { clamp, fbm3, hash2, rng, vnoise3 } from "../noise.js";
import { color, mix, shade } from "../palette.js";
import { leafTexture, materials } from "../materials.js";
import { part } from "./util.js";

export const LEAF = {
  oak: "arcane",
  oakDeep: mix("arcane", "arcaneDeep", 0.35),
  autumn: mix("brass", "amber", 0.35),
  pine: mix("arcaneDeep", "necrotic", 0.3),
  bush: mix("arcaneDeep", "barrowBrown", 0.25),
  grass: mix("arcane", "arcaneDeep", 0.5),
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

export function pine(seed) {
  const M = materials();
  const R = rng(seed);
  const g = new THREE.Group();
  const core = coreMaterial(LEAF.pine, 0.3);
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
  g.add(new THREE.Mesh(cardCloud(cards), cardMaterial(LEAF.pine, true)));
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
