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
      "attacking while walking on a sheet with walk_attack keeps the legs walking, turned to the aim",
      { attacking: true, walkAttack: true, velocity: { vx: 200, vy: 0 }, aim: { x: -30, y: 30 } },
      { animation: "walk_attack", facing: "sw", direction: 3 },
    ],
    [
      "attacking while walking on a sheet with walk_attack, with no aim, faces the way it walks",
      { attacking: true, walkAttack: true, velocity: { vx: 0, vy: -200 } },
      { animation: "walk_attack", facing: "n", direction: 6 },
    ],
    [
      "attacking while standing on a sheet with walk_attack is the whole-body attack",
      { attacking: true, walkAttack: true, aim: { x: 0, y: -50 } },
      { animation: "attack", facing: "n", direction: 6 },
    ],
    [
      "a drift below walking speed is still the whole-body attack",
      { attacking: true, walkAttack: true, velocity: { vx: 5, vy: 0 }, aim: { x: 50, y: 0 } },
      { animation: "attack", facing: "e", direction: 0 },
    ],
    [
      "dead wins over an attack on the move",
      { dead: true, attacking: true, walkAttack: true, facing: "w", velocity: { vx: 200, vy: 0 } },
      { animation: "death", facing: "w", direction: 4 },
    ],
    [
      "holding an aim stands idle turned to it (FS-JTNPR req 10)",
      { facing: "se", holding: { x: -50, y: 0 } },
      { animation: "idle", facing: "w", direction: 4 },
    ],
    [
      "holding an aim stays idle, turned to it, while the body still eases to a stop",
      { velocity: { vx: 200, vy: 0 }, holding: { x: 0, y: -50 } },
      { animation: "idle", facing: "n", direction: 6 },
    ],
    [
      "an attack plays over a held aim",
      { attacking: true, aim: { x: 0, y: 50 }, holding: { x: -50, y: 0 } },
      { animation: "attack", facing: "s", direction: 2 },
    ],
    [
      "a held aim on the player's own footprint keeps the facing",
      { facing: "ne", holding: { x: 0, y: 0 } },
      { animation: "idle", facing: "ne", direction: 7 },
    ],
    [
      "guarding stands in the parry clip, keeping the facing (FS-MAMHR §G.35)",
      { facing: "nw", guarding: true },
      { animation: "parry", facing: "nw", direction: 5 },
    ],
    [
      "guarding while walking holds the guard over the walk, turned the way it goes (§C.13)",
      { guarding: true, velocity: { vx: 0, vy: 200 } },
      { animation: "parry", facing: "s", direction: 2 },
    ],
    [
      "a swing started inside the stance plays over the guard",
      { guarding: true, attacking: true, aim: { x: 50, y: 0 } },
      { animation: "attack", facing: "e", direction: 0 },
    ],
    [
      "dead wins over a guard",
      { dead: true, guarding: true, facing: "w" },
      { animation: "death", facing: "w", direction: 4 },
    ],
    [
      "dead plays death and never turns",
      { dead: true, facing: "w", velocity: { vx: 200, vy: 0 } },
      { animation: "death", facing: "w", direction: 4 },
    ],
    [
      "dead wins over a held aim",
      { dead: true, facing: "w", holding: { x: 50, y: 0 } },
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
    ["parry", { guarding: true, velocity: { vx: 200, vy: 0 } }],
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
    // FS-MAMHR §H.42: the approved Mercenary sheet, no longer the knight's
    ["mercenary", "char_mercenary_base"],
    ["Mercenary", "char_mercenary_base"],
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

  it.each(["warrior", "mage", "archer", "mercenary"])(
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

  const CLASSES = ["warrior", "mage", "archer", "mercenary"];
  const CLASS_SHEETS = CLASSES.map(characterSheet);

  it.each(CLASSES)(
    "should give %s walk_attack: 8-way, played once, and exactly as long as its attack (FS-HF0WW, FS-3V7GC)",
    (cls) => {
      const { attack, walk_attack: walkAttack } = manifest.sheets[characterSheet(cls)].animations;
      expect(walkAttack?.loop).toBe(false);
      expect(walkAttack?.frames).toHaveLength(8);
      // the client times the window by the attack clip, so the two must last alike
      expect(walkAttack.frames[0].length / walkAttack.fps).toBeCloseTo(attack.frames[0].length / attack.fps, 9);
    },
  );

  it("should give walk_attack to the four classes alone, never a creature or a resident (FS-3V7GC)", () => {
    for (const [name, sheet] of Object.entries(manifest.sheets))
      if (!CLASS_SHEETS.includes(name)) expect(sheet.animations.walk_attack, name).toBeUndefined();
  });

  it.each(CLASSES)(
    "should bake %s at 2x, trimmed, frames twice a 1x sheet's px each way (FS-HF0WW, FS-3V7GC)",
    (cls) => {
      const sheet = manifest.sheets[characterSheet(cls)];
      expect(sheet.scale).toBe(2);
      expect(sheet.trimmed).toBe(true);
      expect(sheet.frameWidth % 2).toBe(0);
      expect(sheet.frameHeight % 2).toBe(0);
    },
  );

  it("should bake the four classes alone at 2x and trimmed (FS-3V7GC)", () => {
    for (const [name, sheet] of Object.entries(manifest.sheets))
      if (!CLASS_SHEETS.includes(name)) {
        expect(sheet.scale, name).toBeUndefined();
        expect(sheet.trimmed, name).toBeUndefined();
      }
  });

  it("should pack each class into its own atlas pages, shared with no other sheet (FS-3V7GC)", () => {
    const pages = (sheet: (typeof manifest.sheets)[string]) =>
      new Set([sheet.atlas, ...Object.values(sheet.animations).map((a) => a.atlas)].filter(Boolean));
    for (const name of CLASS_SHEETS) {
      const own = pages(manifest.sheets[name]);
      expect(own.size, name).toBeGreaterThan(0);
      for (const [other, sheet] of Object.entries(manifest.sheets))
        if (other !== name) for (const page of pages(sheet)) expect(own.has(page), `${other} on ${name}'s ${page}`).toBe(false);
    }
    expect(Object.keys(manifest.atlases).filter((k) => k.startsWith("characters-"))).toEqual([]);
  });

  it("should give the mercenary alone the parry clip: raised once, its last frame held (FS-MAMHR §G.35)", () => {
    const merc = manifest.sheets[characterSheet("mercenary")];
    expect(merc.animations.parry?.loop).toBe(false);
    expect(merc.animations.parry?.frames).toHaveLength(8);
    // raised inside the server's 0.25 s window (§C.11)
    const { frames, fps } = merc.animations.parry;
    expect(((frames[0].length - 1) / fps) * 1000).toBeLessThan(250);
    for (const cls of ["warrior", "mage", "archer"])
      expect(manifest.sheets[characterSheet(cls)].animations.parry, cls).toBeUndefined();
  });
});

// keeps the table honest: every facing the selector can return has a frame list
it("should only return facings in DIRECTION_ORDER", () => {
  const facings: Facing8[] = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
  for (const facing of facings)
    expect(selectAnimation(state({ facing })).direction).toBeGreaterThanOrEqual(0);
});
