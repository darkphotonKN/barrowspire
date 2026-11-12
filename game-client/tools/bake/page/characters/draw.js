// The bow draw (FS-2325V §E.2, I-2325V-5; § Change: The archer's draw stays on the aim line): the
// drawing hand is solved, not keyed. While a clip draws (`fx.ik` > 0) the right hand travels back
// along the arrow line, from the string's rest point away from the bow's grip, `DRAW_LEN` × `ik`
// rig heights, its elbow bending toward a pole behind and above (a key may move it: `fx.pole`). So
// wherever the bow hand sits, the drawing hand follows the line back from it: the bow hand's
// place sets the draw.
//
// Pure rig geometry (no materials), so the clip tests pose it as the bake does (cast.js
// `bowInHand` hangs the longbow on the same frame and runs this as the rig's hook).

import * as THREE from "three";
import { solveArm } from "./clips.js";
import { gripAt } from "./rig.js";

/** How far back the drawing hand travels from the string at full draw (`ik` 1), in rig heights. */
export const DRAW_LEN = 0.36;

/**
 * Where the drawing elbow's pole sits when a key sets none, [out, up] in rig heights (`fx.pole`):
 * straight above the line behind the hand, so the elbow rises behind it. Both bow shots set
 * their own (clips.js `AIM_DRAW`: the delver's and, since 2026-11-12, the Bone Archer's).
 */
export const DRAW_POLE = [0, 0.12];

/**
 * The longbow's own frame points (gear.js `longbow`), in rig heights: the grip on the stave and
 * the string's rest point. The arrow line runs from the rest point toward the grip.
 */
export const BOW_GRIP = 0.012;
export const BOW_BRACE = 0.075;

/** The right hand's grip point in the hand bone's frame (where a held thing, or the string, sits). */
export function drawGrip(rig) {
  const g = gripAt(rig, "R");
  return new THREE.Vector3(g[0] * rig.H - rig.bind.handR.x, g[1] * rig.H - rig.bind.handR.y, g[2] * rig.H - rig.bind.handR.z);
}

/**
 * Solves the drawing arm for pose `p` against the bow on `bowFrame` (the group the longbow hangs
 * in, on the left hand's grip). Returns the arrow line it drew along ({ nock, dir }, model space,
 * `dir` toward the bow) when the pose draws, else null; the arm is left as the pose set it.
 */
export function solveDraw(rig, bowFrame, p, grip = drawGrip(rig)) {
  rig.root.updateMatrixWorld(true);
  const ik = p.fx.ik ?? 0;
  if (!(ik > 0)) return null;
  const G = new THREE.Vector3(0, -BOW_GRIP * rig.H, 0).applyMatrix4(bowFrame.matrixWorld);
  const N = new THREE.Vector3(0, BOW_BRACE * rig.H, 0).applyMatrix4(bowFrame.matrixWorld);
  const dir = G.clone().sub(N).normalize();
  const target = N.clone().addScaledVector(dir, -DRAW_LEN * rig.H * ik);
  // the elbow bends toward a pole behind the hand along the line, `out` toward the drawing side
  // (-x) and `up` above it: a key's own `fx.pole` (the delver's shot), else above
  const [out, up] = p.fx.pole ?? DRAW_POLE;
  const pole = target.clone().addScaledVector(dir, -0.3 * rig.H).add(new THREE.Vector3(-out * rig.H, up * rig.H, 0));
  rig.bones.handR.rotation.set(0, 0, 0);
  solveArm(rig, "R", target, pole, grip);
  return { nock: N, dir };
}
