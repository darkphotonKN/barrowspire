import { describe, expect, it } from "vitest";
import { RARITY_TIERS, rarityOf } from "./rarity";

describe("rarityOf", () => {
  it.each([
    ["normal", "common", "Normal", 1],
    ["uncommon", "uncommon", "Uncommon", 2],
    ["rare", "rare", "Rare", 3],
    ["runed", "epic", "Runed", 4],
    ["fabled", "legendary", "Fabled", 5],
  ])(
    "should map the server tier %s to the %s token",
    (tier, token, label, rank) => {
      expect(rarityOf(tier)).toEqual({ tier, token, label, rank });
    },
  );

  it.each([
    ["a capitalised name", "Runed", "runed", "epic"],
    ["surrounding space", " fabled ", "fabled", "legendary"],
  ])(
    "should match a tier by name regardless of %s",
    (_l, name, tier, token) => {
      expect(rarityOf(name)).toMatchObject({ tier, token });
    },
  );

  it.each([
    ["an unknown tier", "mythic", "mythic"],
    ["a client-side name the server never sends", "Legendary", "Legendary"],
  ])(
    "should render %s as common with the raw name as its label",
    (_l, name, label) => {
      expect(rarityOf(name)).toEqual({
        tier: name,
        token: "common",
        label,
        rank: 0,
      });
    },
  );

  it.each([
    ["missing", undefined],
    ["blank", "  "],
  ])("should render a %s tier as common, labelled Unknown", (_l, name) => {
    expect(rarityOf(name)).toMatchObject({
      token: "common",
      label: "Unknown",
      rank: 0,
    });
  });

  it("should list the five server tiers in ascending order", () => {
    expect(RARITY_TIERS).toEqual([
      "normal",
      "uncommon",
      "rare",
      "runed",
      "fabled",
    ]);
    expect(RARITY_TIERS.map((t) => rarityOf(t).rank)).toEqual([1, 2, 3, 4, 5]);
  });
});
