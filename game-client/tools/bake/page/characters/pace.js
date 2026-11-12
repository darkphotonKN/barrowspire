// How fast a looping clip carries the body (FS-JS7C8 R3, R10): the speed the planted foot slides
// under it, measured on the rig rather than guessed, so the client's WALK_PACE and RUN_PACE
// (src/render/art/animationSelect.ts) and the backpedal legs' pace (clips.js BACKPEDAL_LEGS) are
// facts of the keys. Review and test tooling: the bake itself never reads it.
//
// A foot is planted while its sole is on the ground (groundPose sets the lowest sole there; a
// clip's flight lifts both off). While planted it should stay still in the world, so in the
// model, where the body stands still, it slides backward at the body's own speed. That slide,
// averaged over every moment a foot is planted, is the pace. A clip with a flight phase covers
// ground at that speed through the flight too, so the pace is the body's speed over the whole
// cycle, not only the planted part.

import * as THREE from "three";
import { applyPose, groundPose, sample } from "./clips.js";

/** World px per world unit (one tile edge): src/render/iso/projection.ts WORLD_PX_PER_TILE. */
export const WORLD_PX_PER_UNIT = 40;

/** A sole this close to the ground (world units, 0.25 px at 1x) is on it. */
export const GROUND_EPS = 0.006;

const _v = new THREE.Vector3();

/** The lowest point of every mesh riding `bone` (a boot on the foot bone), in model space. */
function soleOf(bone) {
  let min = null;
  bone.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || o === bone) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (!min || _v.y < min.y) min = _v.clone();
    }
  });
  return min;
}

const _inv = new THREE.Matrix4();
const _l = new THREE.Vector3();

/**
 * How high a foot's toe and heel stand (model space y): the lowest point of the meshes riding the
 * foot bone in front of the ankle by more than 0.06 H (the ball and toe) and behind it by more
 * than 0.02 H (the heel), in the foot's own frame.
 */
function toeAndHeel(rig, bone) {
  _inv.copy(bone.matrixWorld).invert();
  let toe = Infinity;
  let heel = Infinity;
  bone.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || o === bone) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      _l.copy(_v).applyMatrix4(_inv);
      if (_l.z > 0.06 * rig.H) toe = Math.min(toe, _v.y);
      if (_l.z < -0.02 * rig.H) heel = Math.min(heel, _v.y);
    }
  });
  return { toe, heel };
}

/**
 * Each foot's sole (its lowest point, model space) at fractional frame `f` of a looping clip,
 * posed and grounded as the bake poses it, its toe and heel heights, and the head bone's world
 * matrix.
 */
export function footing(rig, frames, f) {
  applyPose(rig, sample(frames, f, true));
  groundPose(rig);
  const ankle = (s) => new THREE.Vector3().setFromMatrixPosition(rig.bones[`foot${s}`].matrixWorld);
  return {
    L: soleOf(rig.bones.footL),
    R: soleOf(rig.bones.footR),
    toeHeelL: toeAndHeel(rig, rig.bones.footL),
    toeHeelR: toeAndHeel(rig, rig.bones.footR),
    ankleL: ankle("L"),
    ankleR: ankle("R"),
    hips: new THREE.Vector3().setFromMatrixPosition(rig.bones.hips.matrixWorld),
    head: rig.bones.head.matrixWorld.clone(),
  };
}

/**
 * The pace of a looping clip played at `fps`, in world px per second at 1x: the planted feet's
 * slide under the body (their ankles, which stay put while the sole rolls heel to toe), averaged
 * over the time any foot is planted. Positive is forward (the model's +z, its facing); a clip
 * that carries the body backward (the backpedal) is negative.
 */
export function measurePace(rig, frames, fps, { steps = 24 } = {}) {
  const n = frames.length;
  const at = Array.from({ length: n * steps + 1 }, (_, k) => footing(rig, frames, k / steps));
  let slide = 0;
  let planted = 0;
  const dt = 1 / (steps * fps);
  for (let k = 0; k < n * steps; k++) {
    const a = at[k];
    const b = at[k + 1];
    const feet = ["L", "R"].filter((s) => a[s].y < GROUND_EPS && b[s].y < GROUND_EPS);
    if (!feet.length) continue;
    // forward speed is the planted ankle sliding back (-z)
    slide += feet.reduce((sum, s) => sum - (b[`ankle${s}`].z - a[`ankle${s}`].z), 0) / feet.length;
    planted += dt;
  }
  return planted > 0 ? (slide / planted) * WORLD_PX_PER_UNIT : 0;
}
