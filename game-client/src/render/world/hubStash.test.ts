import { describe, expect, it } from "vitest";
import { palette } from "@/utils/canvasPalette";
import { CHEST } from "./chest";
import {
  HUB_FURNISHINGS,
  HUB_INDOOR_DRESSING,
  type IndoorSpot,
} from "./hubInteriors";
import { HUB_KEEP_OUT } from "./hubKeepOut";
import {
  HUB_STASH_CHEST,
  STASH_CHEST_TINT,
  STASH_NAME,
  paintStashPlate,
  stashPlate,
  type PlateBrush,
} from "./hubStash";
import { HUB_TOWN_GOLDEN } from "./hubTownGolden";

type Box = { x: number; y: number; width: number; height: number };

const THICK = 20;
const DOOR = 50;
/** NPC_TALK_RANGE (the server's NPCInteractRange). */
const TALK_RANGE = 80;
/** Clear of the Quartermaster's talk range by at least this, so standing at one is not standing at both. */
const MARGIN = 20;

const store = HUB_TOWN_GOLDEN.buildings.find(
  (b) => b.name === "Quartermaster's store",
)!;
const quartermaster = HUB_KEEP_OUT.npcs.at[1];
const footprint = (s: IndoorSpot): Box => ({
  x: s.at.x - s.size[0] / 2,
  y: s.at.y - s.size[1] / 2,
  width: s.size[0],
  height: s.size[1],
});
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;
const chest = footprint(HUB_STASH_CHEST);

describe("the stash chest's spot (FS-VPD8Y R31)", () => {
  it("should stand inside the Quartermaster's store, within its walls", () => {
    expect(chest.x).toBeGreaterThanOrEqual(store.x + THICK);
    expect(chest.y).toBeGreaterThanOrEqual(store.y + THICK);
    expect(chest.x + chest.width).toBeLessThanOrEqual(
      store.x + store.w - THICK,
    );
    expect(chest.y + chest.height).toBeLessThanOrEqual(
      store.y + store.h - THICK,
    );
  });

  it("should stand out of the Quartermaster's talk range, with a margin", () => {
    const { x, y } = HUB_STASH_CHEST.at;
    expect(quartermaster).toEqual({ x: 1280, y: 270 });
    expect(
      Math.hypot(x - quartermaster.x, y - quartermaster.y),
    ).toBeGreaterThan(TALK_RANGE + MARGIN);
  });

  it("should keep off the store's shelves, crates and barrels, and every furnishing", () => {
    for (const s of HUB_INDOOR_DRESSING)
      expect(overlaps(chest, footprint(s)), s.sheet).toBe(false);
    for (const f of HUB_FURNISHINGS)
      expect(overlaps(chest, f.rect)).toBe(false);
  });

  it("should keep off the walk in from the door to the Quartermaster: gap-wide, from the sill to him", () => {
    const sill = store.y + store.h;
    const lane = {
      x: store.x + (store.w - DOOR) / 2,
      y: quartermaster.y,
      width: DOOR,
      height: sill - quartermaster.y,
    };
    expect(overlaps(chest, lane)).toBe(false);
  });

  it("should be the run's chest, under the amber name Stash", () => {
    expect(HUB_STASH_CHEST.sheet).toBe(CHEST.sheet);
    expect(STASH_NAME).toBe("Stash");
  });
});

describe("the stash chest's look (FS-VPD8Y R32)", () => {
  it("should cast the run chest in a slight tint from the palette, never amber", () => {
    expect(STASH_CHEST_TINT).toBe(palette.stashChestTint);
    expect(STASH_CHEST_TINT).not.toBe(0xffffff);
    expect(STASH_CHEST_TINT).not.toBe(palette.interactable);
  });

  it("should stand it on a trimmed plate a little wider than its footprint", () => {
    const plate = stashPlate(HUB_STASH_CHEST);
    expect(plate.x).toBeLessThan(chest.x);
    expect(plate.y).toBeLessThan(chest.y);
    expect(plate.x + plate.width).toBeGreaterThan(chest.x + chest.width);
    expect(plate.y + plate.height).toBeGreaterThan(chest.y + chest.height);
    // the plate stays in the room too
    expect(plate.x).toBeGreaterThanOrEqual(store.x + THICK);
    expect(plate.x + plate.width).toBeLessThanOrEqual(
      store.x + store.w - THICK,
    );
  });

  it("should paint the plate and its trim in palette tokens only", () => {
    const colours: number[] = [];
    const rects: Box[] = [];
    const brush: PlateBrush = {
      fillStyle: (c) => void colours.push(c),
      lineStyle: (_w, c) => void colours.push(c),
      fillRect: (x, y, width, height) =>
        void rects.push({ x, y, width, height }),
      strokeRect: (x, y, width, height) =>
        void rects.push({ x, y, width, height }),
    };
    const plate = stashPlate(HUB_STASH_CHEST);
    paintStashPlate(brush, plate);

    expect(new Set(colours)).toEqual(
      new Set([palette.stashChestPlate, palette.stashChestTrim]),
    );
    for (const r of rects)
      expect(overlaps(r, plate) || (r.width === 0 && r.height === 0)).toBe(
        true,
      );
  });
});
