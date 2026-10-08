import { describe, expect, it } from "vitest";
import { affixLine, itemLines } from "./itemLines";

describe("affixLine", () => {
  // The eleven stat codes of FS-4R9M9 R17, each with the words an item view reads.
  it.each([
    ["strength", 3, "+3 Strength"],
    ["agility", 2, "+2 Agility"],
    ["intelligence", 5, "+5 Intelligence"],
    ["max_health", 12, "+12 maximum health"],
    ["max_mana", 8, "+8 maximum mana"],
    ["attack_speed", 5, "+5% attack speed"],
    ["move_speed", 7, "+7% movement speed"],
    ["crit_chance", 2, "+2% critical chance"],
    ["flat_damage", 2, "+2 damage"],
    ["defense", 4, "+4 defense"],
    ["magic_resistance", 3, "+3 magic resistance"],
  ])("should read %s %s as %s", (stat, value, want) => {
    expect(affixLine({ stat, value })).toBe(want);
  });

  it("should read a stat code it does not know in plain words, never failing", () => {
    expect(affixLine({ stat: "bone_ward", value: 2 })).toBe("+2 bone ward");
  });
});

describe("itemLines", () => {
  it("should give an affixed item its level, requirement and one line per affix", () => {
    expect(
      itemLines({
        itemLevel: 9,
        requiredLevel: 6,
        affixes: [
          { stat: "strength", tier: 2, value: 3 },
          { stat: "attack_speed", tier: 1, value: 2 },
        ],
      }),
    ).toEqual({
      itemLevel: "Item level 9",
      requirement: { text: "Requires level 6", tooHigh: false },
      affixes: ["+3 Strength", "+2% attack speed"],
      uniqueEffect: undefined,
    });
  });

  it("should give a unique its effect, its fixed affixes reading like rolled ones", () => {
    const lines = itemLines({
      itemLevel: 12,
      requiredLevel: 10,
      affixes: [{ stat: "max_health", tier: 0, value: 14 }],
      uniqueEffect: "Kills restore 4% of max health.",
    });
    expect(lines.affixes).toEqual(["+14 maximum health"]);
    expect(lines.uniqueEffect).toBe("Kills restore 4% of max health.");
  });

  it.each([
    ["above the character's level", 7, 6, true],
    ["at the character's level", 6, 6, false],
    ["with the character's level unknown", 7, undefined, false],
  ])(
    "should mark the requirement too high only when %s",
    (_c, required, level, tooHigh) => {
      expect(
        itemLines({ itemLevel: 8, requiredLevel: required, affixes: [] }, level)
          .requirement,
      ).toEqual({ text: `Requires level ${required}`, tooHigh });
    },
  );

  it("should read an item from before item levels as level 1 with no affixes", () => {
    // A legacy listing, or a gateway older than the item-level fields: never an error.
    expect(itemLines({})).toEqual({
      itemLevel: "Item level 1",
      requirement: { text: "Requires level 1", tooHigh: false },
      affixes: [],
      uniqueEffect: undefined,
    });
    expect(
      itemLines({ affixes: null, uniqueEffect: "  " }).uniqueEffect,
    ).toBeUndefined();
  });
});
