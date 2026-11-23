import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  ANIMATIONS,
  ATTACKS,
  MERC_ANIMATIONS,
  RUN_ANIMATIONS,
  applyPose,
  clipsFor,
  idleCycle,
  layerPoses,
  parryClip,
  pose,
  runCycle,
  walkCycle,
} from "./clips.js";
import { createRig, gripAt, jointAt as J, mount } from "./rig.js";
import { boots, legs } from "./anatomy.js";
import { BOW_BRACE, BOW_GRIP, drawGrip, solveDraw } from "./draw.js";
import { FACINGS, yawFor } from "../facing.js";
import { GROUND_EPS, WORLD_PX_PER_UNIT, footing, measurePace } from "./pace.js";
import { RUN_PACE, WALK_PACE } from "../../../../src/render/art/animationSelect";

const style = {
  attack: "slash",
  hold: pose({ upperArmR: [-0.2, 0, -0.2], foreArmR: [-0.7, 0, 0] }),
  guard: pose({ upperArmR: [-0.8, -0.5, 0], foreArmR: [-1.4, 0, 0], thighL: [-0.24, 0, 0.1] }, { z: -0.01 }),
};

describe("the Mercenary's parry clip (FS-MAMHR §G.35)", () => {
  it("is his alone, played once and held, and raised inside the server's 0.25 s window", () => {
    expect(Object.keys(ANIMATIONS)).not.toContain("parry");
    const { frames, fps, loop } = MERC_ANIMATIONS.parry;
    expect(loop).toBe(false);
    expect(((frames - 1) / fps) * 1000).toBeLessThan(250);
  });

  it("raises from the carry toward the guard and ends on the guard itself", () => {
    const frames = parryClip(style, MERC_ANIMATIONS.parry.frames);
    const from = idleCycle(style, 1)[0];
    const arm = (p) => p.b.upperArmR[0];
    expect(frames).toHaveLength(MERC_ANIMATIONS.parry.frames);
    expect(arm(frames[0])).toBeLessThan(arm(from));
    for (let i = 1; i < frames.length; i++) expect(arm(frames[i])).toBeLessThanOrEqual(arm(frames[i - 1]));
    expect(frames.at(-1).b.upperArmR).toEqual([-0.8, -0.5, 0]);
    expect(frames.at(-1).b.thighL).toEqual([-0.24, 0, 0.1]);
    expect(frames.at(-1).body.z).toBeCloseTo(-0.01);
  });

  it("is made by clipsFor for a sheet that asks for it, and by no other", () => {
    expect(clipsFor(style, MERC_ANIMATIONS).parry).toHaveLength(MERC_ANIMATIONS.parry.frames);
    expect(clipsFor(style).parry).toBeUndefined();
  });
});

describe("no clip set carries an attack on the move (FS-JS7C8 § Change: The knight's sprint, and the attack-on-the-move clips retired R155)", () => {
  it("leaves the four, the mercenary's parry and the run as the clip sets' only clips", () => {
    expect(Object.keys(ANIMATIONS)).toEqual(["idle", "walk", "attack", "death"]);
    expect(Object.keys(MERC_ANIMATIONS)).toEqual(["idle", "walk", "attack", "death", "parry"]);
    expect(Object.keys(RUN_ANIMATIONS)).toEqual(["run"]);
  });
});

describe("one pose's upper body over another's legs (layerPoses: the off-hand attack, FS-1J1CB R28)", () => {
  const archer = {
    attack: "shot",
    hold: pose({ upperArmL: [0.02, 0, 0.04], foreArmL: [-0.3, 0, 0] }),
    walk: { arms: [0.7, 1], lean: 0.06 },
  };
  const quat = (r) => new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], "XYZ"));
  const chestInModel = (p) => quat(p.b.hips ?? [0, 0, 0]).multiply(quat(p.b.spine ?? [0, 0, 0]));

  it("takes the legs and pelvis from the lower pose and everything else, fx included, from the upper", () => {
    const walk = walkCycle(archer)[1];
    const shot = ATTACKS.shot()[2];
    const p = layerPoses(shot, walk);
    for (const bone of ["thighL", "thighR", "shinL", "shinR", "footL", "footR", "hips"]) expect(p.b[bone], bone).toEqual(walk.b[bone]);
    for (const bone of ["chest", "neck", "upperArmL", "upperArmR", "foreArmR", "handL"]) expect(p.b[bone], bone).toEqual(shot.b[bone]);
    expect(p.fx).toEqual(shot.fx);
  });

  it("turns the spine against the lower pose's pelvis, so the chest keeps the upper pose's aim in the model", () => {
    const shot = ATTACKS.shot()[3];
    for (const walk of walkCycle(archer)) {
      const p = layerPoses(shot, walk);
      expect(chestInModel(p).angleTo(chestInModel(shot))).toBeLessThan(1e-6);
    }
  });
});

describe("the Bone Archer's shot (FS-B4SG9 §E R26)", () => {
  const keys = ATTACKS.boneShot();
  const drawn = (p) => (p.fx.draw ?? 0) > 0.5;
  const arrow = (p) => (p.fx.arrow ?? 0) > 0.5;

  it("is one key per frame of the standard attack, which lasts the 0.6 s wind-up within a frame", () => {
    const { frames, fps } = ANIMATIONS.attack;
    expect(keys).toHaveLength(frames);
    expect(Math.abs(frames / fps - 0.6)).toBeLessThanOrEqual(1 / fps);
  });

  it("raises the bow with nothing nocked, then nocks before it draws", () => {
    expect(arrow(keys[0])).toBe(false);
    expect(drawn(keys[0])).toBe(false);
    const nocked = keys.findIndex(arrow);
    const pulled = keys.findIndex(drawn);
    expect(nocked).toBeGreaterThan(0);
    expect(pulled).toBeGreaterThanOrEqual(nocked);
  });

  it("pulls the string to the hand with the arrow showing, further each frame, to the full draw", () => {
    const pull = keys.filter(drawn);
    expect(pull.length).toBeGreaterThanOrEqual(3);
    for (const p of pull) expect(arrow(p)).toBe(true);
    for (let i = 1; i < pull.length; i++) expect(pull[i].fx.ik).toBeGreaterThanOrEqual(pull[i - 1].fx.ik);
    expect(pull.at(-1).fx.ik).toBeGreaterThanOrEqual(1);
  });

  it("looses on its last frame: the full draw is held until then, and the arrow is gone after", () => {
    const last = keys.length - 1;
    expect(drawn(keys[last - 1])).toBe(true);
    expect(arrow(keys[last - 1])).toBe(true);
    expect(drawn(keys[last])).toBe(false);
    expect(arrow(keys[last])).toBe(false);
  });

  it("draws as the delver does (FS-2325V § Change: The archer's draw stays on the aim line R7, owner 2026-11-12: \"拉弓姿勢可以用在怪物身上\"): the delver's aim stance from the waist up, its drawing elbow's pole on every key that draws, its loose", () => {
    const delver = ATTACKS.shot();
    const yaw = (p) => ["hips", "spine", "chest"].reduce((s, b) => s + (p.b[b] ?? [0, 0, 0])[1], 0);
    for (const [i, p] of keys.entries()) {
      // the chest as far side-on as the delver's, the head turned back to the facing as far
      expect(yaw(p), `key ${i}: the chest's turn`).toBeCloseTo(yaw(delver[0]), 9);
      expect(p.b.neck[1], `key ${i}: the neck's turn`).toBeCloseTo(delver[0].b.neck[1], 9);
      if ((p.fx.ik ?? 0) > 0) expect(p.fx.pole, `key ${i}`).toEqual(delver.find((q) => q.fx.pole).fx.pole);
    }
    const loose = (clip) => clip.find((p) => (p.fx.ik ?? 0) > 0 && !((p.fx.draw ?? 0) > 0.5) && !((p.fx.arrow ?? 0) > 0.5)).fx.ik;
    expect(loose(keys)).toBe(loose(delver));
  });

  it("keeps its own crouch and jaw: the knees bent, the hunch partly straightened and the jaw dropping as it draws", () => {
    for (const [i, p] of keys.entries()) {
      for (const s of ["L", "R"]) expect(p.b[`shin${s}`][0], `key ${i}: shin${s}`).toBeGreaterThanOrEqual(0.4);
      expect(p.b.hunch, `key ${i}`).toEqual([-0.2, 0, 0]);
    }
    for (let i = 1; i < keys.length; i++) expect(keys[i].fx.jaw).toBeGreaterThan(keys[i - 1].fx.jaw);
  });

  it("is made by clipsFor for a style that asks for it", () => {
    const frames = clipsFor({ attack: "boneShot", hold: pose({}) }).attack;
    expect(frames).toHaveLength(ANIMATIONS.attack.frames);
    expect(frames.map((p) => p.fx)).toEqual(keys.map((p) => p.fx));
  });
});

describe("the archer's draw stays on the aim line (FS-2325V § Change: The archer's draw stays on the aim line)", () => {
  /**
   * Where the drawing hand anchors, in the head bone's frame (H): by the jaw on the drawing side
   * (the right, -x), a fist's width out from the cheek. The aim line runs from it along the
   * facing (+z); the aim plane is the upright plane through it along the facing.
   */
  const ANCHOR = [-0.06, 0.005, 0.02];
  /**
   * Bands, in rig heights, model space (the model faces +z, its left is +x). Starting values, set
   * from the measure of 2026-11-12 (I-2325V-8), where the delver's shot read: the bow hand 0.13
   * to the left of the aim plane (0.18 as the bow came up); the full draw's hand 0.155 from the
   * anchor; the drawing hand and forearm up to 0.08 across the centre plane onto the bow side;
   * the elbow 0.08 on the bow side and 0.146 behind the chest, past its back (0.094 deep); the
   * loose's hand 0.106 past the anchor, behind the head.
   */
  const BAND = {
    /** the bow hand off the aim plane, either way */
    bowOff: 0.03,
    /** the bow hand at least this far ahead of the chest, along the facing */
    bowAhead: 0.25,
    /** the arrow line's sideways lean off the facing (|x| of its unit direction) */
    arrowAcross: 0.05,
    /**
     * the drawing hand's distance from the arrow line, past the rig's own grip offset: the hook's
     * two-bone solve lands the hand's axis on the line, and the grip sits off that axis (rig.js
     * `gripAt`: 0.008 on the delver, so 0.01 in all; 0.018 on the Bone Archer's skeleton, whose
     * arm chain hangs 0.01 behind the model's centre)
     */
    onLine: 0.002,
    /** at full draw, the drawing hand's distance from the anchor */
    toAnchor: 0.04,
    /** how far back past the anchor the hand may go (the loose opens off it, behind the jaw) */
    pastAnchor: 0.06,
    /** the drawing elbow's height against the drawing shoulder */
    elbowRise: [-0.1, 0.1],
    /** the drawing elbow no further behind the chest's centre than the back: its half depth, 0.094 × the rig's `torsoD` */
    elbowBack: 0.094,
  };

  /** The archer's rig with the bow frame on the left hand's grip, where cast.js hangs the longbow. */
  function archerBow() {
    const rig = createRig(1.96, { shoulderW: 1.0, torsoW: 0.98 });
    return { rig, bow: mount(rig, "handL", gripAt(rig, "L")) };
  }

  /**
   * The Bone Archer's rig as cast.js `skeleton` builds it (the ghoul's: its proportions, its
   * hunch and jaw bones, the hunched rest), the bow frame on the left hand's grip.
   */
  function boneArcherBow() {
    const rig = createRig(1.9, { hunch: 1, jaw: true, torsoW: 0.78, torsoD: 0.82, shoulderW: 0.94, hipW: 0.86, headR: 0.058, limbR: 0.6 });
    Object.assign(rig.rest, { hunch: [0.42, 0, 0], neck: [-0.34, 0, 0], head: [-0.12, 0, 0], jaw: [0.05, 0, 0] });
    return { rig, bow: mount(rig, "handL", gripAt(rig, "L")) };
  }

  /**
   * Poses `p` as the bake does (facing +z, its hook solving the draw), turns the model to `yaw`
   * as the bake turns it to a facing, and measures the draw there, in rig heights: along the
   * facing (`fwd`), toward the model's left, the bow side (`left`), and up.
   */
  function measureDraw({ rig, bow }, p, yaw = 0) {
    rig.root.rotation.y = 0;
    applyPose(rig, p);
    const drawn = solveDraw(rig, bow, p) !== null;
    rig.root.rotation.y = yaw;
    rig.root.updateMatrixWorld(true);
    const H = rig.H;
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const left = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const at = (b) => new THREE.Vector3().setFromMatrixPosition(rig.bones[b].matrixWorld).divideScalar(H);
    const inFrame = (v, frame) => new THREE.Vector3(...v).multiplyScalar(H).applyMatrix4(frame.matrixWorld).divideScalar(H);
    const anchor = inFrame(ANCHOR, rig.bones.head);
    const bowHand = new THREE.Vector3().setFromMatrixPosition(bow.matrixWorld).divideScalar(H);
    const hand = drawGrip(rig).applyMatrix4(rig.bones.handR.matrixWorld).divideScalar(H);
    const [elbow, shoulder, neck, chest] = ["foreArmR", "upperArmR", "neck", "chest"].map(at);
    const toChest = rig.bones.chest.getWorldQuaternion(new THREE.Quaternion()).invert();
    // the arrow line, from the bow's own frame as the hook takes it: the string's rest point
    // toward the grip
    const nock = inFrame([0, BOW_BRACE, 0], bow);
    const dir = inFrame([0, -BOW_GRIP, 0], bow).sub(nock).normalize();
    // the drawing forearm, elbow to hand: its furthest point toward the bow side of the centre
    // plane (the upright plane through the neck along the facing)
    const cross = Math.max(...[0, 0.25, 0.5, 0.75, 1].map((t) => elbow.clone().lerp(hand, t).sub(neck).dot(left)));
    // the hand's distance from the arrow line
    const fromNock = hand.clone().sub(nock);
    const g = drawGrip(rig);
    return {
      bowOff: bowHand.clone().sub(anchor).dot(left),
      bowAhead: bowHand.clone().sub(chest).dot(fwd),
      arrowAcross: drawn ? dir.dot(left) : 0,
      onLine: drawn ? fromNock.addScaledVector(dir, -fromNock.dot(dir)).length() : 0,
      gripOff: Math.hypot(g.x, g.z) / H,
      toAnchor: hand.distanceTo(anchor),
      pastAnchor: anchor.clone().sub(hand).dot(fwd),
      cross,
      elbowRise: elbow.y - shoulder.y,
      elbowBack: elbow.clone().sub(chest).applyQuaternion(toChest).z,
      back: BAND.elbowBack * rig.p.torsoD,
    };
  }

  /** Every band a frame of the shot's upper body must hold, by what the frame draws. */
  function expectOnTheAimLine(m, p, label) {
    const ik = p.fx.ik ?? 0;
    expect(Math.abs(m.bowOff), `${label}: the bow hand off the aim plane`).toBeLessThanOrEqual(BAND.bowOff);
    expect(m.bowAhead, `${label}: the bow hand ahead of the chest`).toBeGreaterThanOrEqual(BAND.bowAhead);
    expect(m.cross, `${label}: the drawing hand or forearm across the centre plane`).toBeLessThanOrEqual(0);
    if (ik <= 0) return;
    expect(Math.abs(m.arrowAcross), `${label}: the arrow across the facing`).toBeLessThanOrEqual(BAND.arrowAcross);
    expect(m.onLine, `${label}: the drawing hand off the arrow line`).toBeLessThanOrEqual(m.gripOff + BAND.onLine);
    expect(m.pastAnchor, `${label}: the drawing hand past the anchor`).toBeLessThanOrEqual(BAND.pastAnchor);
    expect(m.elbowRise, `${label}: the elbow below the shoulder band`).toBeGreaterThanOrEqual(BAND.elbowRise[0]);
    expect(m.elbowRise, `${label}: the elbow above the shoulder band`).toBeLessThanOrEqual(BAND.elbowRise[1]);
    expect(m.elbowBack, `${label}: the elbow behind the back`).toBeGreaterThanOrEqual(-m.back);
    if (ik >= 1 && (p.fx.draw ?? 0) > 0.5) expect(m.toAnchor, `${label}: the full draw off the anchor`).toBeLessThanOrEqual(BAND.toAnchor);
  }

  /** The bands on `p`, the model turned to each of the 8 baked facings (one pose is baked to all 8). */
  function expectOnTheAimLineInEveryFacing(at, p, label) {
    for (const f of FACINGS) expectOnTheAimLine(measureDraw(at, p, yawFor(f)), p, `${label}, facing ${f}`);
  }

  // the archer's style as cast.js keys it, simplified to what the clips read
  const archer = {
    attack: "shot",
    hold: pose({ upperArmL: [0.02, 0, 0.04], foreArmL: [-0.3, 0, 0], handL: [-0.9, 0, 0], foreArmR: [-0.1, 0, 0] }),
    walk: { arms: [0.7, 1], lean: 0.06 },
    run: { arms: [0.5, 1], elbow: [0.25, 1] },
  };

  it("on every key of the shot: the bow hand forward on the aim line, the hand drawn straight back along it to the jaw, never across the body, the elbow at about shoulder height and not behind the back", () => {
    const at = archerBow();
    const keys = ATTACKS.shot();
    expect(keys.filter((p) => (p.fx.ik ?? 0) >= 1 && p.fx.draw > 0.5).length).toBeGreaterThanOrEqual(2);
    keys.forEach((p, i) => expectOnTheAimLineInEveryFacing(at, p, `shot key ${i}`));
  });

  it("measures the same draw in every facing: the pose is turned whole, as the bake turns it", () => {
    const at = archerBow();
    const p = ATTACKS.shot()[2];
    const front = measureDraw(at, p);
    for (const f of FACINGS) {
      const m = measureDraw(at, p, yawFor(f));
      for (const [k, v] of Object.entries(front)) expect(m[k], `${k}, facing ${f}`).toBeCloseTo(v, 9);
    }
  });

  // the Bone Archer's style as cast.js keys it, simplified to what its attack reads
  const boneArcher = { attack: "boneShot", hold: pose({ upperArmL: [-0.25, 0, 0.45], foreArmL: [-0.35, 0, 0], handL: [-0.85, 0.4, 0] }) };

  it("on every frame of the Bone Archer's shot, on its own rig, in every facing (owner 2026-11-12: \"拉弓姿勢可以用在怪物身上\"): the bow hand forward on the aim line, the hand drawn straight back along it to the jaw, never across the body, the elbow at about shoulder height and not behind its back", () => {
    const at = boneArcherBow();
    const frames = clipsFor(boneArcher).attack;
    expect(frames).toHaveLength(ANIMATIONS.attack.frames);
    expect(frames.filter((p) => (p.fx.ik ?? 0) >= 1 && p.fx.draw > 0.5).length).toBeGreaterThanOrEqual(2);
    frames.forEach((p, i) => expectOnTheAimLineInEveryFacing(at, p, `boneShot frame ${i}`));
  });

  it("at the Bone Archer's draw its bow arm points along the facing: the arrow runs straight ahead, the bow held out ahead of the anchor", () => {
    const at = boneArcherBow();
    for (const [i, p] of ATTACKS.boneShot().entries()) {
      if ((p.fx.ik ?? 0) < 1 || !(p.fx.draw > 0.5)) continue;
      const m = measureDraw(at, p);
      expect(Math.abs(m.arrowAcross), `key ${i}`).toBeLessThanOrEqual(BAND.arrowAcross);
      expect(m.bowAhead, `key ${i}`).toBeGreaterThanOrEqual(0.4);
    }
  });

  it("at the draw the bow arm points along the facing: the arrow runs straight ahead, the string drawn and the arrow nocked", () => {
    const at = archerBow();
    for (const [i, p] of ATTACKS.shot().entries()) {
      if ((p.fx.ik ?? 0) < 1 || !(p.fx.draw > 0.5)) continue;
      expect(p.fx.arrow, `key ${i}`).toBe(1);
      const m = measureDraw(at, p);
      expect(Math.abs(m.arrowAcross), `key ${i}`).toBeLessThanOrEqual(BAND.arrowAcross);
      // the bow hand ahead of the anchor by the drawn length: the bow arm extended toward the aim
      expect(m.bowAhead, `key ${i}`).toBeGreaterThanOrEqual(0.4);
    }
  });
});

describe("the run (FS-JS7C8 §A)", () => {
  /**
   * The archer's lower body, as cast.js builds it: the rig at its height and build, its legs
   * under the tunic and its boots, which carry the soles every clip is grounded on.
   */
  function archerLegs() {
    const rig = createRig(1.96, { shoulderW: 1.0, torsoW: 0.98 });
    const [, hy] = J(rig, "hips");
    const tunic = { top: hy + 0.02, bottom: hy - 0.14, rTop: [0.1, 0.077], rBottom: [0.112, 0.094] };
    legs(rig, new THREE.MeshBasicMaterial(), { under: tunic });
    boots(rig, new THREE.MeshBasicMaterial(), { top: 0.21 });
    return rig;
  }
  // the archer's style as cast.js keys it, simplified to what the walk and the attacks read (her
  // sprint is her own run, on her real style: classMotion.test.mjs "the archer's sprint")
  const archer = {
    attack: "shot",
    hold: pose({ upperArmL: [0.02, 0, 0.04], foreArmL: [-0.3, 0, 0], handL: [-0.9, 0, 0], foreArmR: [-0.1, 0, 0] }),
    walk: { arms: [0.7, 1], lean: 0.06 },
  };
  const plain = { attack: "slash", hold: pose() };
  const rig = archerLegs();
  const run = runCycle(plain);
  const { run: RUN } = RUN_ANIMATIONS;
  /** The walk's clip, measured beside the run. */
  const WALK = ANIMATIONS.walk;

  /** Pearson correlation of two equal-length series. */
  const corr = (a, b) => {
    const m = (x) => x.reduce((s, v) => s + v, 0) / x.length;
    const [ma, mb] = [m(a), m(b)];
    const cov = a.reduce((s, v, i) => s + (v - ma) * (b[i] - mb), 0);
    const sd = (x, mx) => Math.sqrt(x.reduce((s, v) => s + (v - mx) ** 2, 0));
    return cov / (sd(a, ma) * sd(b, mb));
  };
  const rx = (frames, bone) => frames.map((p) => (p.b[bone] ?? [0, 0, 0])[0]);
  /** A pose's yaw of the chest in the model: the pelvis, spine and chest turns summed. */
  const chestYaw = (p) => ["hips", "spine", "chest"].reduce((s, b) => s + (p.b[b] ?? [0, 0, 0])[1], 0);
  it("a class sheet's run is an 8-frame loop (R1)", () => {
    expect([RUN.frames, RUN.loop]).toEqual([8, true]);
  });

  it("is made by clipsFor for a sheet that asks for it, with no standalone backpedal, the hold carried as the walk carries it (R8, R45)", () => {
    const clips = clipsFor(archer, { ...ANIMATIONS, ...RUN_ANIMATIONS });
    expect(clips.run).toHaveLength(8);
    expect(clips.backpedal).toBeUndefined();
    // the bow hand keeps its grip turn through the run
    for (const p of clips.run) expect(p.b.handL[0]).toBeCloseTo(-0.9 + (runCycle({ hold: pose() })[0].b.handL ?? [0])[0], 9);
    expect(clipsFor(archer).run).toBeUndefined();
  });

  it("carries a class's run.hold in the run in place of its hold: the walk's carry stays the walk's", () => {
    const hold = pose({ upperArmR: [-0.28, 0, -0.08], foreArmR: [-1.15, 0, 0] });
    const carry = pose({ upperArmR: [0, 0, -0.06], handR: [-0.6, 0, 0] });
    const bare = runCycle({ hold: pose() });
    runCycle({ hold, run: { hold: carry } }).forEach((p, i) => {
      for (const [bone, v] of Object.entries(carry.b)) v.forEach((x, j) => expect(p.b[bone][j], `${bone} @${i}`).toBeCloseTo((bare[i].b[bone]?.[j] ?? 0) + x, 9));
      expect(p.b.foreArmR, `foreArmR @${i}`).toEqual(bare[i].b.foreArmR);
    });
    // the walk keeps the hold
    expect(walkCycle({ hold, run: { hold: carry } })[0].b.foreArmR[0]).toBeLessThan(-1.15);
  });

  it("the run: each step has a flight frame, both soles off the ground", () => {
    for (const half of [[0, 1, 2, 3], [4, 5, 6, 7]]) {
      const flights = half.filter((f) => {
        const { L, R } = footing(rig, run, f);
        return Math.min(L.y, R.y) > 0.02;
      });
      expect(flights.length, `step ${half}`).toBeGreaterThanOrEqual(1);
    }
    // and a foot is planted in every other key
    const planted = [0, 1, 2, 3, 4, 5, 6, 7].filter((f) => {
      const { L, R } = footing(rig, run, f);
      return Math.min(L.y, R.y) < GROUND_EPS;
    });
    expect(planted.length).toBeGreaterThanOrEqual(4);
  });

  it("the run: the arms swing against the legs, the right arm forward with the left leg", () => {
    expect(corr(rx(run, "upperArmR"), rx(run, "thighR"))).toBeLessThan(-0.8);
    expect(corr(rx(run, "upperArmL"), rx(run, "thighL"))).toBeLessThan(-0.8);
    expect(corr(rx(run, "upperArmR"), rx(run, "thighL"))).toBeGreaterThan(0.8);
  });

  it("the run: the upper body turns against the hips with the stride", () => {
    const hips = run.map((p) => p.b.hips[1]);
    const upper = run.map((p) => p.b.spine[1] + p.b.chest[1]);
    expect(corr(hips, upper)).toBeLessThan(-0.8);
    // the shoulders turn with the arms: the right one forward (+y turns the right side, -x,
    // forward) as the right arm swings forward (-rx)
    expect(corr(run.map(chestYaw), rx(run, "upperArmR"))).toBeLessThan(-0.8);
  });

  it("the run: the pelvis rises and falls once per step, highest in the flight", () => {
    const heights = [0, 1, 2, 3, 4, 5, 6, 7].map((f) => footing(rig, run, f).hips.y);
    const peaks = heights.filter((h, i) => h > heights[(i + 7) % 8] && h >= heights[(i + 1) % 8]);
    const dips = heights.filter((h, i) => h < heights[(i + 7) % 8] && h <= heights[(i + 1) % 8]);
    expect([peaks.length, dips.length]).toEqual([2, 2]);
    // a jog's bounce: visible, never a hop (H = 1.96 world units)
    const bounce = Math.max(...heights) - Math.min(...heights);
    expect(bounce).toBeGreaterThan(0.02 * rig.H);
    expect(bounce).toBeLessThan(0.07 * rig.H);
  });

  it("the run: the head holds steady, its turn and roll within a small band and its height no bobbier than the pelvis", () => {
    const yaw = [];
    const roll = [];
    const head = [];
    const hips = [];
    for (let f = 0; f < 8; f += 0.25) {
      const at = footing(rig, run, f);
      const fwd = new THREE.Vector3(0, 0, 1).transformDirection(at.head);
      const up = new THREE.Vector3(0, 1, 0).transformDirection(at.head);
      yaw.push(Math.atan2(fwd.x, fwd.z));
      roll.push(Math.atan2(up.x, up.y));
      head.push(new THREE.Vector3().setFromMatrixPosition(at.head).y);
      hips.push(at.hips.y);
    }
    const range = (x) => Math.max(...x) - Math.min(...x);
    expect(range(yaw)).toBeLessThan(0.08);
    expect(range(roll)).toBeLessThan(0.06);
    expect(range(head)).toBeLessThanOrEqual(range(hips) * 1.1);
  });

  it("the run: its pace within 180–220 world px/s, and RUN_PACE is that measure (the fast run's upper body moves no foot)", () => {
    const pace = measurePace(rig, run, RUN.fps);
    expect(pace).toBeGreaterThanOrEqual(180);
    expect(pace).toBeLessThanOrEqual(220);
    expect(Math.abs(RUN_PACE - pace)).toBeLessThan(1);
    // so at the server's 200 px/s the run plays within 0.9–1.1x
    expect(200 / RUN_PACE).toBeGreaterThanOrEqual(0.9);
    expect(200 / RUN_PACE).toBeLessThanOrEqual(1.1);
  });

  describe("a fast run from the waist up (FS-JS7C8 R2, owner 2026-11-12: \"跑步時有點生硬 一般跑步應該會稍微前傾\", \"現在的跑步有點像在慢跑 希望可以有快跑的感覺\", \"但快跑沒有到疾跑\", \"目前的腳步速度可以 只是上半身有一些變化\")", () => {
    const at = (b) => new THREE.Vector3().setFromMatrixPosition(rig.bones[b].matrixWorld);
    const DEG = 180 / Math.PI;
    /** The pose at fractional frame `f`, grounded as the bake grounds it; then the rig's bones are read. */
    const posed = (frames, f) => footing(rig, frames, f);
    /** The hips-to-neck line's forward tilt from upright, in degrees (+ is leaning forward). */
    const trunkLean = () => {
      const [h, n] = [at("hips"), at("neck")];
      return Math.atan2(n.z - h.z, n.y - h.y) * DEG;
    };
    /** The elbow's bend, 0 for a straight arm, in degrees. */
    const elbowBend = (s) => {
      const [sh, el, hand] = [at(`upperArm${s}`), at(`foreArm${s}`), at(`hand${s}`)];
      return 180 - sh.sub(el).angleTo(hand.sub(el)) * DEG;
    };
    /** A line's turn about the vertical, from its left joint to its right, in degrees. */
    const lineYaw = (l, r) => {
      const [a, b] = [at(l), at(r)];
      return Math.atan2(b.z - a.z, a.x - b.x) * DEG;
    };
    /** The head's pitch, + looking down, in degrees. */
    const headPitch = () => {
      const fwd = new THREE.Vector3(0, 0, 1).transformDirection(rig.bones.head.matrixWorld);
      return Math.atan2(-fwd.y, fwd.z) * DEG;
    };
    const SAMPLES = Array.from({ length: 32 }, (_, k) => k / 4);
    const restPose = () => {
      applyPose(rig, pose());
      rig.root.updateMatrixWorld(true);
    };

    it("the trunk leans forward about 10° from the hips, held through the cycle", () => {
      restPose();
      const rest = trunkLean();
      const leans = SAMPLES.map((f) => (posed(run, f), trunkLean() - rest));
      const mean = leans.reduce((s, v) => s + v, 0) / leans.length;
      expect(mean).toBeGreaterThanOrEqual(9);
      expect(mean).toBeLessThanOrEqual(11);
      for (const [k, v] of leans.entries()) {
        expect(v, `sample ${k}`).toBeGreaterThanOrEqual(8);
        expect(v, `sample ${k}`).toBeLessThanOrEqual(12);
      }
    });

    it("the head comes back up over the lean: it looks ahead as at rest, not at the ground", () => {
      restPose();
      const rest = headPitch();
      for (const f of SAMPLES) {
        posed(run, f);
        expect(Math.abs(headPitch() - rest), `frame ${f}`).toBeLessThanOrEqual(3);
      }
    });

    it("the arms pump with the elbows bent about 90°, in every frame", () => {
      for (const f of [0, 1, 2, 3, 4, 5, 6, 7]) {
        posed(run, f);
        for (const s of ["L", "R"]) {
          expect(elbowBend(s), `${s} frame ${f}`).toBeGreaterThanOrEqual(80);
          expect(elbowBend(s), `${s} frame ${f}`).toBeLessThanOrEqual(100);
        }
      }
    });

    it("each hand drives forward to about chest height and back past the hip", () => {
      for (const s of ["L", "R"]) {
        const samples = SAMPLES.map((f) => {
          posed(run, f);
          return { hand: at(`hand${s}`), chest: at("chest"), shoulder: at(`upperArm${s}`), hips: at("hips") };
        });
        const front = samples.reduce((a, b) => (b.hand.z - b.hips.z > a.hand.z - a.hips.z ? b : a));
        const back = samples.reduce((a, b) => (b.hand.z - b.hips.z < a.hand.z - a.hips.z ? b : a));
        // chest height: above the chest bone, below the shoulder (not a sprinter's chin-high drive)
        expect(front.hand.y, `${s} front`).toBeGreaterThan(front.chest.y);
        expect(front.hand.y, `${s} front`).toBeLessThan(front.shoulder.y);
        expect((back.hips.z - back.hand.z) / rig.H, `${s} back`).toBeGreaterThanOrEqual(0.06);
      }
    });

    it("the shoulders counter-turn against the hips, more than the jog's and short of a sprint's", () => {
      const shoulders = [];
      const hips = [];
      for (const f of SAMPLES) {
        posed(run, f);
        shoulders.push(lineYaw("upperArmL", "upperArmR"));
        hips.push(lineYaw("thighL", "thighR"));
      }
      expect(corr(shoulders, hips)).toBeLessThan(-0.8);
      const turn = Math.max(...shoulders.map(Math.abs));
      expect(turn).toBeGreaterThanOrEqual(6.5);
      expect(turn).toBeLessThanOrEqual(10);
    });

    it("keeps slice 5's legs key for key: the pelvis, thighs, shins, feet and the flight's lift (\"目前的腳步速度可以\")", () => {
      // slice 5's RUN_STEP, right foot planted: contact, down, push, flight; mirrored for the left
      const STEP = {
        thighR: [-0.46, -0.13, 0.33, 0.32],
        shinR: [0.3, 0.65, 0.35, 0.9],
        footR: [0.01, -0.52, -0.08, -0.32],
        thighL: [0.22, -0.28, -0.52, -0.48],
        shinL: [1.35, 1.45, 1, 0.5],
        footL: [-0.87, -0.68, -0.28, -0.12],
        hipsZ: [-0.02, -0.05, -0.02, 0],
        lift: [0, 0, 0, 0.045],
      };
      const hipsY = (i) => 0.12 * Math.cos(((i + 0.5) / 8) * Math.PI * 2);
      run.forEach((p, i) => {
        const k = i % 4;
        const [near, far] = i < 4 ? ["R", "L"] : ["L", "R"];
        for (const part of ["thigh", "shin", "foot"]) {
          expect(p.b[`${part}${near}`], `${part}${near} @${i}`).toEqual([STEP[`${part}R`][k], 0, 0]);
          expect(p.b[`${part}${far}`], `${part}${far} @${i}`).toEqual([STEP[`${part}L`][k], 0, 0]);
        }
        [0, hipsY(i), (i < 4 ? 1 : -1) * STEP.hipsZ[k]].forEach((v, j) => expect(p.b.hips[j], `hips @${i}`).toBeCloseTo(v, 9));
        expect(p.body.y ?? 0, `lift @${i}`).toBeCloseTo(STEP.lift[k], 9);
        expect(Object.keys(p.body).filter((key) => key !== "y" && p.body[key] !== 0), `body @${i}`).toEqual([]);
      });
    });
  });

  it("measures the walk near WALK_PACE's 74 world px/s, so the run is measured as the walk was", () => {
    const pace = measurePace(rig, walkCycle(archer), WALK.fps);
    expect(pace).toBeGreaterThan(WALK_PACE * 0.9);
    expect(pace).toBeLessThan(WALK_PACE * 1.15);
    expect(WORLD_PX_PER_UNIT).toBe(40);
  });
});
