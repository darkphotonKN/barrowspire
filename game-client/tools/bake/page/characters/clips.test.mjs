import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  ANIMATIONS,
  ATTACKS,
  CLASS_ANIMATIONS,
  MERC_ANIMATIONS,
  RUN_ANIMATIONS,
  RUNNING_CLASS_ANIMATIONS,
  WALK_ATTACK_CYCLES,
  applyPose,
  backpedalCycle,
  clipsFor,
  idleCycle,
  layerPoses,
  parryClip,
  pose,
  runCycle,
  walkCycle,
  withWalkAttack,
} from "./clips.js";
import { createRig, gripAt, jointAt as J, mount } from "./rig.js";
import { boots, legs } from "./anatomy.js";
import { drawGrip, solveDraw } from "./draw.js";
import { GROUND_EPS, WORLD_PX_PER_UNIT, footing, measurePace } from "./pace.js";
import { BACKPEDAL_PACE, RUN_PACE } from "../../../../src/render/art/animationSelect";

const style = {
  attack: "slash",
  hold: pose({ upperArmR: [-0.2, 0, -0.2], foreArmR: [-0.7, 0, 0] }),
  guard: pose({ upperArmR: [-0.8, -0.5, 0], foreArmR: [-1.4, 0, 0], thighL: [-0.24, 0, 0.1] }, { z: -0.01 }),
};

/** A pose's arm angles with `extra`'s added (pose `add` for the bones the attack moves). */
const addArms = (b, extra) =>
  Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, (b[k] ?? [0, 0, 0]).map((x, j) => x + v[j])]));

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

describe("attacking on the move (walk_attack, FS-HF0WW, FS-3V7GC)", () => {
  const archer = {
    attack: "shot",
    hold: pose({ upperArmL: [0.02, 0, 0.04], foreArmL: [-0.3, 0, 0] }),
    walk: { arms: [0.7, 1], lean: 0.06 },
  };
  const quat = (r) => new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], "XYZ"));
  const chestInModel = (p) => quat(p.b.hips ?? [0, 0, 0]).multiply(quat(p.b.spine ?? [0, 0, 0]));

  it("is every class's (the mercenary's beside his parry) and no creature's: played once, exactly as long as the attack, never widening the frame", () => {
    expect(Object.keys(ANIMATIONS)).not.toContain("walk_attack");
    for (const specs of [CLASS_ANIMATIONS, MERC_ANIMATIONS]) {
      const { frames, fps, loop, boxed } = specs.walk_attack;
      expect(loop).toBe(false);
      expect(boxed).toBe(true);
      expect(frames).toBe(specs.attack.frames * 2);
      expect(frames / fps).toBeCloseTo(specs.attack.frames / specs.attack.fps, 9);
    }
    expect(Object.keys(CLASS_ANIMATIONS)).toEqual(["idle", "walk", "attack", "death", "walk_attack"]);
    expect(Object.keys(MERC_ANIMATIONS)).toEqual(["idle", "walk", "attack", "death", "parry", "walk_attack"]);
  });

  it("is added to any clip set by one rule, from that set's own attack", () => {
    const slow = withWalkAttack({ ...ANIMATIONS, attack: { frames: 5, fps: 10, loop: false } });
    expect(slow.walk_attack).toEqual({ frames: 10, fps: 20, loop: false, boxed: true, cycles: WALK_ATTACK_CYCLES });
    expect(slow.idle).toBe(ANIMATIONS.idle);
  });

  it("takes the legs and pelvis from the walk and everything else, fx included, from the attack", () => {
    const walk = walkCycle(archer)[1];
    const shot = ATTACKS.shot()[2];
    const p = layerPoses(shot, walk);
    for (const bone of ["thighL", "thighR", "shinL", "shinR", "footL", "footR", "hips"]) expect(p.b[bone], bone).toEqual(walk.b[bone]);
    for (const bone of ["chest", "neck", "upperArmL", "upperArmR", "foreArmR", "handL"]) expect(p.b[bone], bone).toEqual(shot.b[bone]);
    expect(p.fx).toEqual(shot.fx);
  });

  it("turns the spine against the walking pelvis, so the chest keeps the attack's aim in the model", () => {
    const shot = ATTACKS.shot()[3];
    for (const walk of walkCycle(archer)) {
      const p = layerPoses(shot, walk);
      expect(chestInModel(p).angleTo(chestInModel(shot))).toBeLessThan(1e-6);
    }
  });

  it("shows each of the attack's keys for two frames, as the attack itself does, the legs walking two cycles across it", () => {
    const frames = clipsFor(archer, CLASS_ANIMATIONS).walk_attack;
    const keys = ATTACKS.shot();
    expect(frames).toHaveLength(CLASS_ANIMATIONS.walk_attack.frames);
    for (let i = 0; i < frames.length; i++) {
      const key = keys[Math.floor(i / 2)];
      for (const bone of ["chest", "neck", "upperArmL", "upperArmR", "foreArmR", "handL"])
        if (key.b[bone]) expect(frames[i].b[bone], `${bone} @${i}`).toEqual(key.b[bone]);
      expect(frames[i].fx).toEqual(key.fx);
    }
    // two walk cycles over the clip: frame 7 is the walk's frame 0 again, a cycle in
    const walk = walkCycle(archer);
    frames[7].b.thighR.forEach((v, j) => expect(v).toBeCloseTo(walk[0].b.thighR[j], 9));
    expect(frames[0].b.thighR).toEqual(walk[0].b.thighR);
  });

  // the melee classes and the caster, simplified from cast.js's styles: their own attacks and
  // walk settings and the mercenary's free arm, a hold of one bone
  const knight = { attack: "slash", hold: pose({ upperArmR: [-0.12, 0, -0.04] }), walk: { arms: [0.2, 0.55], lean: 0.05 } };
  const mercenary = {
    attack: "slash",
    hold: pose({ upperArmR: [-0.18, 0, -0.2] }),
    walk: { stride: 1.05, arms: [0.75, 0.45], lean: 0.07 },
    attackExtra: pose({ upperArmL: [0.28, 0.85, 0.06], foreArmL: [0.62, 0, 0] }),
    guard: style.guard,
  };
  const wizard = { attack: "cast", hold: pose({ upperArmR: [-0.28, 0, -0.08] }), walk: { arms: [0.8, 0.4], lean: 0.05, stride: 0.95 } };

  it.each([
    ["knight", knight, CLASS_ANIMATIONS],
    ["mercenary", mercenary, MERC_ANIMATIONS],
    ["wizard", wizard, CLASS_ANIMATIONS],
  ])("lays the %s's own attack over the walk: its keys and fx from the waist up, the walk's legs and footing below", (_, cls, specs) => {
    const frames = clipsFor(cls, specs).walk_attack;
    const keys = ATTACKS[cls.attack]().map((p) => (cls.attackExtra ? { ...p, b: { ...p.b, ...addArms(p.b, cls.attackExtra.b) } } : p));
    const walk = walkCycle(cls);
    expect(frames).toHaveLength(specs.walk_attack.frames);
    for (let i = 0; i < frames.length; i++) {
      const key = keys[Math.floor(i / 2)];
      for (const bone of ["chest", "neck", "upperArmL", "upperArmR", "foreArmL", "foreArmR", "handR"])
        if (key.b[bone]) frames[i].b[bone].forEach((v, j) => expect(v, `${bone} @${i}`).toBeCloseTo(key.b[bone][j], 9));
      expect(frames[i].fx).toEqual(key.fx);
      // the attack's lunge forward (its body z) would slide the planted feet: the walk's footing stays
      expect(frames[i].body.z ?? 0).toBe(0);
    }
    expect(frames[0].b.thighL).toEqual(walk[0].b.thighL);
    expect(frames[0].b.shinR).toEqual(walk[0].b.shinR);
    // the attack's planted stance never reaches the legs
    expect(frames[4].b.thighL).not.toEqual(keys[2].b.thighL);
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

  it("keeps its own draw: no key moves the drawing elbow's pole, which only the delver's shot re-keys (FS-2325V § Change: The archer's draw stays on the aim line R7)", () => {
    for (const p of keys) expect(p.fx.pole).toBeUndefined();
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
    /** the drawing hand's distance from the arrow line */
    onLine: 0.005,
    /** at full draw, the drawing hand's distance from the anchor */
    toAnchor: 0.04,
    /** how far back past the anchor the hand may go (the loose opens off it, behind the jaw) */
    pastAnchor: 0.06,
    /** the drawing elbow's height against the drawing shoulder */
    elbowRise: [-0.1, 0.1],
    /** the drawing elbow no further behind the chest's centre than the back (its half depth) */
    elbowBack: -0.094,
  };

  /** The archer's rig with the bow frame on the left hand's grip, where cast.js hangs the longbow. */
  function archerBow() {
    const rig = createRig(1.96, { shoulderW: 1.0, torsoW: 0.98 });
    return { rig, bow: mount(rig, "handL", gripAt(rig, "L")) };
  }

  /** Poses `p` as the bake does (its hook solving the draw) and measures the draw (H, model space). */
  function measureDraw({ rig, bow }, p) {
    applyPose(rig, p);
    const line = solveDraw(rig, bow, p);
    rig.root.updateMatrixWorld(true);
    const H = rig.H;
    const at = (b) => new THREE.Vector3().setFromMatrixPosition(rig.bones[b].matrixWorld).divideScalar(H);
    const anchor = new THREE.Vector3(...ANCHOR).multiplyScalar(H).applyMatrix4(rig.bones.head.matrixWorld).divideScalar(H);
    const bowHand = new THREE.Vector3().setFromMatrixPosition(bow.matrixWorld).divideScalar(H);
    const hand = drawGrip(rig).applyMatrix4(rig.bones.handR.matrixWorld).divideScalar(H);
    const [elbow, shoulder, neck, chest] = ["foreArmR", "upperArmR", "neck", "chest"].map(at);
    const toChest = rig.bones.chest.getWorldQuaternion(new THREE.Quaternion()).invert();
    // the drawing forearm, elbow to hand: its furthest point toward the bow side (+x) of the
    // centre plane (the upright plane through the neck along the facing)
    const cross = Math.max(...[0, 0.25, 0.5, 0.75, 1].map((t) => elbow.clone().lerp(hand, t).x - neck.x));
    // the hand's distance from the arrow line (through the string's rest point, along `dir`)
    const fromNock = line ? hand.clone().sub(line.nock.clone().divideScalar(H)) : null;
    const onLine = line ? fromNock.addScaledVector(line.dir, -fromNock.dot(line.dir)).length() : 0;
    return {
      bowOff: bowHand.x - anchor.x,
      bowAhead: bowHand.z - chest.z,
      arrowAcross: line ? line.dir.x : 0,
      onLine,
      toAnchor: hand.distanceTo(anchor),
      pastAnchor: anchor.z - hand.z,
      cross,
      elbowRise: elbow.y - shoulder.y,
      elbowBack: elbow.clone().sub(chest).applyQuaternion(toChest).z,
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
    expect(m.onLine, `${label}: the drawing hand off the arrow line`).toBeLessThanOrEqual(BAND.onLine);
    expect(m.pastAnchor, `${label}: the drawing hand past the anchor`).toBeLessThanOrEqual(BAND.pastAnchor);
    expect(m.elbowRise, `${label}: the elbow below the shoulder band`).toBeGreaterThanOrEqual(BAND.elbowRise[0]);
    expect(m.elbowRise, `${label}: the elbow above the shoulder band`).toBeLessThanOrEqual(BAND.elbowRise[1]);
    expect(m.elbowBack, `${label}: the elbow behind the back`).toBeGreaterThanOrEqual(BAND.elbowBack);
    if (ik >= 1 && (p.fx.draw ?? 0) > 0.5) expect(m.toAnchor, `${label}: the full draw off the anchor`).toBeLessThanOrEqual(BAND.toAnchor);
  }

  // the archer's style as cast.js keys it, simplified to what the clips read
  const archer = {
    attack: "shot",
    hold: pose({ upperArmL: [0.02, 0, 0.04], foreArmL: [-0.3, 0, 0], handL: [-0.9, 0, 0], foreArmR: [-0.1, 0, 0] }),
    walk: { arms: [0.7, 1], lean: 0.06 },
    run: { arms: [0.5, 1], elbow: [0.25, 1] },
    backpedal: { arms: [0.5, 1], elbow: [0.3, 1] },
  };

  it("on every key of the shot: the bow hand forward on the aim line, the hand drawn straight back along it to the jaw, never across the body, the elbow at about shoulder height and not behind the back", () => {
    const at = archerBow();
    const keys = ATTACKS.shot();
    expect(keys.filter((p) => (p.fx.ik ?? 0) >= 1 && p.fx.draw > 0.5).length).toBeGreaterThanOrEqual(2);
    keys.forEach((p, i) => expectOnTheAimLine(measureDraw(at, p), p, `shot key ${i}`));
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

  it("holds on every frame of walk_attack, the shot's upper body over the walk", () => {
    const at = archerBow();
    clipsFor(archer, RUNNING_CLASS_ANIMATIONS).walk_attack.forEach((p, i) => expectOnTheAimLine(measureDraw(at, p), p, `walk_attack frame ${i}`));
  });
});

describe("the run and the backpedal (FS-JS7C8 §A, §B)", () => {
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
  // the archer's style as cast.js keys it, simplified to what the clips read
  const archer = {
    attack: "shot",
    hold: pose({ upperArmL: [0.02, 0, 0.04], foreArmL: [-0.3, 0, 0], handL: [-0.9, 0, 0], foreArmR: [-0.1, 0, 0] }),
    walk: { arms: [0.7, 1], lean: 0.06 },
  };
  const plain = { attack: "slash", hold: pose() };
  const rig = archerLegs();
  const run = runCycle(plain);
  const back = backpedalCycle(plain);
  const { run: RUN, backpedal: BACK } = RUN_ANIMATIONS;

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

  it("are two 8-frame loops, on a class sheet that opts in, with walk_attack's legs over one walk cycle", () => {
    for (const spec of [RUN, BACK]) expect([spec.frames, spec.loop]).toEqual([8, true]);
    expect(Object.keys(RUNNING_CLASS_ANIMATIONS)).toEqual(["idle", "walk", "attack", "death", "run", "backpedal", "walk_attack"]);
    const wa = RUNNING_CLASS_ANIMATIONS.walk_attack;
    expect(wa.cycles).toBe(1);
    expect(wa.frames / wa.fps).toBeCloseTo(RUNNING_CLASS_ANIMATIONS.attack.frames / RUNNING_CLASS_ANIMATIONS.attack.fps, 9);
    // the sheets that do not run keep today's two cycles
    expect(CLASS_ANIMATIONS.walk_attack.cycles).toBe(2);
    expect(MERC_ANIMATIONS.walk_attack.cycles).toBe(2);
    expect(Object.keys(CLASS_ANIMATIONS)).not.toContain("run");
  });

  it("walks walk_attack's legs over one cycle on a running sheet: half way through, the walk is half way round", () => {
    const frames = clipsFor(archer, RUNNING_CLASS_ANIMATIONS).walk_attack;
    const walk = walkCycle(archer);
    frames[7].b.thighR.forEach((v, j) => expect(v).toBeCloseTo(walk[4].b.thighR[j], 9));
    frames[0].b.thighR.forEach((v, j) => expect(v).toBeCloseTo(walk[0].b.thighR[j], 9));
  });

  it("are made by clipsFor for a sheet that asks for them, the hold carried as the walk carries it", () => {
    const clips = clipsFor(archer, RUNNING_CLASS_ANIMATIONS);
    expect(clips.run).toHaveLength(8);
    expect(clips.backpedal).toHaveLength(8);
    // the bow hand keeps its grip turn through the run
    for (const p of clips.run) expect(p.b.handL[0]).toBeCloseTo(-0.9 + (runCycle({ hold: pose() })[0].b.handL ?? [0])[0], 9);
    expect(clipsFor(archer).run).toBeUndefined();
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

  it("keeps a class's own arm on its own side all the way round: the bow arm's short swing and near-straight elbow in every frame", () => {
    const bow = { hold: pose(), run: { arms: [0.5, 1], elbow: [0.25, 1] }, backpedal: { arms: [0.5, 1], elbow: [0.3, 1] } };
    for (const clip of [runCycle(bow), backpedalCycle(bow)])
      for (const p of clip) {
        expect(Math.abs(p.b.upperArmL[0])).toBeLessThanOrEqual(0.26);
        expect(p.b.foreArmL[0]).toBeGreaterThan(-0.5);
        expect(p.b.foreArmR[0]).toBeLessThan(-1);
      }
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

  it("the run: a jog's pace, within 180–220 world px/s, and RUN_PACE is that measure", () => {
    const pace = measurePace(rig, run, RUN.fps);
    expect(pace).toBeGreaterThanOrEqual(180);
    expect(pace).toBeLessThanOrEqual(220);
    expect(Math.abs(RUN_PACE - pace)).toBeLessThan(1);
    // so at the server's 200 px/s the run plays within 0.9–1.1x
    expect(200 / RUN_PACE).toBeGreaterThanOrEqual(0.9);
    expect(200 / RUN_PACE).toBeLessThanOrEqual(1.1);
  });

  it("the backpedal: the feet step backward toe first under an upper body held to the facing", () => {
    // the body goes backward: the planted foot slides forward under it
    const pace = measurePace(rig, back, BACK.fps);
    expect(pace).toBeLessThan(0);
    expect(-pace).toBeGreaterThanOrEqual(150);
    expect(-pace).toBeLessThanOrEqual(220);
    expect(Math.abs(BACKPEDAL_PACE + pace)).toBeLessThan(1);
    // the chest stays turned to the facing, never to the movement
    for (const p of back) expect(Math.abs(chestYaw(p))).toBeLessThan(0.15);
    // a foot lands behind the body, its toes down first
    const landing = footing(rig, back, 0);
    const lead = landing.R.y < landing.L.y ? "R" : "L";
    expect(landing[`ankle${lead}`].z).toBeLessThan(landing.hips.z);
    expect(back[0].b[`thigh${lead}`][0] + back[0].b[`shin${lead}`][0] + back[0].b[`foot${lead}`][0]).toBeGreaterThan(0.1);
  });

  it("measures the walk near WALK_PACE's 74 world px/s, so the run and backpedal are measured as the walk was", () => {
    const pace = measurePace(rig, walkCycle(archer), ANIMATIONS.walk.fps);
    expect(pace).toBeGreaterThan(74 * 0.9);
    expect(pace).toBeLessThan(74 * 1.15);
    expect(WORLD_PX_PER_UNIT).toBe(40);
  });
});
