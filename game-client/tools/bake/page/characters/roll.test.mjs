// Each class's roll (FS-7P736 R15): a `roll` clip baked from its own rig, one whole forward turn in the
// server's 0.4 s, in the class's own look (the warrior a heavy shoulder roll, the mage a robe-tumbling
// roll, the archer a light tuck, the mercenary a low sword-held roll), on every class sheet and look.
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { ROLL_ANIMATIONS, ROLL_CURL, ROLL_TURN, applyPose, clipsFor, groundPose, rollClip } from "./clips.js";
import { createRig } from "./rig.js";
import { boots, legs } from "./anatomy.js";
import {
  ARCHER_BUILD,
  ARCHER_SHEET,
  ARCHER_STYLE,
  BERSERKER_SHEET,
  BERSERKER_STYLE,
  KNIGHT_BUILD,
  KNIGHT_ROLL,
  KNIGHT_SHEET,
  KNIGHT_STYLE,
  MERCENARY_BUILD,
  MERCENARY_ROLL,
  MERCENARY_SHEET,
  MERCENARY_STYLE,
  WIZARD_BUILD,
  WIZARD_SHEET,
  WIZARD_STYLE,
  ARCHER_ROLL,
  WIZARD_ROLL,
  SPELLWARDEN_STYLE,
  PYROMANCER_STYLE,
} from "./classStyles.js";
import { ROLL_DURATION_MS } from "../../../../src/render/world/rollPrediction";

function rigOf(build) {
  const rig = createRig(...build);
  legs(rig, new THREE.MeshBasicMaterial());
  boots(rig, new THREE.MeshBasicMaterial(), { top: 0.1 });
  return rig;
}
const at = (rig, b) => new THREE.Vector3().setFromMatrixPosition(rig.bones[b].matrixWorld);
const posed = (rig, p) => (applyPose(rig, p), groundPose(rig));

const CLASSES = [
  { name: "knight", build: KNIGHT_BUILD, style: KNIGHT_STYLE, sheet: KNIGHT_SHEET, roll: KNIGHT_ROLL },
  { name: "Berserker", build: KNIGHT_BUILD, style: BERSERKER_STYLE, sheet: BERSERKER_SHEET, roll: KNIGHT_ROLL },
  { name: "wizard", build: WIZARD_BUILD, style: WIZARD_STYLE, sheet: WIZARD_SHEET, roll: WIZARD_ROLL },
  { name: "archer", build: ARCHER_BUILD, style: ARCHER_STYLE, sheet: ARCHER_SHEET, roll: ARCHER_ROLL },
  { name: "mercenary", build: MERCENARY_BUILD, style: MERCENARY_STYLE, sheet: MERCENARY_SHEET, roll: MERCENARY_ROLL },
];

describe("the roll's clip (FS-7P736 R15)", () => {
  it("plays once in the server's roll time: 8 frames at 20 fps, the client's ROLL_DURATION_MS", () => {
    const { roll } = ROLL_ANIMATIONS;
    expect([roll.frames, roll.fps, roll.loop]).toEqual([8, 20, false]);
    expect((roll.frames / roll.fps) * 1000).toBe(ROLL_DURATION_MS);
    expect(ROLL_TURN).toHaveLength(roll.frames);
    expect(ROLL_CURL).toHaveLength(roll.frames);
  });

  it.each(CLASSES)("is the last clip on the $name's sheet, after every clip the sheet had", ({ sheet }) => {
    expect(sheet.animations.roll).toBe(ROLL_ANIMATIONS.roll);
    const clips = Object.keys(sheet.animations).filter((a) => a !== "attack_offhand");
    expect(clips.at(-1)).toBe("roll");
  });
});

describe.each(CLASSES)("the $name's roll on its own rig (FS-7P736 R15)", ({ build, style, sheet, roll }) => {
  const rig = rigOf(build);
  const keys = clipsFor(style, sheet.animations).roll;

  it("is keyed from the class's own roll", () => {
    expect(style.roll).toBe(roll);
    expect(keys).toEqual(rollClip(style));
  });

  it("turns the body one whole forward turn about the hips, never turning back, from a push-off to coming up", () => {
    const turns = keys.map((p) => p.b.hips[0]);
    turns.slice(1).forEach((t, i) => expect(t, `key ${i + 1}`).toBeGreaterThan(turns[i]));
    expect(turns[0]).toBeGreaterThan(0);
    expect(turns[0]).toBeLessThan(0.5);
    expect(turns.at(-1)).toBeCloseTo(2 * Math.PI);
  });

  it("is upside down at the turn's middle, its head under its hips, balled low on the ground", () => {
    posed(rig, keys[0]);
    const standing = at(rig, "head").y;
    const mid = keys.findIndex((p) => p.b.hips[0] > Math.PI * 0.9);
    posed(rig, keys[mid]);
    expect(at(rig, "head").y, "head under the hips").toBeLessThan(at(rig, "hips").y);
    expect(at(rig, "hips").y / rig.H, "balled low").toBeLessThan(0.5);
    expect(standing / rig.H, "the push-off a crouch, head up").toBeGreaterThan(0.5);
  });

  it("goes over forward, the way it faces: a quarter turn in, its head out ahead of its hips", () => {
    const quarter = keys.findIndex((p) => p.b.hips[0] > Math.PI * 0.3);
    posed(rig, keys[quarter]);
    // the rig faces +z
    expect(at(rig, "head").z).toBeGreaterThan(at(rig, "hips").z);
  });

  it("comes up the right way round, its head over its hips, on the ground", () => {
    posed(rig, keys.at(-1));
    expect(at(rig, "head").y).toBeGreaterThan(at(rig, "hips").y);
  });

  it("keeps its tilt to the turn's middle: none at the push-off and coming up", () => {
    const tilts = keys.map((p) => p.b.hips[2]);
    expect(Math.abs(tilts.at(-1))).toBeLessThan(1e-9);
    expect(Math.max(...tilts.map(Math.abs))).toBeCloseTo(roll.tilt, 1);
  });
});

describe("each class rolls in its own look (FS-7P736 R15, the owner)", () => {
  it("the warrior's is a heavy shoulder roll: the slowest off the mark, the loosest ball, the most over onto a shoulder", () => {
    const rolls = [KNIGHT_ROLL, WIZARD_ROLL, ARCHER_ROLL, MERCENARY_ROLL];
    expect(KNIGHT_ROLL.turn[1]).toBe(Math.min(...rolls.map((r) => r.turn[1])));
    expect(KNIGHT_ROLL.tuck).toBe(Math.min(...rolls.map((r) => r.tuck)));
    expect(KNIGHT_ROLL.tilt).toBe(Math.max(...rolls.map((r) => r.tilt)));
  });

  it("the archer's is a light tuck: the quickest off the mark, the tightest ball, square over", () => {
    const rolls = [KNIGHT_ROLL, WIZARD_ROLL, ARCHER_ROLL, MERCENARY_ROLL];
    expect(ARCHER_ROLL.turn[1]).toBe(Math.max(...rolls.map((r) => r.turn[1])));
    expect(ARCHER_ROLL.tuck).toBe(Math.max(...rolls.map((r) => r.tuck)));
    expect(ARCHER_ROLL.tilt).toBe(0);
  });

  it("the mercenary's is low, his sword arm held out wide of him through the turn", () => {
    expect(MERCENARY_ROLL.low).toBe(Math.max(KNIGHT_ROLL.low, WIZARD_ROLL.low, ARCHER_ROLL.low, MERCENARY_ROLL.low));
    // the sword arm raised out from the side further than any other class's arm in its roll
    const out = (r) => Math.max(...Object.entries(r.arms).filter(([b]) => b.startsWith("upperArm")).map(([, v]) => Math.abs(v[2])));
    expect(out(MERCENARY_ROLL)).toBeGreaterThan(Math.max(out(KNIGHT_ROLL), out(WIZARD_ROLL), out(ARCHER_ROLL)));
    expect(MERCENARY_ROLL.arms.upperArmR[2]).toBeLessThan(-1);
  });

  it("the mage's is a softer ball nearly square over, her robe flung round her: its cloth carried as a run carries it", () => {
    expect(WIZARD_ROLL.tuck).toBeLessThan(1);
    expect(WIZARD_ROLL.tilt).toBeLessThan(KNIGHT_ROLL.tilt);
    expect(ROLL_ANIMATIONS.roll.speed).toBeGreaterThan(1);
  });

  it("keys only the arms, never a hand, so each look keeps its own weapon's grip", () => {
    for (const r of [KNIGHT_ROLL, WIZARD_ROLL, ARCHER_ROLL, MERCENARY_ROLL])
      for (const bone of Object.keys(r.arms)) expect(bone).toMatch(/^(upperArm|foreArm)[LR]$/);
  });

  it("but the mage's looks, whose staves are too long to roll upright: square over, the staff turned across her in the fist (mageLooks.test.mjs holds them over the ground, off her head and legs)", () => {
    for (const style of [SPELLWARDEN_STYLE, PYROMANCER_STYLE]) {
      expect(style.roll.tilt).toBe(0);
      expect(style.roll.arms.handR).toHaveLength(3);
      expect(style.roll.turn).toBe(WIZARD_ROLL.turn);
      expect(style.roll.tuck).toBe(WIZARD_ROLL.tuck);
    }
  });
});
