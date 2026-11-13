import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ArtManifest } from "./manifest";
import {
  ITEM_ICONS,
  gearTier,
  iconCrop,
  iconSheet,
  itemIcon,
} from "./itemIcons";

describe("itemIcon over the two wire shapes", () => {
  // The canvas's ItemState and the items `ItemInstance` are snake_case; the marketplace
  // `ItemSummary` is camelCase. One resolver serves both, with the same answer.
  it.each([
    ["a sword", { weapon_type: "sword" }, { weaponType: "sword" }, "sword_t1"],
    [
      "a crossbow",
      { weapon_type: "Crossbow" },
      { weaponType: "Crossbow" },
      "bow_t1",
    ],
    ["a helm", { armor_slot: "head" }, { armorSlot: "head" }, "helm_t1"],
    [
      "a ring slot",
      { armor_slot: "ring_2" },
      { armorSlot: "ring_2" },
      "ring_t1",
    ],
    // FS-4R9M9 R60: a ring is its own item type, with no slot or ring-like word in its name.
    ["a ring by type", { item_type: "ring" }, { itemType: "Ring" }, "ring_t1"],
    [
      "a health potion",
      { healing_amount: 50 },
      { healingAmount: 50 },
      "potion_health",
    ],
    ["a mana potion", { mana_amount: 50 }, { manaAmount: 50 }, "potion_mana"],
    [
      "a tonic of both",
      { healing_amount: 5, mana_amount: 5 },
      { healingAmount: 5, manaAmount: 5 },
      "vial_tonic",
    ],
    ["an axe", { weapon_type: "axe" }, { weaponType: "axe" }, "axe_t1"],
    ["a mace", { weapon_type: "mace" }, { weaponType: "mace" }, "mace_t1"],
    ["a spear", { weapon_type: "spear" }, { weaponType: "spear" }, "spear_t1"],
    ["boots", { armor_slot: "feet" }, { armorSlot: "feet" }, "boots_t1"],
    [
      "a level 22 sword",
      { weapon_type: "sword", item_level: 22 },
      { weaponType: "sword", itemLevel: 22 },
      "sword_t3",
    ],
    [
      "an unknown weapon type",
      { weapon_type: "trebuchet" },
      { weaponType: "trebuchet" },
      "generic",
    ],
  ])("should map %s the same either way", (_label, snake, camel, icon) => {
    expect(itemIcon({ name: "Thing", ...snake })).toBe(icon);
    expect(itemIcon({ name: "Thing", ...camel })).toBe(icon);
  });

  it.each([
    ["a signet by name", "Signet of the Spire", "ring_t1"],
    ["a skull by name", "Wight Skull", "skull"],
    ["nothing recognisable", "Something Strange", "generic"],
  ])("should fall back to the name for %s", (_label, name, icon) => {
    expect(itemIcon({ name })).toBe(icon);
  });

  it("should draw an item with no name as generic", () => {
    expect(itemIcon({})).toBe("generic");
  });
});

describe("gearTier", () => {
  // The look follows the item level, never a roll: 1-9, 10-19, 20-24, 25 and up.
  it.each([
    [undefined, 1],
    [1, 1],
    [9, 1],
    [10, 2],
    [19, 2],
    [20, 3],
    [24, 3],
    [25, 4],
    [34, 4],
  ])("should put item level %s in tier %i", (level, tier) => {
    expect(gearTier(level)).toBe(tier);
  });

  it("should draw the same piece in each tier's look by its level", () => {
    const helm = (item_level: number) =>
      itemIcon({ armor_slot: "head", item_level });
    expect([5, 12, 21, 30].map(helm)).toEqual([
      "helm_t1",
      "helm_t2",
      "helm_t3",
      "helm_t4",
    ]);
  });

  it("should not tier an icon that is not gear", () => {
    expect(itemIcon({ healing_amount: 50, item_level: 30 })).toBe(
      "potion_health",
    );
  });
});

describe("iconCrop", () => {
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

  it.each([
    [
      "at the baked size",
      64,
      {
        image: "/art/icons-0.png",
        size: 64,
        position: "-68px -2px",
        sheetSize: "200px 80px",
      },
    ],
    [
      "scaled down, every offset scaled with it",
      32,
      {
        image: "/art/icons-0.png",
        size: 32,
        position: "-34px -1px",
        sheetSize: "100px 40px",
      },
    ],
  ])("should crop the atlas at the icon's frame %s", (_label, size, want) => {
    expect(iconCrop(manifest, "sword_t1", size)).toEqual(want);
  });

  it("should crop the generic icon when the item's own is not baked", () => {
    expect(iconCrop(manifest, "helm_t1", 64)?.position).toBe("-134px -2px");
  });

  it("should give nothing when there is no manifest to crop from", () => {
    expect(iconCrop(null, "sword_t1", 64)).toBeNull();
  });

  it("should crop every icon from the baked manifest", () => {
    const baked = JSON.parse(
      readFileSync(
        join(__dirname, "../../../public/art/manifest.json"),
        "utf8",
      ),
    ) as ArtManifest;
    for (const icon of ITEM_ICONS) {
      const sheet = baked.sheets[iconSheet(icon)];
      const frame = sheet.animations.default.frames[0][0];
      expect(iconCrop(baked, icon, 64)).toMatchObject({
        image: `/art/${baked.atlases[sheet.atlas].image}`,
        position: `-${frame.x}px -${frame.y}px`,
      });
    }
  });
});
