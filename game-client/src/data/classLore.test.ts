import { describe, expect, it } from "vitest";
import { CLASS_LORE } from "./classLore";

describe("CLASS_LORE: the Mercenary (FS-MAMHR §G.30)", () => {
  const merc = CLASS_LORE.mercenary;

  it("should name and title the class as the charter does", () => {
    expect(merc.key).toBe("mercenary");
    expect(merc.name).toBe("MERCENARY");
    expect(merc.englishTitle).toBe("THE MERCENARY");
    expect(merc.title).toBe("OATHLESS BLADE");
  });

  it("should carry the blurb verbatim", () => {
    expect(merc.description).toBe(
      "Sworn to no banner, bound by no oath but the coin. He turns the barrow's blows aside on a notched blade, and when the dead have spent their strength, answers every one of them at once.",
    );
  });

  it("should give the primary stat, weapon and playstyle", () => {
    expect(merc.primaryStat).toBe("Strength 7 / Agility 7");
    expect(merc.weaponType).toBe("Notched Arming Sword");
    expect(merc.playstyle).toBe("Parry, Riposte, Close Steel");
  });

  it("should give the stats card, its resource as 3 parry charges", () => {
    expect(merc.stats).toEqual({
      hp: 130,
      atk: 12,
      def: 7,
      range: 1,
      speed: 200,
      resource: { kind: "parry_charges", max: 3 },
    });
  });

  it("should draw random names from the six", () => {
    expect(merc.randomNames).toEqual([
      "Corvane",
      "Hask",
      "Ulric",
      "Brannoch",
      "Vesh",
      "Mordaunt",
    ]);
  });
});

describe("CLASS_LORE: each class's resource (FS-8AY7S req 3, no shared mana pool)", () => {
  it.each([
    ["warrior", "stamina", 100],
    ["archer", "stamina", 100],
    ["mage", "mana", 150],
    ["mercenary", "parry_charges", 3],
  ] as const)("should give the %s %s, %i at most", (key, kind, max) => {
    expect(CLASS_LORE[key].stats.resource).toEqual({ kind, max });
  });

  it("should carry no MP on any class", () => {
    for (const lore of Object.values(CLASS_LORE))
      expect("mp" in lore.stats, lore.key).toBe(false);
  });
});
