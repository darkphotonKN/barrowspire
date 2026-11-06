import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  ANIMATIONS,
  ATTACKS,
  CLASS_ANIMATIONS,
  MERC_ANIMATIONS,
  clipsFor,
  idleCycle,
  layerPoses,
  parryClip,
  pose,
  walkCycle,
  withWalkAttack,
} from "./clips.js";

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
    expect(slow.walk_attack).toEqual({ frames: 10, fps: 20, loop: false, boxed: true });
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

  // the melee classes and the caster, as cast.js styles them (their attacks, the mercenary's free arm)
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
