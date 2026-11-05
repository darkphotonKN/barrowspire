// Leg clearance: the bake's guard against legs passing through a garment (a tunic's skirts, a
// hauberk, a robe). A garment made by anatomy.js `skirt` hangs as a tube of rings around the legs
// made by `legs`; both are skinned, so a clip can carry a thigh out through the cloth where the
// skirt's skin weights fail to follow it. Every class walked with its legs through its garment
// (anatomy.js `skirt` skinned each half to the opposite thigh) and no one saw it at 1x; the 2x
// archer showed it at once.
//
// The test is geometric, per baked pose, in model space: every leg vertex that lies between a
// garment's waistband and its hem is cast outward from the garment's axis, and its distance past
// the garment's wall there is how far it pokes out: a signed distance of a body point to the
// cloth, the usual cloth-vs-body penetration measure, with a tolerance margin. It is taken against
// the garment's own rings rather than a nearest triangle, so an open front (a split coat) counts
// as uncovered rather than as a wall. A leg already showing at rest (the archer's hose at the
// sides of his short skirt) is the authored look, so each vertex is scored by how much FURTHER
// out a pose carries it than the bind pose has it: motion may not carry a leg through the cloth.
//
// Pure geometry on three.js objects; no rendering, so it runs in Node tests as in the bake page,
// and it costs the bake about as much as one more pass of the poses.

import * as THREE from "three";
import { K1 } from "../projection.js";

/**
 * How far (1x px, measured in model space: an upper bound on the screen) a pose may carry a leg
 * further out through a garment than the bind pose has it. Not zero: a garment's waistband stays with the belt while the thigh under it
 * swings, so skinning alone leaves the cloth there about 1 px behind a fitted thigh (the classes
 * measure 0.9 to 1.3 px at worst); the old opposite-thigh weighting measured 4.6 to 12 px.
 */
export const CLEARANCE_PX = 2;

/**
 * Clips the guard does not hold to it: a death folds the thighs up to the chest as the body drops,
 * further than any skinned skirt can follow (that would take draped cloth), and plays once.
 */
export const UNGUARDED = ["death"];

/**
 * Sheets baked before the guard whose legs still pass through their garment, each still built
 * with the old opposite-thigh weighting (`skirt({ mirrored: true })`) so its pixels do not move,
 * each with a ceiling: its worst poke as measured on 2026-11-06 (1x px, as CLEARANCE_PX), rounded
 * up a little. The guard fails a listed sheet that pokes past its ceiling, so a listed sheet
 * cannot get worse unseen. The list only shrinks: a sheet leaves it when it is fixed and re-baked
 * (the guard fails a listed sheet that passes, so the entry cannot outlive the fix), and a new
 * sheet never joins it.
 */
export const KNOWN_CLIPPING = new Map([
  ["creature_troll_base", 10], // 9.42
  ["creature_zombie_base", 6.5], // 5.94
  ["creature_ghost_base", 7], // 6.50
  ["folk_resident_trousers", 5], // 4.64
  ["folk_spirewarden", 9.5], // 9.03
  ["folk_quartermaster", 9], // 8.28
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
  "folk_resident_skirt",
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
 * garment does not cover it (above its top ring, below its hem, or in its opening). With `reach`,
 * a point above the top ring or below the hem is measured against that ring instead (how far out
 * it would be were the garment there), which is how a vertex at rest just above the waistband or
 * just below the hem gets a baseline for the pose that brings it under the cloth.
 */
export function outside(rings, centres, v, reach = false) {
  const last = rings.length - 2;
  for (let r = 0; r <= last; r++) {
    const d = _d.subVectors(centres[r + 1], centres[r]);
    const dd = d.lengthSq();
    if (dd < 1e-12) continue;
    let u = _q.subVectors(v, centres[r]).dot(d) / dd;
    if (reach && r === 0 && u < 0) u = 0;
    if (reach && r === last && u > 1) u = 1;
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
 * The rig's garments (meshes `skirt` tags) and legs (meshes `legs` tags), or null when it has
 * either none: `measure()` gives, for the current pose, each leg vertex's distance outside the
 * garments that cover it (the least over them, so a leg inside the robe under a scapular panel is
 * inside), or null where none covers it.
 */
export function legsInGarments(rig) {
  const garments = [];
  const legs = [];
  rig.root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    if (o.userData.garment) garments.push(o);
    if (o.userData.leg) legs.push(o);
  });
  if (!garments.length || !legs.length) return null;
  const w = new THREE.Vector3();
  const at = (m, i) => m.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(m.matrixWorld);

  // The waistband, between a garment's top ring and the next, is not tested: the belt or sash
  // sits over it, and the root of a thigh rides up into it with every step.
  function garmentNow(m) {
    const { rows, cols, centres } = m.geometry.userData.tube;
    const rings = [];
    const mids = [];
    for (let r = 1; r < rows; r++) {
      const ring = [];
      const mid = new THREE.Vector3();
      for (let j = 0; j < cols; j++) {
        const i = r * cols + j;
        ring.push(at(m, i));
        // the ring's centre carried by this vertex's own weights; averaged over the ring it moves
        // as the ring does
        mid.add(m.applyBoneTransform(i, w.fromArray(centres[r])).applyMatrix4(m.matrixWorld));
      }
      rings.push(ring);
      mids.push(mid.divideScalar(cols));
    }
    return { rings, mids };
  }

  return {
    garments,
    legs,
    /** Per leg vertex, how far outside the garments; `reach` as in {@link outside} (the rest pose). */
    measure(reach = false) {
      rig.root.updateMatrixWorld(true);
      const now = garments.map(garmentNow);
      const out = [];
      for (const leg of legs) {
        const n = leg.geometry.attributes.position.count;
        for (let i = 0; i < n; i++) {
          const v = at(leg, i);
          let best = null;
          for (const g of now) {
            const o = outside(g.rings, g.mids, v, reach);
            if (o !== null && (best === null || o < best)) best = o;
          }
          out.push(best);
        }
      }
      return out;
    },
  };
}

/** The most any leg vertex is further outside the garments in `now` than at `rest`, in 1x px (model space). */
export function worstPoke(rest, now) {
  let worst = 0;
  for (let i = 0; i < now.length; i++) {
    if (now[i] === null) continue;
    const poke = Math.max(0, now[i]) - Math.max(0, rest[i] ?? 0);
    if (poke > worst) worst = poke;
  }
  return worst * K1;
}

/**
 * Runs every baked pose of a sheet (`poses`: { anim, i, apply } as page/main.js builds them) and
 * returns, per clip, the worst poke (1x px, model space) and the frame it happens on; null when the rig
 * has no garment over its legs. The bind pose is the baseline, with every spring at rest.
 */
export function legClearance(rig, poses, { restPose, applyPose, groundPose }) {
  const fit = legsInGarments(rig);
  if (!fit) return null;
  applyPose(rig, restPose);
  groundPose(rig);
  const rest = fit.measure(true);
  const clips = {};
  for (const p of poses) {
    if (UNGUARDED.some((a) => p.anim === a || p.anim.startsWith(`${a}_`))) continue;
    p.apply();
    const px = worstPoke(rest, fit.measure());
    const c = (clips[p.anim] ??= { px: 0, frame: 0 });
    if (px > c.px) Object.assign(c, { px, frame: p.i });
  }
  return clips;
}

/**
 * The guard's verdict for a sheet: an error naming each clip that carries a leg through, or null.
 * A sheet on `known` (KNOWN_CLIPPING) passes while it clips up to its ceiling and fails once it
 * pokes past it or no longer clips at all. `mirrored` (from {@link mirroredGarment}) fails a sheet
 * off `legacy` (MIRRORED_LEGACY), and a listed sheet that no longer asks for the old weighting.
 */
export function clearanceError(
  name,
  clips,
  { limit = CLEARANCE_PX, known = KNOWN_CLIPPING, mirrored = false, legacy = MIRRORED_LEGACY } = {},
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
      return `bake: ${name} no longer carries a leg through its garment: take it off KNOWN_CLIPPING (characters/clearance.js)`;
    const bad = over(ceiling);
    return bad.length
      ? `bake: ${name}: a leg passes through the garment past its KNOWN_CLIPPING ceiling of ${ceiling} px (characters/clearance.js): ${list(bad)}`
      : null;
  }
  if (!clips) return null;
  const bad = over(limit);
  if (!bad.length) return null;
  return (
    `bake: ${name}: a leg passes through the garment, more than ${limit} px further out than at rest ` +
    `(characters/clearance.js): ${list(bad)}`
  );
}
