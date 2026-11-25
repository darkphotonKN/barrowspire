import { describe, expect, it } from "vitest";
import { CLASS_LORE } from "./classLore";
import { BASE_MOVE_SPEED, paced } from "./pace";

describe("CLASS_LORE: the Mercenary (FS-MAMHR §G.30)", () => {
  const merc = CLASS_LORE.mercenary;

  it("should name the class as the charter does", () => {
    expect(merc.key).toBe("mercenary");
    expect(merc.name).toBe("MERCENARY");
    expect(merc.englishTitle).toBe("THE MERCENARY");
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
      speed: Math.round(BASE_MOVE_SPEED),
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

describe("CLASS_LORE: no old second names (FS-E1ZDG §K.38)", () => {
  it("should carry no title on any class: a title is the specialization's", () => {
    for (const lore of Object.values(CLASS_LORE))
      expect("title" in lore, lore.key).toBe(false);
  });
});

/** FS-TAGWA R12: the card's Speed is what the class walks at, the server's paced walk. */
describe("CLASS_LORE speeds (FS-TAGWA R12)", () => {
  it("should be the paced walk for every class, the archer's its full-pace 220 at the pace", () => {
    for (const key of ["warrior", "mage", "mercenary"] as const)
      expect(CLASS_LORE[key].stats.speed).toBe(Math.round(BASE_MOVE_SPEED));
    expect(CLASS_LORE.archer.stats.speed).toBe(Math.round(paced(220)));
  });
});
