import { describe, expect, it } from "vitest";
import type { EquippedItems, ItemState } from "@/types/gameState";
import {
  characterSheet,
  gearStats,
  type CharacterSource,
} from "./characterSheet";
import { nothingWorn } from "./EquipmentHud";

function item(over: Partial<ItemState>): ItemState {
  return { item_id: "i", entity_id: "e", name: "Thing", quantity: 1, ...over };
}

function wearing(over: Partial<EquippedItems>): EquippedItems {
  return { ...nothingWorn(), ...over };
}

describe("gearStats (FS-HRH2J R29: what worn gear adds, summed)", () => {
  it("should sum one affix stat that two worn items share into one line, worded as item lines word it", () => {
    const worn = wearing({
      ring_1: item({ affixes: [{ stat: "strength", tier: 2, value: 3 }] }),
      ring_2: item({
        affixes: [
          { stat: "strength", tier: 1, value: 2 },
          { stat: "attack_speed", tier: 1, value: 5 },
        ],
      }),
    });

    expect(gearStats(worn).affixes).toEqual([
      "+5 Strength",
      "+5% attack speed",
    ]);
  });

  it("should sum the base stats worn items carry, worded as the item tip words them, and leave out the rest", () => {
    const worn = wearing({
      weapon: item({ attack_power: 12, critical_rate: 0.05 }),
      hands: item({ defense_rating: 3, critical_rate: 0.1 }),
      body: item({ defense_rating: 8 }),
    });

    expect(gearStats(worn).stats).toEqual([
      { label: "Attack", value: "12" },
      { label: "Critical rate", value: "15%" },
      { label: "Defense", value: "11" },
    ]);
  });

  it("should list nothing, and say so, when nothing is worn (edge state: Empty bag / nothing worn)", () => {
    expect(gearStats(nothingWorn())).toEqual({
      stats: [],
      affixes: [],
      note: "Nothing worn",
    });
  });

  it("should say nothing more when what is worn carries no stat", () => {
    const worn = wearing({ consumable_1: item({ healing_amount: 40 }) });

    expect(gearStats(worn).note).toBeNull();
  });

  it("should not count a consumable's healing as a stat from gear", () => {
    const worn = wearing({ consumable_1: item({ healing_amount: 40 }) });

    expect(gearStats(worn).stats).toEqual([]);
  });
});

const mage: CharacterSource = {
  username: "Ignis",
  class: "mage",
  level: 3,
  experience: 150,
  level_floor: 100,
  next_level_at: 230,
};

describe("characterSheet header and experience (FS-HRH2J R25–26)", () => {
  it("should name the class as the menus do, the character, and its level", () => {
    const sheet = characterSheet(mage, nothingWorn());

    expect(sheet.className).toBe("MAGE");
    expect(sheet.name).toBe("Ignis");
    expect(sheet.level).toBe(3);
  });

  it("should fill the bar by xpFraction and count experience into the level", () => {
    const { xp } = characterSheet(mage, nothingWorn());

    expect(xp.fraction).toBeCloseTo(50 / 130, 5);
    expect(xp.text).toBe("50 / 130");
  });

  it("should fill the bar and read Max level at the cap", () => {
    const { level, xp } = characterSheet(
      {
        username: "Ignis",
        class: "mage",
        level: 20,
        experience: 9000,
        level_floor: 8000,
      },
      nothingWorn(),
    );

    expect(level).toBe(20);
    expect(xp).toEqual({ fraction: 1, text: "Max level" });
  });

  it("should stand at level 1 with an empty bar when the state carries no level", () => {
    const { level, xp } = characterSheet(
      { username: "Ignis", class: "mage" },
      nothingWorn(),
    );

    expect(level).toBe(1);
    expect(xp).toEqual({ fraction: 0, text: null });
  });

  it("should name a class the card does not know by its own word", () => {
    expect(
      characterSheet({ username: "X", class: "bard" }, nothingWorn()).className,
    ).toBe("BARD");
  });
});

describe("characterSheet resources (FS-HRH2J R27)", () => {
  it("should show health and the class resource as current / max, the resource named as its bar names it", () => {
    const { resources } = characterSheet(
      {
        ...mage,
        current_health: 72,
        max_health: 100,
        resource: { kind: "mana", current: 40, max: 150, ability_cost: 20 },
      },
      nothingWorn(),
    );

    expect(resources).toEqual([
      { label: "Health", channel: "health", text: "72 / 100", fill: 0.72 },
      { label: "Mana", channel: "mana", text: "40 / 150", fill: 40 / 150 },
    ]);
  });

  it("should name parry charges Parry", () => {
    const { resources } = characterSheet(
      {
        username: "Hask",
        class: "mercenary",
        resource: {
          kind: "parry_charges",
          current: 2,
          max: 3,
          ability_cost: 1,
        },
      },
      nothingWorn(),
    );

    expect(resources).toEqual([
      { label: "Parry", channel: "parry", text: "2 / 3", fill: 2 / 3 },
    ]);
  });

  it("should hide a row the state does not carry, never show it as zero (the hub)", () => {
    expect(characterSheet(mage, nothingWorn()).resources).toEqual([]);
  });
});

describe("characterSheet class stats (FS-HRH2J R28)", () => {
  it("should list the class card's numbers", () => {
    expect(
      characterSheet({ username: "Sylvan", class: "archer" }, nothingWorn())
        .classStats,
    ).toEqual([
      { label: "HP", value: "100" },
      { label: "Attack", value: "10" },
      { label: "Defense", value: "5" },
      { label: "Range", value: "8" },
      { label: "Speed", value: "220" },
    ]);
  });

  it("should list none for a class the card does not know", () => {
    expect(
      characterSheet({ username: "X", class: "bard" }, nothingWorn())
        .classStats,
    ).toEqual([]);
  });
});

describe("characterSheet from gear (FS-HRH2J R29)", () => {
  it("should carry the summed gear stats", () => {
    const worn = wearing({ weapon: item({ attack_power: 7 }) });

    expect(characterSheet(mage, worn).gear.stats).toEqual([
      { label: "Attack", value: "7" },
    ]);
  });
});
