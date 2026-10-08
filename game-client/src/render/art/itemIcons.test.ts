import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ArtManifest } from "./manifest";
import { ITEM_ICONS, iconCrop, iconSheet, itemIcon } from "./itemIcons";

describe("itemIcon over the two wire shapes", () => {
  // The canvas's ItemState and the items `ItemInstance` are snake_case; the marketplace
  // `ItemSummary` is camelCase. One resolver serves both, with the same answer.
  it.each([
    ["a sword", { weapon_type: "sword" }, { weaponType: "sword" }, "sword"],
    [
      "a crossbow",
      { weapon_type: "Crossbow" },
      { weaponType: "Crossbow" },
      "bow",
    ],
    ["a helm", { armor_slot: "head" }, { armorSlot: "head" }, "helm"],
    ["a ring slot", { armor_slot: "ring_2" }, { armorSlot: "ring_2" }, "ring"],
    // FS-4R9M9 R60: a ring is its own item type, with no slot or ring-like word in its name.
    ["a ring by type", { item_type: "ring" }, { itemType: "Ring" }, "ring"],
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
    [
      "an axe (no axe icon)",
      { weapon_type: "axe" },
      { weaponType: "axe" },
      "generic",
    ],
  ])("should map %s the same either way", (_label, snake, camel, icon) => {
    expect(itemIcon({ name: "Thing", ...snake })).toBe(icon);
    expect(itemIcon({ name: "Thing", ...camel })).toBe(icon);
  });

  it.each([
    ["a signet by name", "Signet of the Spire", "ring"],
    ["a skull by name", "Wight Skull", "skull"],
    ["nothing recognisable", "Something Strange", "generic"],
  ])("should fall back to the name for %s", (_label, name, icon) => {
    expect(itemIcon({ name })).toBe(icon);
  });

  it("should draw an item with no name as generic", () => {
    expect(itemIcon({})).toBe("generic");
  });
});

describe("iconCrop", () => {
  const manifest = {
    atlases: { "icons-0": { image: "icons-0.png", width: 200, height: 80 } },
    sheets: {
      icon_sword: {
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
    expect(iconCrop(manifest, "sword", size)).toEqual(want);
  });

  it("should crop the generic icon when the item's own is not baked", () => {
    expect(iconCrop(manifest, "helm", 64)?.position).toBe("-134px -2px");
  });

  it("should give nothing when there is no manifest to crop from", () => {
    expect(iconCrop(null, "sword", 64)).toBeNull();
  });

  it("should crop every icon from the baked manifest", () => {
    const baked = JSON.parse(
      readFileSync(
        join(__dirname, "../../../public/art/manifest.json"),
        "utf8",
      ),
    ) as ArtManifest;
    for (const icon of ITEM_ICONS) {
      const frame =
        baked.sheets[iconSheet(icon)].animations.default.frames[0][0];
      expect(iconCrop(baked, icon, 64)).toMatchObject({
        image: "/art/icons-0.png",
        position: `-${frame.x}px -${frame.y}px`,
      });
    }
  });
});
