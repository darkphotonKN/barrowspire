import { describe, expect, it } from "vitest";
import { instanceItem, rarityNames, type ItemInstance } from "./loadoutItem";

const instance = (fields: Partial<ItemInstance>): ItemInstance => ({
  item_level: 1,
  affixes: [],
  ...fields,
});

describe("instanceItem", () => {
  it("should carry a ring's type, rarity, level, requirement, affixes and unique effect into the view's shape", () => {
    const item = instanceItem(
      instance({
        id: "inst-1",
        template_id: "tpl-1",
        name: "Ring of the Last King",
        item_type: "ring",
        rarity_id: "r-fabled",
        item_level: 18,
        required_level: 16,
        affixes: [
          { stat: "strength", tier: 0, value: 2 },
          { stat: "crit_chance", tier: 0, value: 1 },
        ],
        unique_effect: "+1 to all attributes per floor climbed this run.",
        description: "The crown is gone; the ring remembers.",
      }),
      new Map([["r-fabled", "Fabled"]]),
    );

    expect(item).toEqual({
      item_id: "tpl-1",
      entity_id: "inst-1",
      name: "Ring of the Last King",
      quantity: 1,
      item_type: "ring",
      rarity: "Fabled",
      item_level: 18,
      required_level: 16,
      affixes: [
        { stat: "strength", tier: 0, value: 2 },
        { stat: "crit_chance", tier: 0, value: 1 },
      ],
      unique_effect: "+1 to all attributes per floor climbed this run.",
      description: "The crown is gone; the ring remembers.",
    });
  });

  it("should carry a weapon's and an armour piece's base stats, magic resistance included", () => {
    expect(
      instanceItem(
        instance({
          id: "a",
          name: "Barrow Helm",
          item_type: "armor",
          armor_slot: "head",
          defense_rating: 4,
          magic_resistance: 2,
        }),
        new Map(),
      ),
    ).toMatchObject({
      armor_slot: "head",
      defense_rating: 4,
      magic_resistance: 2,
    });
    expect(
      instanceItem(
        instance({
          id: "w",
          name: "Wightfang",
          item_type: "weapon",
          weapon_type: "knife",
          attack_power: 4,
          critical_rate: 0.18,
        }),
        new Map(),
      ),
    ).toMatchObject({
      weapon_type: "knife",
      attack_power: 4,
      critical_rate: 0.18,
    });
  });

  it("should leave out what a legacy instance does not have, never failing", () => {
    const item = instanceItem(
      {
        item_level: 0,
        affixes: null as unknown as [],
        id: "old",
        name: "Rusty Blade",
      },
      new Map(),
    );
    expect(item).toEqual({
      item_id: "",
      entity_id: "old",
      name: "Rusty Blade",
      quantity: 1,
    });
  });

  it("should name no rarity when its id is not among the known rarities", () => {
    expect(
      instanceItem(instance({ id: "x", rarity_id: "r-gone" }), new Map())
        .rarity,
    ).toBeUndefined();
  });
});

describe("rarityNames", () => {
  it("should index the rarity list by id, skipping rows without one", () => {
    expect(
      rarityNames([
        { id: "r1", name: "Normal" },
        { id: "r5", name: "Fabled" },
        { name: "Orphan" },
      ]),
    ).toEqual(
      new Map([
        ["r1", "Normal"],
        ["r5", "Fabled"],
      ]),
    );
  });

  it("should answer an empty index for no list", () => {
    expect(rarityNames(null)).toEqual(new Map());
  });
});
