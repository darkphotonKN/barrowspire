import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { createRig, jointAt as J } from "./rig.js";
import { UNDER_CLEAR, belt, boots, legs, sash, skirt, skirtBones, torso } from "./anatomy.js";
import { applyPose, clipsFor, groundPose, pose, simulateSprings, walkCycle, ANIMATIONS, RUNNING_CLASS_ANIMATIONS } from "./clips.js";
import { KNIGHT_BUILD, KNIGHT_STYLE, MERCENARY_BUILD, MERCENARY_STYLE, WIZARD_BUILD, WIZARD_STYLE } from "./classStyles.js";
import {
  CLEARANCE_PX,
  KNOWN_CLIPPING,
  MIRRORED_LEGACY,
  UNGUARDED,
  clearanceError,
  clearanceLimit,
  legClearance,
  legsInGarments,
  mirroredGarment,
  outside,
  seenThroughCloth,
  throughCloth,
  wallAlong,
} from "./clearance.js";
import { K1 } from "../projection.js";

const mat = () => new THREE.MeshBasicMaterial();

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
    // above the top ring and below the hem it is not covered
    expect(outside(rings, centres, new THREE.Vector3(0.13, 1.1, 0))).toBeNull();
    expect(outside(rings, centres, new THREE.Vector3(0.13, 0.3, 0))).toBeNull();
  });

  it("measures a point on the outside of a bend in the rings, past one band's end and before the next one's start, on the ring at the bend", () => {
    // a garment bent 90° at its middle ring (y 0.5): the first band hangs down, the second runs out along +x
    const rings = [ring(1, 0.1), ring(0.5, 0.1), ring(0.5, 0.1).map((p) => new THREE.Vector3(0.5, 0.5 + p.x, p.z))];
    const centres = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0.5, 0.5, 0)];
    // below the first band's end and behind the second's start, out on the -x side of the bend
    expect(outside(rings, centres, new THREE.Vector3(-0.13, 0.45, 0))).toBeGreaterThan(0);
    expect(outside(rings, centres, new THREE.Vector3(-0.05, 0.45, 0))).toBeLessThan(0);
  });
});

/** The archer's tunic, as cast.js cuts it, on a figure of his proportions. */
const tunic = (hy) => ({ top: hy + 0.02, bottom: hy - 0.14, rTop: [0.1, 0.077], rBottom: [0.112, 0.094] });
/** The mage's gown. */
const gown = (hy) => ({ top: hy + 0.05, bottom: 0.016, rTop: [0.09, 0.072], rBottom: [0.155, 0.138] });

/**
 * A figure in a fitted short skirt (the archer's cut, on his proportions), or a robe to the ankle
 * (the mage's, on hers), posed through the walk with its springs as the bake runs them (`poses`),
 * and in its bind pose (`bind`). `under`: its thighs drawn in under the garment (legs({ under }));
 * `withBelt`: a belt over the waistband.
 */
function figure({ robe = false, mirrored = false, under = false, withBelt = false } = {}) {
  const rig = robe
    ? createRig(1.92, { shoulderW: 0.87, torsoW: 0.88, torsoD: 0.92, hipW: 1.04, armR: 0.86, limbR: 0.88, headR: 0.059 })
    : createRig(1.96, { shoulderW: 1.0, torsoW: 0.98 });
  skirtBones(rig, robe ? { stiffness: 38, drag: 0.28 } : { stiffness: 55 });
  const [, hy] = J(rig, "hips");
  const garment = robe ? gown(hy) : tunic(hy);
  torso(rig, mat());
  const legMeshes = legs(rig, mat(), under ? { under: garment } : {});
  if (robe) skirt(rig, mat(), { ...garment, legFollow: 0.5, panels: true, panelWeight: 0.35, segs: 32, mirrored });
  else skirt(rig, mat(), { ...garment, legFollow: 0.7, panels: true, panelWeight: 0.3, mirrored });
  if (withBelt) belt(rig, mat(), mat(), { r: [0.14, 0.1] });
  const frames = walkCycle(robe ? { walk: { arms: [0.8, 0.4], lean: 0.05, stride: 0.95 } } : { walk: { arms: [0.7, 1], lean: 0.06 } });
  const springs = simulateSprings(rig, frames, { ...ANIMATIONS.walk, speed: robe ? 0.9 : 1.05 });
  const poses = frames.map((p, i) => ({
    anim: "walk",
    i,
    apply: () => {
      applyPose(rig, p, springs[i]);
      groundPose(rig);
    },
  }));
  const bind = [{ anim: "idle", i: 0, apply: () => (applyPose(rig, pose()), groundPose(rig)) }];
  return { rig, poses, bind, garment, legs: legMeshes };
}

describe("the leg-clearance guard (characters/clearance.js)", () => {
  for (const robe of [false, true])
    it(`fails a ${robe ? "robe" : "short skirt"} skinned each half to the opposite thigh, and passes it skinned to its own over thighs drawn in under it`, () => {
      const before = figure({ robe, mirrored: true });
      const red = legClearance(before.rig, before.poses);
      expect(red.walk.px).toBeGreaterThan(clearanceLimit(1));
      expect(clearanceError("char_test", red)).toMatch(/char_test: a leg shows through the garment.*walk frame \d+ by/);

      // the archer is baked at 2x, the mage at 1x
      const scale = robe ? 1 : 2;
      const after = figure({ robe, under: true });
      const green = legClearance(after.rig, after.poses);
      expect(green.walk.px).toBeLessThan(clearanceLimit(scale));
      expect(clearanceError("char_test", green, { scale })).toBeNull();
    });

  it("counts a leg outside the garment at rest: the thighs wider than the tunic's top fail it in the bind pose, drawn in under it they pass", () => {
    // the dark wedges at both sides of the waist (2026-11-06): no pose carries them out, they are
    // out already, so a measure taken against the rest pose never saw them
    const wide = figure();
    const red = legClearance(wide.rig, wide.bind);
    expect(red.idle.px).toBeGreaterThan(1.4);
    expect(clearanceError("char_test", red)).toMatch(/char_test: a leg shows through the garment.*idle frame 0 by 1\.\d\d px/);
    expect(clearanceError("char_test", red, { scale: 2 })).toMatch(/more than 0\.5 px outside it \(1x px; 1 baked px at 2x\)/);

    const slim = figure({ under: true });
    expect(legClearance(slim.rig, slim.bind).idle.px).toBe(0);
    // and inside it by the margin: no leg vertex the tunic covers within 0.9 1x px of its wall
    const fit = legsInGarments(slim.rig);
    applyPose(slim.rig, pose());
    groundPose(slim.rig);
    const nearest = Math.max(...fit.measure().filter((o) => o !== null));
    expect(nearest * K1).toBeLessThan(-0.9);
  });

  it("measures the waistband, between the garment's top ring and the next, and counts a belt over it as cover", () => {
    // each leg vertex's height in the bind pose (H), where the garment's rings were laid
    const heights = (rig, legMeshes) => legMeshes.flatMap((m) => Array.from(m.geometry.attributes.position.array.filter((_, i) => i % 3 === 1), (y) => y / rig.H));
    const bare = figure();
    const { top, bottom } = bare.garment;
    // the tube's first two rings are a quarter of a control span apart: 0.3 × (top − bottom) / 4
    const band = (y) => y < top - 1e-4 && y > top - (0.3 * (top - bottom)) / 4 + 1e-4;
    applyPose(bare.rig, pose());
    groundPose(bare.rig);
    const ys = heights(bare.rig, bare.legs);
    const inBand = legsInGarments(bare.rig)
      .measure()
      .filter((_, i) => band(ys[i]));
    expect(inBand.length).toBeGreaterThan(0);
    expect(inBand.every((o) => o !== null)).toBe(true);
    expect(Math.max(...inBand) * K1).toBeGreaterThan(1);

    const belted = figure({ withBelt: true });
    applyPose(belted.rig, pose());
    groundPose(belted.rig);
    const fit = legsInGarments(belted.rig);
    expect(fit.covers.filter((m) => m.userData.cover)).toHaveLength(1);
    const covered = fit.measure().filter((_, i) => band(ys[i]));
    expect(Math.max(...covered)).toBeLessThan(0);
  });

  it("holds a sheet to one baked px: 1 px at 1x, half a px at 2x", () => {
    expect(CLEARANCE_PX).toBe(1);
    expect(clearanceLimit(1)).toBe(1);
    expect(clearanceLimit(2)).toBe(0.5);
    const clips = { idle: { px: 0.3, frame: 0 }, walk: { px: 0.7, frame: 3 } };
    expect(clearanceError("char_test", clips)).toBeNull();
    expect(clearanceError("char_test", clips, { scale: 2 })).toMatch(/char_test: a leg shows through the garment, more than 0\.5 px.*: walk frame 3 by 0\.70 px$/);
    expect(clearanceError("char_test", { walk: { px: 1.2, frame: 1 } })).toMatch(/more than 1 px outside it \(1x px; 1 baked px at 1x\)/);
  });

  it("has nothing to say about a figure with no garment over its legs", () => {
    const rig = createRig(1.96);
    legs(rig, mat());
    expect(legClearance(rig, [])).toBeNull();
    expect(clearanceError("creature_test", null)).toBeNull();
  });

  it("leaves a death alone: a collapse folds the thighs past any skinned skirt", () => {
    const { rig, poses } = figure({ mirrored: true });
    const named = poses.map((p) => ({ ...p, anim: UNGUARDED[0] }));
    expect(legClearance(rig, named)).toEqual({});
  });

  it("lets a listed sheet clip until it is fixed, then insists it leave the list", () => {
    const known = new Map([["folk_test", CLEARANCE_PX + 4]]);
    const clips = { walk: { px: CLEARANCE_PX + 3, frame: 2 } };
    expect(clearanceError("folk_test", clips, { known })).toBeNull();
    expect(clearanceError("folk_test", { walk: { px: 0.4, frame: 0 } }, { known })).toMatch(/no longer shows a leg.*take it off KNOWN_CLIPPING/);
    expect(clearanceError("char_test", clips, { known })).toMatch(/walk frame 2/);
    for (const cls of ["char_knight_base", "char_archer_base", "char_wizard_base", "char_mercenary_base"]) expect(KNOWN_CLIPPING.has(cls)).toBe(false);
  });

  it("fails a listed sheet that pokes past its ceiling: it may not get worse unseen", () => {
    const known = new Map([["folk_test", 5]]);
    expect(clearanceError("folk_test", { walk: { px: 4.9, frame: 1 } }, { known })).toBeNull();
    expect(clearanceError("folk_test", { idle: { px: 0.5, frame: 0 }, walk: { px: 5.2, frame: 3 } }, { known })).toMatch(
      /folk_test: a leg shows through the garment past its KNOWN_CLIPPING ceiling of 5 px.*walk frame 3 by 5\.20 px/,
    );
    for (const [name, ceiling] of KNOWN_CLIPPING) expect(ceiling, name).toBeGreaterThan(clearanceLimit(1));
  });

  it("insists a listed sheet whose legs no garment covers any more leave the list", () => {
    const known = new Map([["folk_test", 5]]);
    expect(clearanceError("folk_test", null, { known })).toMatch(/folk_test no longer shows a leg.*take it off KNOWN_CLIPPING/);
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

describe("thighs worn under a garment (anatomy.js legs({ under }))", () => {
  it("draws in only what would show outside the garment: nothing under the hem moves, nothing already inside, and the UVs and weights stay", () => {
    const plain = figure();
    const slim = figure({ under: true });
    const { H } = plain.rig;
    const { bottom } = plain.garment;
    let moved = 0;
    let most = 0;
    plain.legs.forEach((m, k) => {
      const a = m.geometry.attributes;
      const b = slim.legs[k].geometry.attributes;
      expect(b.uv.array).toEqual(a.uv.array);
      expect(b.skinWeight.array).toEqual(a.skinWeight.array);
      expect(b.skinIndex.array).toEqual(a.skinIndex.array);
      for (let i = 0; i < a.position.count; i++) {
        const was = [a.position.getX(i), a.position.getY(i), a.position.getZ(i)];
        const now = [b.position.getX(i), b.position.getY(i), b.position.getZ(i)];
        const d = Math.hypot(now[0] - was[0], now[1] - was[1], now[2] - was[2]);
        if (d === 0) continue;
        moved++;
        most = Math.max(most, d);
        // only where the garment covers it, and only in toward the garment's axis, at its height
        expect(was[1] / H).toBeGreaterThanOrEqual(bottom);
        expect(now[1]).toBe(was[1]);
        expect(Math.hypot(now[0], now[2])).toBeLessThan(Math.hypot(was[0], was[2]));
      }
    });
    expect(moved).toBeGreaterThan(0);
    // the thigh's root, under the belt: in to UNDER_CLEAR inside the wall (FS-3V7GC R10, about
    // 3.5 1x px on this figure), from no more than a couple of px outside it
    expect(most * K1).toBeGreaterThan(1);
    expect(most * K1).toBeLessThan(UNDER_CLEAR * H * K1 + 2);
  });
});

/**
 * The three classes' long garments as cast.js cuts them (the knight's hauberk to the knee, open
 * at the front; the wizard's robe to the ankle with its scapular panels and girdle; the
 * mercenary's coat skirts to mid-thigh, split at the front), each on its class's rig and style
 * (classStyles.js), posed through a sheet's clips with its springs as the bake page runs them
 * (page/main.js `characterPoses`).
 */
function dressed(cls, { cut = "now" } = {}) {
  const openFront = (gap) => [Math.PI / 2 + gap, Math.PI / 2 + Math.PI * 2 - gap];
  const [build, style] = { knight: [KNIGHT_BUILD, KNIGHT_STYLE], wizard: [WIZARD_BUILD, WIZARD_STYLE], mercenary: [MERCENARY_BUILD, MERCENARY_STYLE] }[cls];
  const rig = createRig(...build);
  rig.hooks = [];
  skirtBones(rig, cls === "wizard" ? { stiffness: 38, drag: 0.28 } : { stiffness: 55 });
  const [, hy] = J(rig, "hips");
  const [, ky] = J(rig, "shinL");
  if (cls === "knight") {
    const hauberk = { top: hy + 0.02, bottom: ky + 0.02, rTop: [0.104, 0.082], rBottom: [0.13, 0.112] };
    torso(rig, mat());
    legs(rig, mat(), { under: hauberk });
    boots(rig, mat(), { top: 0.1 });
    skirt(rig, mat(), { ...hauberk, legFollow: 0.75, panels: true, panelWeight: 0.3, arc: openFront(0.12), segs: 30 });
    belt(rig, mat(), mat(), { r: [0.106, 0.086], dy: 0.03 });
  } else if (cls === "wizard") {
    const gownCut = { top: hy - 0.005, bottom: 0.016, rTop: [0.108, 0.08], rBottom: [0.155, 0.138] };
    torso(rig, mat(), { waist: 0.76, neckW: 0.85 });
    legs(rig, mat(), { under: cut === "before" ? gownCut : { ...gownCut, torso: { waist: 0.76 } } });
    boots(rig, mat(), { top: 0.08 });
    const robe = { ...gownCut, legFollow: 0.5, panels: true, panelWeight: 0.35, segs: 32, trail: 0.02, ...(cut === "before" ? {} : { kneeCover: 0.05 }) };
    skirt(rig, mat(), robe);
    // the scapular's panels: cut on the gown's rig (cast.js), or skinned apart as before 2026-11-12
    const over = cut === "before" ? { panels: true, legFollow: 0.3 } : { over: robe };
    for (const arc of [[Math.PI / 2 - 0.5, Math.PI / 2 + 0.5], [-Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5]])
      skirt(rig, mat(), { top: hy - 0.005, bottom: 0.05, rTop: [0.116, 0.086], rBottom: [0.16, 0.146], arc, segs: 16, ...over });
    belt(rig, mat(), mat(), { r: [0.056, 0.064], dy: 0.07, pouch: true });
  } else {
    const coat = { top: hy + 0.02, bottom: hy - 0.2, rTop: [0.104, 0.084], rBottom: [0.13, 0.112] };
    torso(rig, mat());
    legs(rig, mat(), { under: coat });
    boots(rig, mat(), { top: 0.22 });
    skirt(rig, mat(), { ...coat, legFollow: 0.7, panels: true, panelWeight: 0.35, arc: openFront(0.16), segs: 30 });
    sash(rig, mat(), { side: "R", depth: 0.045 });
  }
  const clips = clipsFor(style, RUNNING_CLASS_ANIMATIONS);
  const posesOf = (anim) => {
    const spec = RUNNING_CLASS_ANIMATIONS[anim];
    const frames = clips[anim];
    const carried = spec.speed ?? (anim === "walk" || anim === "walk_attack" ? 1 : 0);
    const springs = simulateSprings(rig, frames, { ...spec, speed: carried * (style.speed ?? 1), calm: anim.endsWith("attack") ? 0.25 : 1 });
    return frames.map((p, i) => ({ anim, i, apply: () => (applyPose(rig, p, springs[i]), groundPose(rig)) }));
  };
  return { rig, posesOf };
}

describe("a leg is measured through the cloth where the cloth hangs (FS-HF0WW § Change: The guard measures a leg through the cloth)", () => {
  it.each(["knight", "wizard", "mercenary"])("passes the %s's garment through the fast run, the walk and both attacks on the move at 1.5x", (cls) => {
    const { rig, posesOf } = dressed(cls);
    for (const anim of ["run", "walk", "walk_attack", "backpedal_attack"]) {
      const clips = legClearance(rig, posesOf(anim));
      expect(clips[anim]?.px ?? 0, `${cls} ${anim} frame ${clips[anim]?.frame}`).toBeLessThanOrEqual(clearanceLimit(1.5));
    }
  });
});

/**
 * How far a panel worn over a garment (the mage's scapular over her gown) lies above it, least over
 * every pose (1x px, model space; below 0 the garment beneath comes out through the panel): each
 * panel vertex against the garment's surface where it lay over it in bind (the same height and
 * angle round it), along that surface's outward normal as posed.
 */
function overGarment(rig, poses) {
  const worn = [];
  rig.root.traverse((o) => o.isSkinnedMesh && o.userData.garment && worn.push(o));
  const [under, ...panels] = worn;
  const { rows, cols, centres } = under.geometry.userData.tube;
  const bind = under.geometry.attributes.position;
  const rowY = Array.from({ length: rows }, (_, r) => bind.getY(r * cols));
  // where each panel vertex lay on the garment beneath in bind: its row and column there, and the fractions between
  const maps = panels.map((m) => {
    const b = m.geometry.attributes.position;
    const { rows: pr, cols: pc } = m.geometry.userData.tube;
    return Array.from({ length: pr * pc }, (_, i) => {
      const y = b.getY(i);
      let r = 0;
      while (r + 2 < rows && rowY[r + 1] > y) r++;
      const fr = Math.min(1, Math.max(0, (rowY[r] - y) / (rowY[r] - rowY[r + 1])));
      const cz = centres[r][2] + (centres[r + 1][2] - centres[r][2]) * fr;
      let a = Math.atan2(b.getZ(i) - cz, -b.getX(i));
      if (a < 0) a += 2 * Math.PI;
      const fc = (a / (2 * Math.PI)) * (cols - 1);
      const c = Math.min(cols - 2, Math.floor(fc));
      return { i, r, fr, c, fc: fc - c };
    });
  });
  let least = Infinity;
  for (const p of poses) {
    p.apply();
    rig.root.updateMatrixWorld(true);
    const at = (r, c) => under.getVertexPosition(r * cols + c, new THREE.Vector3()).applyMatrix4(under.matrixWorld);
    const axis = new THREE.Vector3().setFromMatrixPosition(rig.bones.hips.matrixWorld);
    panels.forEach((m, k) => {
      for (const q of maps[k]) {
        const [a, b, c, d] = [at(q.r, q.c), at(q.r, q.c + 1), at(q.r + 1, q.c), at(q.r + 1, q.c + 1)];
        const top = a.clone().lerp(b, q.fc);
        const bottom = c.clone().lerp(d, q.fc);
        const s = top.clone().lerp(bottom, q.fr);
        const n = new THREE.Vector3().crossVectors(b.clone().sub(a).lerp(d.clone().sub(c), q.fr), bottom.clone().sub(top)).normalize();
        const out = s.clone().sub(axis).setY(0);
        if (n.dot(out) < 0) n.negate();
        least = Math.min(least, m.getVertexPosition(q.i, new THREE.Vector3()).applyMatrix4(m.matrixWorld).sub(s).dot(n));
      }
    });
  }
  return least * K1;
}

describe("no leg is seen through the cloth (FS-HF0WW § Change: The guard measures a leg through the cloth, 2026-11-12: the owner's \"法師跑步會輕微破圖 膝蓋處會凸出衣服 腰部似乎也有一點\")", () => {
  it.each(["knight", "wizard", "mercenary"])("the camera sees no hip, thigh or knee of the %s through the garment or the waist in any facing at rest, through the run, the walk and both attacks on the move", (cls) => {
    const { rig, posesOf } = dressed(cls);
    for (const anim of ["idle", "run", "walk", "walk_attack", "backpedal_attack"]) {
      const worst = seenThroughCloth(rig, posesOf(anim)).reduce((m, f) => (f.seen > m.seen ? f : m), { seen: 0 });
      expect(worst.seen, `${cls} ${anim} frame ${worst.i}`).toBe(0);
    }
  });

  it("the guard holds the robe as it was cut before: its knee out through the gown in the run, where the rings find no band", () => {
    // the gown and the scapular skinned apart: in the run the gown's ring centres kink at the knee
    // and the rings claim no band for the leading knee, so the guard read it as uncovered
    const { rig, posesOf } = dressed("wizard", { cut: "before" });
    const seen = seenThroughCloth(rig, posesOf("run"));
    expect(Math.max(...seen.map((f) => f.seen))).toBeGreaterThan(0);
    const clips = legClearance(rig, posesOf("run"));
    expect(clips.run.px).toBeGreaterThan(clearanceLimit(1.5));
    expect(clearanceError("char_wizard_base", clips, { scale: 1.5 })).toMatch(/run frame \d+ by/);
  });
});

describe("the mage's scapular stays over her gown (2026-11-12: the owner's \"法袍後面小腿處的裙擺綠色區塊跑動時似乎會被黑色吃掉\")", () => {
  it("the black gown never comes out through the teal scapular by a baked px, at rest, through the run, the walk and both attacks on the move", () => {
    const { rig, posesOf } = dressed("wizard");
    for (const anim of ["idle", "run", "walk", "walk_attack", "backpedal_attack"])
      expect(overGarment(rig, posesOf(anim)), anim).toBeGreaterThan(-clearanceLimit(1.5));
  });

  it("measures the scapular as it was cut before, skinned apart from the gown: the gown's trailing hem behind it at rest, and further through it in the run", () => {
    const { rig, posesOf } = dressed("wizard", { cut: "before" });
    expect(overGarment(rig, posesOf("idle"))).toBeLessThan(-clearanceLimit(1.5));
    expect(overGarment(rig, posesOf("run"))).toBeLessThan(overGarment(rig, posesOf("idle")));
  });
});
