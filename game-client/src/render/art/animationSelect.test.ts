import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Facing8 } from "@/render/iso/facing";
import {
  CHARACTER_ANIMATIONS,
  MAX_WALK_SCALE,
  WALK_PACE,
  characterSheet,
  selectAnimation,
  type AnimationChoice,
  type CharacterState,
} from "./animationSelect";
import type { ArtManifest } from "./manifest";

const still = { vx: 0, vy: 0 };
const state = (fields: Partial<CharacterState>): CharacterState => ({
  velocity: still,
  facing: "se",
  attacking: false,
  dead: false,
  ...fields,
});

describe("selectAnimation", () => {
  it.each<[string, Partial<CharacterState>, Omit<AnimationChoice, "timeScale">]>([
    [
      "idle keeps the facing it had",
      { facing: "sw" },
      { animation: "idle", facing: "sw", direction: 3 },
    ],
    [
      "a drift below walking speed is still idle",
      { velocity: { vx: 5, vy: 0 }, facing: "n" },
      { animation: "idle", facing: "n", direction: 6 },
    ],
    [
      "walking east",
      { velocity: { vx: 200, vy: 0 } },
      { animation: "walk", facing: "e", direction: 0 },
    ],
    [
      "walking south",
      { velocity: { vx: 0, vy: 200 } },
      { animation: "walk", facing: "s", direction: 2 },
    ],
    [
      "walking north-west",
      { velocity: { vx: -141, vy: -141 } },
      { animation: "walk", facing: "nw", direction: 5 },
    ],
    [
      "attacking while idle faces the aim",
      { attacking: true, aim: { x: 0, y: -50 } },
      { animation: "attack", facing: "n", direction: 6 },
    ],
    [
      "attacking while walking, with no aim, faces the way it walks",
      { attacking: true, velocity: { vx: 200, vy: 0 } },
      { animation: "attack", facing: "e", direction: 0 },
    ],
    [
      "attacking while walking faces the aim over the walk",
      { attacking: true, velocity: { vx: 200, vy: 0 }, aim: { x: -30, y: 30 } },
      { animation: "attack", facing: "sw", direction: 3 },
    ],
    [
      "dead plays death and never turns",
      { dead: true, facing: "w", velocity: { vx: 200, vy: 0 } },
      { animation: "death", facing: "w", direction: 4 },
    ],
    [
      "dead wins over an attack",
      { dead: true, attacking: true, facing: "ne", aim: { x: 0, y: 50 } },
      { animation: "death", facing: "ne", direction: 7 },
    ],
  ])("%s", (_name, fields, want) => {
    const got = selectAnimation(state(fields));
    expect({
      animation: got.animation,
      facing: got.facing,
      direction: got.direction,
    }).toEqual(want);
  });

  it("should scale the walk to the speed drawn, so feet do not slide", () => {
    const got = selectAnimation(state({ velocity: { vx: 200, vy: 0 } }));
    expect(got.timeScale).toBeCloseTo(200 / WALK_PACE);
    expect(got.timeScale).toBeCloseTo(2.7, 1);
  });

  it("should scale a diagonal walk by its full speed, not one axis", () => {
    const got = selectAnimation(state({ velocity: { vx: 120, vy: 160 } }));
    expect(got.timeScale).toBeCloseTo(200 / WALK_PACE);
  });

  it("should cap the walk's playback for a burst like a dash", () => {
    const got = selectAnimation(state({ velocity: { vx: 2000, vy: 0 } }));
    expect(got.timeScale).toBe(MAX_WALK_SCALE);
  });

  it.each<[string, Partial<CharacterState>]>([
    ["idle", {}],
    ["attack", { attacking: true }],
    ["death", { dead: true }],
  ])("should play %s at its authored rate", (_name, fields) => {
    expect(selectAnimation(state(fields)).timeScale).toBe(1);
  });
});

describe("characterSheet", () => {
  it.each<[string | undefined, string]>([
    ["warrior", "char_knight_base"],
    ["mage", "char_wizard_base"],
    ["archer", "char_archer_base"],
    ["Archer", "char_archer_base"],
    ["", "char_knight_base"],
    ["necromancer", "char_knight_base"],
    [undefined, "char_knight_base"],
  ])("should draw class %s from %s", (cls, sheet) => {
    expect(characterSheet(cls)).toBe(sheet);
  });
});

describe("the shipped character sheets", () => {
  const manifest = JSON.parse(
    readFileSync(join(__dirname, "../../../public/art/manifest.json"), "utf8"),
  ) as ArtManifest;

  it.each(["warrior", "mage", "archer"])(
    "should give %s every animation the selector picks, 8-way",
    (cls) => {
      const sheet = manifest.sheets[characterSheet(cls)];
      expect(sheet?.directions).toBe(8);
      for (const animation of CHARACTER_ANIMATIONS)
        expect(sheet.animations[animation], animation).toBeDefined();
      // idle and walk loop; attack and death play once and hold the last frame
      expect(sheet.animations.idle.loop).toBe(true);
      expect(sheet.animations.walk.loop).toBe(true);
      expect(sheet.animations.attack.loop).toBe(false);
      expect(sheet.animations.death.loop).toBe(false);
    },
  );
});

// keeps the table honest: every facing the selector can return has a frame list
it("should only return facings in DIRECTION_ORDER", () => {
  const facings: Facing8[] = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
  for (const facing of facings)
    expect(selectAnimation(state({ facing })).direction).toBeGreaterThanOrEqual(0);
});
