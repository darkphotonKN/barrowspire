import { describe, expect, it } from "vitest";
import { SPECIALIZATIONS, characterTitle, classLevelLine, nameplateTitle, roleName, specializationOf } from "./specializations";

describe("roleName: the one name a role is shown by (FS-E1ZDG §Change: The specialization name replaces the class name, N1)", () => {
  it.each([
    ["warrior", "guardian", "Guardian"],
    ["warrior", "berserker", "Berserker"],
    ["mage", "spellwarden", "Spellwarden"],
    ["mage", "pyromancer", "Pyromancer"],
    ["archer", "hunter", "Hunter"],
    ["archer", "shadow_ranger", "Shadow Ranger"],
    ["mercenary", "duelist", "Duelist"],
    ["mercenary", "sellsword", "Sellsword"],
  ])("should name a %s holding %s by the spec alone, %s", (cls, spec, name) => {
    expect(roleName(cls, spec)).toBe(name);
  });

  it("should name a character by its class before the pick (N5)", () => {
    expect(roleName("warrior", undefined)).toBe("Warrior");
    expect(roleName("Archer", undefined)).toBe("Archer");
  });

  it("should name a character by its class for an id it does not know (§Edge States)", () => {
    expect(roleName("warrior", "paladin")).toBe("Warrior");
    expect(roleName("warrior", "toString")).toBe("Warrior");
  });

  it("should name a character by its class for a spec of another class (§Edge States)", () => {
    expect(roleName("warrior", "pyromancer")).toBe("Warrior");
  });

  it("should name a class it does not know by its key in title case", () => {
    expect(roleName("bard", undefined)).toBe("Bard");
  });
});

describe("characterTitle: the spec name alone, once specialized (N2)", () => {
  it("should be the spec's name, with no class word and no middle dot", () => {
    expect(characterTitle("warrior", "berserker")).toBe("Berserker");
    expect(characterTitle("archer", "shadow_ranger")).toBe("Shadow Ranger");
    expect(characterTitle("mercenary", "sellsword")).not.toContain("·");
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

describe("classLevelLine: the main menu hero and the character list (FS-E1ZDG §K.40, N3)", () => {
  it("should show the spec name alone beside the level once specialized (N3)", () => {
    expect(classLevelLine("warrior", "berserker", 20)).toBe("BERSERKER • LV.20");
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

describe("nameplateTitle (FS-E1ZDG §K.41, N3: one rule for the three worlds)", () => {
  it("should give the player's title line, the spec name alone, from the world state", () => {
    expect(nameplateTitle({ class: "warrior", specialization: "berserker" })).toBe("Berserker");
    expect(nameplateTitle({ class: "Archer", specialization: "shadow_ranger" })).toBe("Shadow Ranger");
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
