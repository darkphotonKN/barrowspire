import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  ANIMATIONS,
  ARCHER_ANIMATIONS,
  ATTACKS,
  MERC_ANIMATIONS,
  clipsFor,
  idleCycle,
  layerPoses,
  parryClip,
  pose,
  walkCycle,
} from "./clips.js";

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

describe("the Archer's attack on the move (walk_attack, spike/archer-2x)", () => {
  const archer = {
    attack: "shot",
    hold: pose({ upperArmL: [0.02, 0, 0.04], foreArmL: [-0.3, 0, 0] }),
    walk: { arms: [0.7, 1], lean: 0.06 },
  };
  const quat = (r) => new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], "XYZ"));
  const chestInModel = (p) => quat(p.b.hips ?? [0, 0, 0]).multiply(quat(p.b.spine ?? [0, 0, 0]));

  it("is the archer's alone, played once, lasts exactly as long as the attack, and never widens the frame", () => {
    expect(Object.keys(ANIMATIONS)).not.toContain("walk_attack");
    expect(Object.keys(MERC_ANIMATIONS)).not.toContain("walk_attack");
    const { frames, fps, loop, boxed } = ARCHER_ANIMATIONS.walk_attack;
    expect(loop).toBe(false);
    expect(boxed).toBe(true);
    expect(frames / fps).toBeCloseTo(ANIMATIONS.attack.frames / ANIMATIONS.attack.fps, 9);
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
    const frames = clipsFor(archer, ARCHER_ANIMATIONS).walk_attack;
    const keys = ATTACKS.shot();
    expect(frames).toHaveLength(ARCHER_ANIMATIONS.walk_attack.frames);
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
});
