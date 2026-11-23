// Edge-sampled clearance for the tests' carried gear (FS-JS7C8 § Change: The archer's sprint and
// low-ready bow R76; § Change: The mercenary's sprint and trailing sword R104–R105): a held piece's
// meshes as model-space edges, points sampled along them, how far those points lie outside the
// legs, boots and skirts (clearance.js `outside`), and whether the edges cross a cloth or the body
// (segment against triangle, skinned as posed). Read by archerLooks.test.mjs (the bow) and
// mercLooks.test.mjs (the sword and the sword arm). Test support only: the bake never reads it.

import * as THREE from "three";
import { outside, tubeNow } from "./clearance.js";

/** Whether `o` and every parent of it is drawn (the bow's arrow hides while nothing is nocked). */
export const shown = (o) => {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
};

/** The name of the bone `o` rides (its nearest bone ancestor), or "" for none. */
export const boneOf = (o) => {
  for (let p = o.parent; p; p = p.parent) if (p.isBone) return p.name;
  return "";
};

/** A mesh's vertices as posed (a skinned one through its bones), model space. */
const posed = (m) => {
  const pos = m.geometry.attributes.position;
  return Array.from({ length: pos.count }, (_, i) => (m.isSkinnedMesh ? m.getVertexPosition(i, new THREE.Vector3()) : new THREE.Vector3().fromBufferAttribute(pos, i)).applyMatrix4(m.matrixWorld));
};

/**
 * Every edge of mesh `m` as posed, as model-space segments, each once; `keep(i)` keeps only the
 * edges both of whose vertices it passes (a sleeve's edges past the elbow). A thin piece with
 * vertices only at its ends (the bow's string) is only seen along its edges.
 */
export function edgesOf(m, keep = () => true) {
  const vs = posed(m);
  const index = m.geometry.index;
  const tri = (k) => (index ? index.getX(k) : k);
  const count = index ? index.count : vs.length;
  const seen = new Set();
  const out = [];
  for (let k = 0; k + 2 < count; k += 3)
    for (const [a, b] of [
      [tri(k), tri(k + 1)],
      [tri(k + 1), tri(k + 2)],
      [tri(k + 2), tri(k)],
    ]) {
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (seen.has(key) || vs[a].distanceToSquared(vs[b]) < 1e-12 || !keep(a) || !keep(b)) continue;
      seen.add(key);
      out.push([vs[a], vs[b]]);
    }
  return out;
}

/** Every edge of every drawn mesh under `root` (a held piece's group), model space. */
export function segmentsOf(root) {
  const out = [];
  root.traverse((o) => o.isMesh && shown(o) && out.push(...edgesOf(o)));
  return out;
}

/** Points along every segment, no further apart than `step` (model units), both ends included. */
export const along = (segments, step) =>
  segments.flatMap(([a, b]) => {
    const n = Math.max(1, Math.ceil(a.distanceTo(b) / step));
    return Array.from({ length: n + 1 }, (_, k) => a.clone().lerp(b, k / n));
  });

/** `segments` moved by `d`, copies. */
export const moved = (segments, d) => segments.map(([a, b]) => [a.clone().add(d), b.clone().add(d)]);

/**
 * The least distance any of `pts` lies outside each of the `solid` tubes (clearance.js
 * `outside`), per mesh; null for a mesh no point reaches along its length.
 */
export const leastOutside = (solid, pts) =>
  solid.map((m) => {
    const { rings, mids } = tubeNow(m);
    let worst = null;
    for (const v of pts) {
      const o = outside(rings, mids, v);
      if (o !== null && (worst === null || o < worst)) worst = o;
    }
    return worst;
  });

/** Whether segment a–b crosses triangle p–q–r (Möller–Trumbore, the segment's ends included). */
export const crosses = (a, b, p, q, r) => {
  const d = new THREE.Vector3().subVectors(b, a);
  const e1 = new THREE.Vector3().subVectors(q, p);
  const e2 = new THREE.Vector3().subVectors(r, p);
  const h = new THREE.Vector3().crossVectors(d, e2);
  const det = e1.dot(h);
  if (Math.abs(det) < 1e-12) return false;
  const s = new THREE.Vector3().subVectors(a, p);
  const u = s.dot(h) / det;
  if (u < 0 || u > 1) return false;
  const qv = new THREE.Vector3().crossVectors(s, e1);
  const v = d.dot(qv) / det;
  if (v < 0 || u + v > 1) return false;
  const t = e2.dot(qv) / det;
  return t >= 0 && t <= 1;
};

/** A mesh's triangles as posed (a skinned one through its bones), model space. */
export const trianglesOf = (m) => {
  const vs = posed(m);
  const index = m.geometry.index;
  const count = index ? index.count : vs.length;
  const tri = (k) => vs[index ? index.getX(k) : k];
  return Array.from({ length: Math.floor(count / 3) }, (_, k) => [tri(3 * k), tri(3 * k + 1), tri(3 * k + 2)]);
};

/** How many of `segments` cross any of `triangles` (boxes first, so most pairs are skipped). */
export const crossings = (segments, triangles) => {
  const box = new THREE.Box3();
  for (const t of triangles) for (const v of t) box.expandByPoint(v);
  const tbox = triangles.map((t) => new THREE.Box3().setFromPoints(t));
  const sbox = new THREE.Box3();
  let n = 0;
  for (const [a, b] of segments) {
    sbox.makeEmpty().expandByPoint(a).expandByPoint(b);
    if (!sbox.intersectsBox(box)) continue;
    if (triangles.some((t, k) => sbox.intersectsBox(tbox[k]) && crosses(a, b, ...t))) n++;
  }
  return n;
};

/** The legs and the skirts (skinned: `legs` tags a leg, `skirt` a garment), and the boots' feet and shafts riding the foot and shin bones. */
export const legSolids = (rig) => {
  const solid = [];
  rig.root.traverse((o) => {
    if (!o.isMesh || !o.geometry.userData.tube) return;
    if (o.isSkinnedMesh ? o.userData.leg || o.userData.garment : /^(shin|foot)[LR]$/.test(boneOf(o))) solid.push(o);
  });
  return solid;
};

/** The rig's cloak (anatomy.js `cloak` and the Duelist's half-cloak tag it), or undefined. */
export const cloakOf = (rig) => {
  let cloak;
  rig.root.traverse((o) => o.userData.cloak && (cloak = o));
  return cloak;
};
