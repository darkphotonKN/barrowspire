// Leg clearance: the bake's guard against legs showing through a garment (a tunic's skirts, a
// hauberk, a robe). A garment made by anatomy.js `skirt` hangs as a tube of rings around the legs
// made by `legs`; both are skinned, so a clip can carry a thigh out through the cloth where the
// skirt's skin weights fail to follow it. Every class walked with its legs through its garment
// (anatomy.js `skirt` skinned each half to the opposite thigh) and no one saw it at 1x; the 2x
// archer showed it at once. Then the thighs themselves: wider at the hip than the tunic's top,
// they showed as dark wedges at both sides of the waist on all four classes, even through the
// mage's robe, in every pose including the bind pose.
//
// The test is geometric, per baked pose, in model space: every leg vertex that lies between a
// garment's top ring (its waistband) and its hem is cast outward from the garment's axis, and its
// distance past the garment's wall there is how far it shows: a signed distance of a body point
// to the cloth, the usual cloth-vs-body penetration measure, with a tolerance margin. It is taken
// against the garment's own rings rather than a nearest triangle, so an open front (a split coat)
// counts as uncovered rather than as a wall. A belt or sash (anatomy.js `belt`, `sash`) is cover
// too, over its own height: it sits over the waistband and the root of the thigh under it. The
// distance is absolute: a leg outside the cloth at rest fails as surely as one a pose carries out.
//
// Pure geometry on three.js objects; no rendering, so it runs in Node tests as in the bake page,
// and it costs the bake about as much as one more pass of the poses.

import * as THREE from "three";
import { K1 } from "../projection.js";

/**
 * How far a leg may lie outside the cloth over it, in BAKED px: one. The measure is in 1x px
 * (model space, an upper bound on the screen), and a sheet baked at `scale` draws `scale` px for
 * each, so the limit in 1x px is CLEARANCE_PX / scale ({@link clearanceLimit}): 1 px at 1x, half
 * a px at 2x. A sliver under a baked px is blended into the cloth's edge by the bake's
 * supersample; the wedges at the waist that Nick saw were 1.1 to 1.4 baked px at 1x and 3 at 2x.
 */
export const CLEARANCE_PX = 1;

/** The limit in 1x px (model space) for a sheet baked at `scale`: CLEARANCE_PX baked px. */
export const clearanceLimit = (scale = 1) => CLEARANCE_PX / scale;

/**
 * Clips the guard does not hold to it: a death folds the thighs up to the chest as the body drops,
 * further than any skinned skirt can follow (that would take draped cloth), and plays once.
 */
export const UNGUARDED = ["death"];

/**
 * Sheets baked before the guard whose legs still show through their garment, each still built
 * with the old opposite-thigh weighting (`skirt({ mirrored: true })`) and today's thighs so its
 * pixels do not move, each with a ceiling: its worst distance outside the cloth as measured on
 * 2026-11-06 (1x px, every legacy sheet is 1x), rounded up a little. The guard fails a listed
 * sheet that goes past its ceiling, so a listed sheet cannot get worse unseen. The list only
 * shrinks: a sheet leaves it when it is fixed and re-baked (the guard fails a listed sheet that
 * passes, so the entry cannot outlive the fix), and a new sheet never joins it.
 */
export const KNOWN_CLIPPING = new Map([
  ["creature_troll_base", 10], // 9.42
  ["creature_zombie_base", 6.5], // 5.94
  ["creature_ghost_base", 7], // 6.50
  // the hub folk left it on 2026-11-12, re-baked on the garment weighting (FS-HF0WW § Change: The
  // folk's legs stay under their clothes)
]);

/**
 * The sheets still built with `skirt({ mirrored: true })`, the old weighting kept so their pixels
 * do not move: the KNOWN_CLIPPING sheets, and those whose legs no garment covers. The guard fails
 * any other sheet that asks for it, and a listed sheet that no longer does. It only shrinks.
 */
export const MIRRORED_LEGACY = new Set([
  ...KNOWN_CLIPPING.keys(),
  "creature_ghoul_base",
  "creature_demon_base",
]);

/** Whether any garment on the rig was made with `skirt({ mirrored: true })` (anatomy.js). */
export function mirroredGarment(rig) {
  let mirrored = false;
  rig.root.traverse((o) => {
    if (o.userData.garment && o.userData.mirrored) mirrored = true;
  });
  return mirrored;
}

/**
 * Where a ray from the origin through `p` (2D) leaves the polygon `poly` (points, 2D; consecutive
 * points are edges, the last not joined back to the first): the farthest crossing's distance from
 * the origin, or null when the ray crosses no edge (an opening in an open garment).
 */
export function wallAlong(poly, p) {
  const len = Math.hypot(p[0], p[1]);
  if (len < 1e-12) return null;
  const dx = p[0] / len;
  const dy = p[1] / len;
  let far = null;
  for (let j = 0; j + 1 < poly.length; j++) {
    const [ax, ay] = poly[j];
    const ex = poly[j + 1][0] - ax;
    const ey = poly[j + 1][1] - ay;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = (ax * ey - ay * ex) / den;
    const s = (ax * dy - ay * dx) / den;
    if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9 && (far === null || t > far)) far = t;
  }
  return far;
}

/**
 * How far point `v` lies outside a garment given as rings (each an array of THREE.Vector3, the
 * same column count, top to hem) around centres (one per ring): negative inside, null where the
 * garment does not cover it (above its top ring, below its hem, or in its opening).
 */
export function outside(rings, centres, v) {
  for (let r = 0; r + 1 < rings.length; r++) {
    const d = _d.subVectors(centres[r + 1], centres[r]);
    const dd = d.lengthSq();
    if (dd < 1e-12) continue;
    const u = _q.subVectors(v, centres[r]).dot(d) / dd;
    if (u < 0 || u > 1) continue;
    const n = d.normalize();
    // a frame on the plane across the axis
    const e1 = _e1.set(1, 0, 0).addScaledVector(n, -n.x).normalize();
    const e2 = _e2.crossVectors(n, e1);
    const c = _c.copy(centres[r]).lerp(centres[r + 1], u);
    const poly = rings[r].map((a, j) => {
      _p.copy(a).lerp(rings[r + 1][j], u).sub(c);
      return [_p.dot(e1), _p.dot(e2)];
    });
    _q.subVectors(v, c);
    const p = [_q.dot(e1), _q.dot(e2)];
    const wall = wallAlong(poly, p);
    return wall === null ? null : Math.hypot(p[0], p[1]) - wall;
  }
  return null;
}
const _d = new THREE.Vector3();
const _q = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _c = new THREE.Vector3();
const _p = new THREE.Vector3();

/**
 * The rig's garments (meshes `skirt` tags), the belts and sashes over them (meshes `belt` and
 * `sash` tag as cover), and its legs (meshes `legs` tags), or null when it has no garment or no
 * leg: `measure()` gives, for the current pose, each leg vertex's distance outside the cloth that
 * covers it (the least over every garment and belt, so a leg inside the robe under a scapular
 * panel, or under the belt above a tunic's top, is inside), or null where none covers it.
 */
export function legsInGarments(rig) {
  const covers = [];
  const legs = [];
  let garments = 0;
  rig.root.traverse((o) => {
    if (o.isSkinnedMesh && o.userData.garment) {
      covers.push(o);
      garments++;
    }
    if (o.isMesh && !o.isSkinnedMesh && o.userData.cover) covers.push(o);
    if (o.isSkinnedMesh && o.userData.leg) legs.push(o);
  });
  if (!garments || !legs.length) return null;
  const w = new THREE.Vector3();
  const at = (m, i) => m.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(m.matrixWorld);

  // a cover's rings in the world, top ring (the waistband) to hem, and each ring's centre: a
  // skinned garment's carried by the ring's own weights (averaged over the ring it moves as the
  // ring does), a belt's by the bone it rides
  function ringsNow(m) {
    const { rows, cols, centres } = m.geometry.userData.tube;
    const rings = [];
    const mids = [];
    for (let r = 0; r < rows; r++) {
      const ring = [];
      const mid = new THREE.Vector3();
      for (let j = 0; j < cols; j++) {
        const i = r * cols + j;
        ring.push(at(m, i));
        if (m.isSkinnedMesh) mid.add(m.applyBoneTransform(i, w.fromArray(centres[r])).applyMatrix4(m.matrixWorld));
      }
      rings.push(ring);
      mids.push(m.isSkinnedMesh ? mid.divideScalar(cols) : mid.fromArray(centres[r]).applyMatrix4(m.matrixWorld));
    }
    return { rings, mids };
  }

  return {
    covers,
    legs,
    /**
     * Per leg vertex, how far outside the cloth over it (model units), or null where none covers
     * it. A vertex the rings put outside is measured again where the cloth really hangs
     * ({@link throughCloth}): a hem swung out by a stride or lifted by a heel tilts its rings, and
     * the cut square to their axis then reads a leg under the cloth, or under the hem, as out.
     */
    measure() {
      rig.root.updateMatrixWorld(true);
      const now = covers.map(ringsNow);
      const axis = new THREE.Vector3().setFromMatrixPosition(rig.bones.hips.matrixWorld);
      const out = [];
      for (const leg of legs) {
        const n = leg.geometry.attributes.position.count;
        for (let i = 0; i < n; i++) {
          const v = at(leg, i);
          let best = null;
          for (const g of now) {
            const o = outside(g.rings, g.mids, v);
            if (o !== null && (best === null || o < best)) best = o;
          }
          if (best !== null && best > 0) best = throughCloth(now, axis, v);
          out.push(best);
        }
      }
      return out;
    },
  };
}

/**
 * How far point `v` lies outside the cloth, measured along the level ray from the garments' axis
 * (the pelvis, `axis`) out through it, against the covers' surfaces as they hang now (`covers`:
 * each a { rings } of rings of THREE.Vector3, its quads between consecutive rings): negative (by
 * how far the cloth lies beyond it) where cloth still lies beyond it, so it is under the cloth;
 * the distance past the outermost cloth the ray crossed on its way out where none lies beyond, a
 * leg through the cloth; null where the ray meets no cloth at all, a leg below the hem or in an
 * opening, which no cloth covers.
 */
export function throughCloth(covers, axis, v) {
  const dir = new THREE.Vector3(v.x - axis.x, 0, v.z - axis.z);
  const dist = dir.length();
  if (dist < 1e-9) return null;
  dir.divideScalar(dist);
  const from = new THREE.Vector3(axis.x, v.y, axis.z);
  let before = -Infinity;
  let beyond = Infinity;
  const hit = (a, b, c) => {
    const t = rayTriangle(from, dir, a, b, c);
    if (t === null) return;
    if (t > dist) beyond = Math.min(beyond, t);
    else before = Math.max(before, t);
  };
  for (const { rings } of covers)
    for (let r = 0; r + 1 < rings.length; r++)
      for (let j = 0; j + 1 < rings[r].length; j++) {
        hit(rings[r][j], rings[r][j + 1], rings[r + 1][j]);
        hit(rings[r][j + 1], rings[r + 1][j + 1], rings[r + 1][j]);
      }
  if (beyond < Infinity) return dist - beyond;
  if (before > -Infinity) return dist - before;
  return null;
}

const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _pv = new THREE.Vector3();
const _tv = new THREE.Vector3();
const _qv = new THREE.Vector3();

/** Where a ray (origin `o`, unit `d`) meets triangle a, b, c from either side: its distance, or null (Möller–Trumbore). */
function rayTriangle(o, d, a, b, c) {
  _t1.subVectors(b, a);
  _t2.subVectors(c, a);
  _pv.crossVectors(d, _t2);
  const det = _t1.dot(_pv);
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  _tv.subVectors(o, a);
  const u = _tv.dot(_pv) * inv;
  if (u < 0 || u > 1) return null;
  _qv.crossVectors(_tv, _t1);
  const w = d.dot(_qv) * inv;
  if (w < 0 || u + w > 1) return null;
  const t = _t2.dot(_qv) * inv;
  return t > 0 ? t : null;
}

/** The furthest any leg vertex in `now` (from `measure`) lies outside the cloth, in 1x px (model space); 0 when none does. */
export function worstOutside(now) {
  let worst = 0;
  for (const o of now) if (o !== null && o > worst) worst = o;
  return worst * K1;
}

/**
 * Runs every baked pose of a sheet (`poses`: { anim, i, apply } as page/main.js builds them) and
 * returns, per clip, the furthest any leg lies outside the cloth over it (1x px, model space) and
 * the frame where it does; null when the rig has no garment over its legs.
 */
export function legClearance(rig, poses) {
  const fit = legsInGarments(rig);
  if (!fit) return null;
  const clips = {};
  for (const p of poses) {
    if (UNGUARDED.some((a) => p.anim === a || p.anim.startsWith(`${a}_`))) continue;
    p.apply();
    const px = worstOutside(fit.measure());
    const c = (clips[p.anim] ??= { px: 0, frame: 0 });
    if (px > c.px) Object.assign(c, { px, frame: p.i });
  }
  return clips;
}

/**
 * The guard's verdict for a sheet: an error naming each clip that shows a leg through, or null.
 * The limit is CLEARANCE_PX baked px for a sheet baked at `scale` ({@link clearanceLimit}). A
 * sheet on `known` (KNOWN_CLIPPING) passes while it clips up to its ceiling and fails once it
 * goes past it or no longer clips at all. `mirrored` (from {@link mirroredGarment}) fails a sheet
 * off `legacy` (MIRRORED_LEGACY), and a listed sheet that no longer asks for the old weighting.
 */
export function clearanceError(
  name,
  clips,
  { scale = 1, limit = clearanceLimit(scale), known = KNOWN_CLIPPING, mirrored = false, legacy = MIRRORED_LEGACY } = {},
) {
  if (mirrored && !legacy.has(name))
    return `bake: ${name}: skirt({ mirrored: true }) is kept for the sheets on MIRRORED_LEGACY only (characters/clearance.js); skin the garment to its own thighs`;
  if (!mirrored && legacy.has(name))
    return `bake: ${name} no longer asks for skirt({ mirrored: true }): take it off MIRRORED_LEGACY (characters/clearance.js)`;
  const over = (max) => Object.entries(clips ?? {}).filter(([, c]) => c.px > max);
  const list = (bad) => bad.map(([anim, c]) => `${anim} frame ${c.frame} by ${c.px.toFixed(2)} px`).join(", ");
  if (known.has(name)) {
    const ceiling = known.get(name);
    if (!over(limit).length)
      return `bake: ${name} no longer shows a leg through its garment: take it off KNOWN_CLIPPING (characters/clearance.js)`;
    const bad = over(ceiling);
    return bad.length
      ? `bake: ${name}: a leg shows through the garment past its KNOWN_CLIPPING ceiling of ${ceiling} px (characters/clearance.js): ${list(bad)}`
      : null;
  }
  if (!clips) return null;
  const bad = over(limit);
  if (!bad.length) return null;
  return (
    `bake: ${name}: a leg shows through the garment, more than ${+limit.toFixed(3)} px outside it ` +
    `(1x px; ${CLEARANCE_PX} baked px at ${scale}x) (characters/clearance.js): ${list(bad)}`
  );
}
