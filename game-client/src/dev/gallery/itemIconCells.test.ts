import { describe, expect, it } from "vitest";
import type { ArtManifest } from "@/render/art/manifest";
import { ITEM_ICONS } from "@/render/art/itemIcons";
import { itemIconCells } from "./itemIconCells";

// FS-1819Q R9: the item-icon section is ITEM_ICONS itself, so a new name shows up with no
// gallery edit.

const manifest = {
  atlases: { "icons-0": { image: "icons-0.png", width: 200, height: 80 } },
  sheets: {
    icon_sword_t1: {
      atlas: "icons-0",
      frameWidth: 64,
      frameHeight: 64,
      animations: { default: { frames: [[{ x: 68, y: 2 }]] } },
    },
    icon_generic: {
      atlas: "icons-0",
      frameWidth: 64,
      frameHeight: 64,
      animations: { default: { frames: [[{ x: 134, y: 2 }]] } },
    },
  },
} as unknown as ArtManifest;

describe("itemIconCells", () => {
  it("should give one cell per ITEM_ICONS entry, by name and in order", () => {
    expect(itemIconCells(manifest, 64).map((c) => c.name)).toEqual([
      ...ITEM_ICONS,
    ]);
  });

  it("should keep every named cell, each an empty well, when the manifest failed to load", () => {
    const cells = itemIconCells(null, 64);
    expect(cells.map((c) => c.name)).toEqual([...ITEM_ICONS]);
    expect(cells.every((c) => c.crop === null)).toBe(true);
  });

  it("should draw an unbaked icon as the generic one, under its own name", () => {
    const helm = itemIconCells(manifest, 64).find((c) => c.name === "helm_t1");
    expect(helm?.crop?.position).toBe("-134px -2px");
  });
});
