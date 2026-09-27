import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLASS_LORE, type ClassKey } from "@/data/classLore";
import { characterSheet } from "./animationSelect";
import { DIRECTION_ORDER, directionIndex, type ArtManifest } from "./manifest";
import { TURNTABLE_STEP_MS, Turntable, turntableFacing } from "./turntable";

describe("turntableFacing", () => {
  it("starts on the facing it is given", () => {
    expect(turntableFacing(0, 1000, "se")).toBe("se");
    expect(turntableFacing(999, 1000, "se")).toBe("se");
  });

  it("steps one facing clockwise per step, through all eight, and wraps", () => {
    const start = directionIndex("se");
    const seen = Array.from({ length: 9 }, (_, i) =>
      turntableFacing(i * 1000, 1000, "se"),
    );
    expect(seen).toEqual(
      Array.from({ length: 9 }, (_, i) => DIRECTION_ORDER[(start + i) % 8]),
    );
    expect(new Set(seen).size).toBe(8);
  });

  it("never throws or leaves the compass for negative or huge times", () => {
    expect(DIRECTION_ORDER).toContain(turntableFacing(-1, 1000, "e"));
    expect(DIRECTION_ORDER).toContain(turntableFacing(1e12, 1000, "e"));
  });

  it("turns slowly: a full revolution takes several seconds", () => {
    expect(TURNTABLE_STEP_MS * 8).toBeGreaterThanOrEqual(6000);
  });
});

describe("Turntable", () => {
  const STEP = 1000;

  it("idles, turning, when nothing is picked", () => {
    const t = new Turntable(0, STEP, "se");
    expect(t.pose(0)).toMatchObject({
      animation: "idle",
      facing: "se",
      direction: 1,
    });
    expect(t.pose(STEP)).toMatchObject({
      animation: "idle",
      facing: "s",
      direction: 2,
    });
    expect(t.pose(0).timeScale).toBe(1);
  });

  it("plays the attack once on selection, holding its facing, then idles again", () => {
    const t = new Turntable(0, STEP, "se");
    t.flourish(2500, 600); // facing "sw" at 2500
    expect(t.pose(2500)).toMatchObject({ animation: "attack", facing: "sw" });
    expect(t.pose(3099)).toMatchObject({ animation: "attack", facing: "sw" });
    expect(t.pose(3100)).toMatchObject({ animation: "idle" });
  });

  it("resumes the turn where the attack paused it, rather than jumping ahead", () => {
    const t = new Turntable(0, STEP, "se");
    t.flourish(2500, 600);
    // 2500 ms of turning before, 400 ms after: still inside the "sw" step.
    expect(t.pose(3500).facing).toBe("sw");
    expect(t.pose(3600).facing).toBe("w");
  });

  it("a second pick mid-attack restarts the swing and keeps the held facing", () => {
    const t = new Turntable(0, STEP, "se");
    t.flourish(2500, 600);
    t.flourish(2900, 600);
    expect(t.pose(3400)).toMatchObject({ animation: "attack", facing: "sw" });
    expect(t.pose(3500)).toMatchObject({ animation: "idle", facing: "sw" });
    // Still 2500 ms of turning when the swing ends, so the next step is 500 ms later.
    expect(t.pose(3999).facing).toBe("sw");
    expect(t.pose(4000).facing).toBe("w");
  });

  it("a zero-length attack (no sheet to time it by) never leaves idle", () => {
    const t = new Turntable(0, STEP, "se");
    t.flourish(100, 0);
    expect(t.pose(100).animation).toBe("idle");
  });

  it("a stopped turntable holds its start facing", () => {
    const t = new Turntable(0, 0, "se");
    expect(t.pose(0).facing).toBe("se");
    expect(t.pose(60_000).facing).toBe("se");
  });
});

describe("menus pick exactly the sheet that walks", () => {
  const manifest = JSON.parse(
    readFileSync(join(__dirname, "../../../public/art/manifest.json"), "utf8"),
  ) as ArtManifest;

  it.each(Object.keys(CLASS_LORE) as ClassKey[])(
    "the %s class key names a baked 8-way sheet with idle and attack",
    (key) => {
      const sheet = manifest.sheets[characterSheet(key)];
      expect(sheet).toBeDefined();
      expect(sheet.directions).toBe(8);
      expect(sheet.animations.idle.frames).toHaveLength(8);
      expect(sheet.animations.attack.frames).toHaveLength(8);
    },
  );

  it("each class key has its own sheet", () => {
    const sheets = (Object.keys(CLASS_LORE) as ClassKey[]).map(characterSheet);
    expect(new Set(sheets).size).toBe(sheets.length);
  });

  it("the stored class name, in any case, draws the same sheet as its key", () => {
    expect(characterSheet("Mage")).toBe(characterSheet("mage"));
    expect(characterSheet("WARRIOR")).toBe(characterSheet("warrior"));
  });
});
