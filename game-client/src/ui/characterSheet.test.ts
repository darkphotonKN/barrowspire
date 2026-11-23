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

  // FS-E1ZDG §K.41, §Change: The specialization name replaces the class name (N3): the spec name alone in the header's capitals
  it("should head a specialized character with their title, in capitals", () => {
    const berserker = { username: "Bram", class: "warrior", specialization: "berserker" };
    expect(characterSheet(berserker, nothingWorn()).className).toBe("BERSERKER");
  });

  it("should head one with no spec, or one the client does not know, with the class name", () => {
    expect(characterSheet({ username: "Bram", class: "warrior" }, nothingWorn()).className).toBe("WARRIOR");
    expect(characterSheet({ username: "Bram", class: "warrior", specialization: "paladin" }, nothingWorn()).className).toBe("WARRIOR");
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

describe("characterSheet passives (FS-8RZ51 R44)", () => {
  const warrior = (passive_ranks: Record<string, number>): CharacterSource => ({
    username: "Bram",
    class: "warrior",
    passive_ranks,
  });

  it("should list a node's bonus summed over its ranks, from the golden's values", () => {
    expect(
      characterSheet(warrior({ "warrior.t2b": 2 }), nothingWorn()).passives
        .stats,
    ).toEqual(["+8% max HP"]);
  });

  it("should sum one stat two nodes raise into one line (an archer's Haste and Quick Draw both add attack speed)", () => {
    expect(
      characterSheet(
        {
          username: "Wren",
          class: "archer",
          passive_ranks: { "archer.ua1": 1, "archer.t2a": 2 },
        },
        nothingWorn(),
      ).passives.stats,
    ).toEqual(["+10% attack speed"]);
  });

  it("should word a sum in seconds, as the golden gives the unit (the mercenary's parry window)", () => {
    expect(
      characterSheet(
        { username: "Vex", class: "mercenary", passive_ranks: { "mercenary.t2b": 3 } },
        nothingWorn(),
      ).passives.stats,
    ).toEqual(["+0.06 s parry window"]);
  });

  it("should keep a flat and a percent max HP apart, Vitality's and Thick Skin's (V30)", () => {
    expect(
      characterSheet(
        warrior({ "warrior.r1": 1, "warrior.ua2": 1, "warrior.t2b": 1 }),
        nothingWorn(),
      ).passives.stats,
    ).toEqual(["+10 max HP", "+4% max HP"]);
  });

  it.each([
    ["warrior", ["+4 Strength"]],
    ["mage", ["+4 Intelligence"]],
    ["archer", ["+4 Agility"]],
    ["mercenary", ["+4 Strength", "+4 Agility"]],
  ])("should sum the %s's Might into its attribute lines (V30)", (cls, lines) => {
    expect(
      characterSheet(
        { username: "Ash", class: cls, passive_ranks: { [`${cls}.r2`]: 1, [`${cls}.ua3`]: 1 } },
        nothingWorn(),
      ).passives.stats,
    ).toEqual(lines);
  });

  it("should add a kicker's stat at rank 2 but not name it", () => {
    const { passives } = characterSheet(warrior({ "warrior.t2a": 2 }), nothingWorn());
    expect(passives.stats).toEqual(["+12% slash damage"]);
    expect(passives.kickers).toEqual([]);
  });

  it("should name a kicker held at rank 3 on its own line, by its name from the copy, its stat summed too", () => {
    const { passives } = characterSheet(
      warrior({ "warrior.t2a": 3, "warrior.t2b": 3 }),
      nothingWorn(),
    );
    expect(passives.stats).toEqual(["+18% slash damage", "+12% max HP"]);
    expect(passives.kickers).toEqual(["Heavy Hand", "Thick Skin"]);
  });

  it("should read None yet when no rank is held, the ranks absent or empty", () => {
    const none = { stats: [], kickers: [], note: "None yet" };
    expect(characterSheet(warrior({}), nothingWorn()).passives).toEqual(none);
    expect(characterSheet(mage, nothingWorn()).passives).toEqual(none);
    expect(
      characterSheet(warrior({ "warrior.t2b": 1 }), nothingWorn()).passives.note,
    ).toBeNull();
  });

  it("should leave out a node id the golden lacks, a retired one too, never crash (R42, V21)", () => {
    expect(
      characterSheet(
        warrior({ "warrior.t9z": 2, "warrior.t1a": 2 }),
        nothingWorn(),
      ).passives,
    ).toEqual({ stats: [], kickers: [], note: "None yet" });
  });
});
