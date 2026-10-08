import { describe, expect, it } from "vitest";
import type { ItemState } from "@/types/gameState";
import { itemDetail, itemView } from "./itemView";

const item = (fields: Partial<ItemState> & { name: string }): ItemState => ({
  item_id: `id-${fields.name}`,
  entity_id: `e-${fields.name}`,
  quantity: 1,
  ...fields,
});

describe("itemView", () => {
  it("should give a Runed item its rarity, base stats, level lines and one line per affix in order", () => {
    const view = itemView(
      item({
        name: "Runed Barrow Blade",
        weapon_type: "sword",
        attack_power: 14,
        critical_rate: 0.12,
        rarity: "runed",
        item_level: 15,
        required_level: 13,
        affixes: [
          { stat: "strength", tier: 3, value: 5 },
          { stat: "attack_speed", tier: 2, value: 4 },
          { stat: "crit_chance", tier: 1, value: 1 },
          { stat: "flat_damage", tier: 3, value: 3 },
        ],
        description: "Notched on old bones.",
      }),
      10,
    );

    expect(view).toEqual({
      name: "Runed Barrow Blade",
      kind: "weapon",
      rarity: { label: "Runed", token: "epic" },
      summary: "ATK 14",
      stats: [
        { label: "Kind", value: "Sword" },
        { label: "Attack", value: "14" },
        { label: "Critical rate", value: "12%" },
      ],
      lines: {
        itemLevel: "Item level 15",
        requirement: { text: "Requires level 13", tooHigh: true },
        affixes: [
          "+5 Strength",
          "+4% attack speed",
          "+1% critical chance",
          "+3 damage",
        ],
        uniqueEffect: undefined,
      },
      lore: "Notched on old bones.",
    });
  });

  it("should give a unique its fixed affixes, read like rolled ones, its effect and its lore", () => {
    const view = itemView(
      item({
        name: "Lantern of the Drowned",
        rarity: "fabled",
        item_level: 12,
        required_level: 9,
        affixes: [
          { stat: "intelligence", tier: 0, value: 3 },
          { stat: "max_mana", tier: 0, value: 12 },
          { stat: "magic_resistance", tier: 0, value: 2 },
        ],
        unique_effect: "Your projectiles pierce one extra target.",
        description: "It still drips.",
      }),
      9,
    );

    expect(view.kind).toBe("ring");
    expect(view.rarity).toEqual({ label: "Fabled", token: "legendary" });
    expect(view.stats).toEqual([]);
    expect(view.lines).toEqual({
      itemLevel: "Item level 12",
      requirement: { text: "Requires level 9", tooHigh: false },
      affixes: ["+3 Intelligence", "+12 maximum mana", "+2 magic resistance"],
      uniqueEffect: "Your projectiles pierce one extra target.",
    });
    expect(view.lore).toBe("It still drips.");
  });

  it("should read a legacy item as level 1, no rarity badge and no affix lines, never failing", () => {
    const view = itemView(
      item({ name: "Wooden Helm", armor_slot: "head", defense_rating: 3 }),
    );

    expect(view).toEqual({
      name: "Wooden Helm",
      kind: "armor",
      rarity: null,
      summary: "DEF 3",
      stats: [
        { label: "Slot", value: "Head" },
        { label: "Defense", value: "3" },
      ],
      lines: {
        itemLevel: "Item level 1",
        requirement: { text: "Requires level 1", tooHigh: false },
        affixes: [],
        uniqueEffect: undefined,
      },
      lore: undefined,
    });
  });

  it("should list an armour piece's magic resistance among its base stats", () => {
    expect(
      itemView(
        item({
          name: "Hollow Crown",
          armor_slot: "head",
          defense_rating: 2,
          magic_resistance: 5,
        }),
      ).stats,
    ).toContainEqual({ label: "Magic resistance", value: "5" });
  });

  it.each([
    [12, true],
    [13, false],
    [14, false],
  ])(
    "should highlight 'Requires level 13' at character level %s: %s",
    (level, tooHigh) => {
      const view = itemView(
        item({ name: "Greaves", armor_slot: "legs", required_level: 13 }),
        level,
      );
      expect(view.lines.requirement).toEqual({
        text: "Requires level 13",
        tooHigh,
      });
    },
  );

  it("should not highlight a requirement while the character's level is unknown", () => {
    expect(
      itemView(
        item({ name: "Greaves", armor_slot: "legs", required_level: 13 }),
      ).lines.requirement.tooHigh,
    ).toBe(false);
  });

  it("should label a rarity tier it does not know by its raw name, as common", () => {
    expect(
      itemView(item({ name: "Odd Thing", rarity: "cursed" })).rarity,
    ).toEqual({ label: "cursed", token: "common" });
  });
});

describe("itemDetail", () => {
  it.each([
    [
      "a weapon",
      item({ name: "Iron Sword", attack_power: 10, critical_rate: 5 }),
      "ATK 10",
    ],
    ["armour", item({ name: "Wooden Helm", defense_rating: 15 }), "DEF 15"],
    [
      "a health potion",
      item({ name: "Health Potion", healing_amount: 50 }),
      "+50 HP",
    ],
    ["a mana potion", item({ name: "Mana Potion", mana_amount: 40 }), "+40 MP"],
    ["a stack", item({ name: "Grave-gold", quantity: 37 }), "x37"],
    ["a single plain relic", item({ name: "Wight Skull" }), ""],
  ])(
    "should give %s the stat line the item row showed",
    (_label, it_, detail) => {
      expect(itemDetail(it_)).toBe(detail);
    },
  );
});
