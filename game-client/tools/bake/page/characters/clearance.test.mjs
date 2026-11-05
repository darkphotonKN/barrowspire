import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { createRig, jointAt as J } from "./rig.js";
import { legs, skirt, skirtBones, torso } from "./anatomy.js";
import { applyPose, groundPose, pose, simulateSprings, walkCycle, ANIMATIONS } from "./clips.js";
import { CLEARANCE_PX, KNOWN_CLIPPING, MIRRORED_LEGACY, UNGUARDED, clearanceError, legClearance, mirroredGarment, outside, wallAlong } from "./clearance.js";

const mat = () => new THREE.MeshBasicMaterial();
const bones = { restPose: pose(), applyPose, groundPose };

/** A square ring of side 2s at height y, `n` points a side, centred on the y axis. */
const ring = (y, s, closed = true) => {
  const pts = [];
  for (const [x, z] of [
    [s, -s],
    [s, s],
    [-s, s],
    [-s, -s],
  ])
    pts.push(new THREE.Vector3(x, y, z));
  if (closed) pts.push(pts[0].clone());
  return pts;
};

describe("the leg-clearance geometry", () => {
  it("finds where a ray from the axis leaves a garment's ring, and nothing through an opening", () => {
    const square = [
      [1, -1],
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ];
    expect(wallAlong(square, [0.5, 0])).toBeCloseTo(1);
    expect(wallAlong(square, [1, 1])).toBeCloseTo(Math.SQRT2);
    // open across the +x side: the ray toward it crosses no wall
    expect(wallAlong(square.slice(1), [1, 0])).toBeNull();
  });

  it("scores a point by how far it lies outside the garment between its top ring and hem", () => {
    const rings = [ring(1, 0.1), ring(0.5, 0.1)];
    const centres = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0.5, 0)];
    expect(outside(rings, centres, new THREE.Vector3(0.05, 0.7, 0))).toBeCloseTo(-0.05);
    expect(outside(rings, centres, new THREE.Vector3(0.13, 0.7, 0))).toBeCloseTo(0.03);
    // below the hem it is not covered, unless reaching for a rest baseline
    expect(outside(rings, centres, new THREE.Vector3(0.13, 0.3, 0))).toBeNull();
    expect(outside(rings, centres, new THREE.Vector3(0.13, 0.3, 0), true)).toBeCloseTo(0.03);
  });
});

/**
 * A walking figure in a fitted short skirt (the archer's cut), or a robe to the ankle (the
 * mage's), posed through the walk with its springs as the bake runs them.
 */
function figure({ robe = false, mirrored = false } = {}) {
  const rig = createRig(1.96);
  skirtBones(rig, { stiffness: 55 });
  const [, hy] = J(rig, "hips");
  torso(rig, mat());
  legs(rig, mat());
  if (robe) skirt(rig, mat(), { top: hy + 0.05, bottom: 0.016, rTop: [0.09, 0.072], rBottom: [0.155, 0.138], legFollow: 0.5, panels: true, panelWeight: 0.35, segs: 32, mirrored });
  else skirt(rig, mat(), { top: hy + 0.02, bottom: hy - 0.14, rTop: [0.1, 0.077], rBottom: [0.112, 0.094], legFollow: 0.7, panels: true, panelWeight: 0.3, mirrored });
  const frames = walkCycle({});
  const springs = simulateSprings(rig, frames, { ...ANIMATIONS.walk, speed: 1 });
  const poses = frames.map((p, i) => ({
    anim: "walk",
    i,
    apply: () => {
      applyPose(rig, p, springs[i]);
      groundPose(rig);
    },
  }));
  return { rig, poses };
}

describe("the leg-clearance guard (characters/clearance.js)", () => {
  for (const robe of [false, true])
    it(`fails a ${robe ? "robe" : "short skirt"} skinned each half to the opposite thigh, and passes it skinned to its own`, () => {
      const before = figure({ robe, mirrored: true });
      const red = legClearance(before.rig, before.poses, bones);
      expect(red.walk.px).toBeGreaterThan(CLEARANCE_PX);
      expect(clearanceError("char_test", red)).toMatch(/char_test: a leg passes through the garment.*walk frame \d+ by/);

      const after = figure({ robe });
      const green = legClearance(after.rig, after.poses, bones);
      expect(green.walk.px).toBeLessThan(CLEARANCE_PX);
      expect(clearanceError("char_test", green)).toBeNull();
    });

  it("has nothing to say about a figure with no garment over its legs", () => {
    const rig = createRig(1.96);
    legs(rig, mat());
    expect(legClearance(rig, [], bones)).toBeNull();
    expect(clearanceError("creature_test", null)).toBeNull();
  });

  it("leaves a death alone: a collapse folds the thighs past any skinned skirt", () => {
    const { rig, poses } = figure({ mirrored: true });
    const named = poses.map((p) => ({ ...p, anim: UNGUARDED[0] }));
    expect(legClearance(rig, named, bones)).toEqual({});
  });

  it("lets a listed sheet clip until it is fixed, then insists it leave the list", () => {
    const known = new Map([["folk_test", CLEARANCE_PX + 4]]);
    const clips = { walk: { px: CLEARANCE_PX + 3, frame: 2 } };
    expect(clearanceError("folk_test", clips, { known })).toBeNull();
    expect(clearanceError("folk_test", { walk: { px: 0.4, frame: 0 } }, { known })).toMatch(/take it off KNOWN_CLIPPING/);
    expect(clearanceError("char_test", clips, { known })).toMatch(/walk frame 2/);
    for (const cls of ["char_knight_base", "char_archer_base", "char_wizard_base", "char_mercenary_base"]) expect(KNOWN_CLIPPING.has(cls)).toBe(false);
  });

  it("fails a listed sheet that pokes past its ceiling: it may not get worse unseen", () => {
    const known = new Map([["folk_test", 5]]);
    expect(clearanceError("folk_test", { walk: { px: 4.9, frame: 1 } }, { known })).toBeNull();
    expect(clearanceError("folk_test", { idle: { px: 0.5, frame: 0 }, walk: { px: 5.2, frame: 3 } }, { known })).toMatch(
      /folk_test: a leg passes through the garment past its KNOWN_CLIPPING ceiling of 5 px.*walk frame 3 by 5\.20 px/,
    );
    for (const [name, ceiling] of KNOWN_CLIPPING) expect(ceiling, name).toBeGreaterThan(CLEARANCE_PX);
  });

  it("insists a listed sheet whose legs no garment covers any more leave the list", () => {
    const known = new Map([["folk_test", 5]]);
    expect(clearanceError("folk_test", null, { known })).toMatch(/folk_test no longer carries a leg.*take it off KNOWN_CLIPPING/);
  });

  it("keeps the old weighting to the legacy sheets: fails any other sheet that asks for it, and a listed one that no longer does", () => {
    const legacy = new Set(["folk_test"]);
    const { rig } = figure({ mirrored: true });
    expect(mirroredGarment(rig)).toBe(true);
    expect(mirroredGarment(figure().rig)).toBe(false);
    expect(clearanceError("folk_test", null, { mirrored: true, legacy })).toBeNull();
    expect(clearanceError("char_test", null, { mirrored: true, legacy })).toMatch(/char_test: skirt\(\{ mirrored: true \}\) is kept for the sheets on MIRRORED_LEGACY only/);
    expect(clearanceError("folk_test", null, { legacy })).toMatch(/folk_test no longer asks for skirt.*take it off MIRRORED_LEGACY/);
    for (const name of KNOWN_CLIPPING.keys()) expect(MIRRORED_LEGACY.has(name), name).toBe(true);
    for (const cls of ["char_knight_base", "char_archer_base", "char_wizard_base", "char_mercenary_base"]) expect(MIRRORED_LEGACY.has(cls)).toBe(false);
  });
});

describe("a skirt's legs (anatomy.js skirt)", () => {
  const sideWeights = (mirrored) => {
    const rig = createRig(1.96);
    skirtBones(rig);
    const [, hy] = J(rig, "hips");
    const m = skirt(rig, mat(), { top: hy + 0.02, bottom: hy - 0.14, rTop: [0.1, 0.077], rBottom: [0.112, 0.094], legFollow: 0.7, panels: true, mirrored });
    const names = rig.skeleton.bones.map((b) => b.name);
    const { position: pos, skinIndex: si, skinWeight: sw } = m.geometry.attributes;
    const sum = { left: {}, right: {} };
    for (let i = 0; i < pos.count; i++) {
      const side = pos.getX(i) > 1e-3 ? "left" : pos.getX(i) < -1e-3 ? "right" : null;
      if (side) for (let k = 0; k < 4; k++) sum[side][names[si.getComponent(i, k)]] = (sum[side][names[si.getComponent(i, k)]] ?? 0) + sw.getComponent(i, k);
    }
    return sum;
  };

  it("skins the character's left half (+x) to the left thigh and panel, the right to the right", () => {
    const { left, right } = sideWeights(false);
    expect(left.thighL).toBeGreaterThan(10 * (left.thighR ?? 0));
    expect(right.thighR).toBeGreaterThan(10 * (right.thighL ?? 0));
    expect(left.skirtL).toBeGreaterThan(0);
    expect(left.skirtR ?? 0).toBe(0);
  });

  it("keeps the old opposite-side weighting only when asked (`mirrored`, sheets not yet re-baked)", () => {
    const { left } = sideWeights(true);
    expect(left.thighR).toBeGreaterThan(10 * (left.thighL ?? 0));
  });

  it("will not let the front panel sway back through the leg that leads, nor the back one forward through the leg that trails", () => {
    const rig = createRig(1.96);
    skirtBones(rig);
    const [, hy] = J(rig, "hips");
    skirt(rig, mat(), { top: hy + 0.02, bottom: hy - 0.14, rTop: [0.1, 0.077], rBottom: [0.112, 0.094], panels: true });
    const stride = pose({ thighR: [-0.46, 0, 0], thighL: [0.34, 0, 0] });
    // the springs sway the front panel back and the back panel forward, against the legs
    applyPose(rig, stride, { skirtF: [0.2, 0, 0], skirtB: [-0.2, 0, 0], skirtL: [0, 0, 0], skirtR: [0, 0, 0] });
    expect(rig.bones.skirtF.rotation.x).toBeCloseTo(-0.46);
    expect(rig.bones.skirtB.rotation.x).toBeCloseTo(0.34);
    expect(rig.bones.skirtR.rotation.x).toBeCloseTo(-0.46);
    expect(rig.bones.skirtL.rotation.x).toBeCloseTo(0.34);
    // swaying further out than the legs push is the spring's own
    applyPose(rig, stride, { skirtF: [-0.7, 0, 0], skirtB: [0.6, 0, 0], skirtL: [0, 0, 0], skirtR: [0, 0, 0] });
    expect(rig.bones.skirtF.rotation.x).toBeCloseTo(-0.7);
    expect(rig.bones.skirtB.rotation.x).toBeCloseTo(0.6);
  });
});
