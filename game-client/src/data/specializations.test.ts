import { describe, expect, it } from "vitest";
import { SPECIALIZATIONS, characterTitle, classLevelLine, nameplateTitle, specializationOf } from "./specializations";

describe("characterTitle (FS-E1ZDG §K.37)", () => {
  it("should join the class and the spec with a middle dot", () => {
    expect(characterTitle("warrior", "berserker")).toBe("Warrior · Berserker");
    expect(characterTitle("archer", "shadow_ranger")).toBe("Archer · Shadow Ranger");
  });

  it.each([
    ["warrior", "guardian", "Warrior · Guardian"],
    ["warrior", "berserker", "Warrior · Berserker"],
    ["mage", "spellwarden", "Mage · Spellwarden"],
    ["mage", "pyromancer", "Mage · Pyromancer"],
    ["archer", "hunter", "Archer · Hunter"],
    ["archer", "shadow_ranger", "Archer · Shadow Ranger"],
    ["mercenary", "duelist", "Mercenary · Duelist"],
    ["mercenary", "sellsword", "Mercenary · Sellsword"],
  ])("should title a %s %s as %s", (cls, spec, title) => {
    expect(characterTitle(cls, spec)).toBe(title);
  });

  it("should give no title before the pick", () => {
    expect(characterTitle("warrior", undefined)).toBeUndefined();
  });

  it("should give no title for an id it does not know (§Edge States)", () => {
    expect(characterTitle("warrior", "paladin")).toBeUndefined();
    expect(characterTitle("warrior", "toString")).toBeUndefined();
  });

  it("should give no title for a spec of another class (§Edge States)", () => {
    expect(characterTitle("warrior", "pyromancer")).toBeUndefined();
  });

  it("should name exactly two specs per class, eight in all (§A.1)", () => {
    expect(Object.keys(SPECIALIZATIONS).sort()).toEqual(
      [
        "berserker",
        "duelist",
        "guardian",
        "hunter",
        "pyromancer",
        "sellsword",
        "shadow_ranger",
        "spellwarden",
      ],
    );
    const perClass = Object.values(SPECIALIZATIONS).reduce<Record<string, number>>(
      (n, s) => ({ ...n, [s.class]: (n[s.class] ?? 0) + 1 }),
      {},
    );
    expect(perClass).toEqual({ warrior: 2, mage: 2, archer: 2, mercenary: 2 });
  });
});

describe("classLevelLine: the main menu hero and the character list (FS-E1ZDG §K.40)", () => {
  it("should show the title beside the level for a character with one", () => {
    expect(classLevelLine("warrior", "berserker", 20)).toBe("WARRIOR · BERSERKER • LV.20");
  });

  it("should show the class name alone beside the level before the pick", () => {
    expect(classLevelLine("warrior", undefined, 5)).toBe("WARRIOR • LV.5");
  });

  it("should show the class name for a spec id it does not know", () => {
    expect(classLevelLine("mage", "paladin", 20)).toBe("MAGE • LV.20");
  });

  it("should fall back to the raw class for a class it does not know", () => {
    expect(classLevelLine("bard", undefined, 3)).toBe("BARD • LV.3");
  });
});

describe("nameplateTitle (FS-E1ZDG §K.41, one rule for the three worlds)", () => {
  it("should give the player's title line from the world state", () => {
    expect(nameplateTitle({ class: "warrior", specialization: "berserker" })).toBe("Warrior · Berserker");
    expect(nameplateTitle({ class: "Archer", specialization: "shadow_ranger" })).toBe("Archer · Shadow Ranger");
  });

  it("should give no line before the pick, for an unknown id, or for another class's", () => {
    expect(nameplateTitle({ class: "warrior" })).toBeUndefined();
    expect(nameplateTitle({ class: "warrior", specialization: "paladin" })).toBeUndefined();
    expect(nameplateTitle({ class: "warrior", specialization: "pyromancer" })).toBeUndefined();
  });
});

describe("specializationOf (FS-E1ZDG §Edge States)", () => {
  it("should name a spec of the class", () => {
    expect(specializationOf("archer", "shadow_ranger")).toBe("shadow_ranger");
    expect(specializationOf("ARCHER", "hunter")).toBe("hunter");
  });

  it("should name none for no spec, an unknown id, or another class's", () => {
    expect(specializationOf("archer", undefined)).toBeUndefined();
    expect(specializationOf("archer", "constructor")).toBeUndefined();
    expect(specializationOf("archer", "berserker")).toBeUndefined();
  });
});
