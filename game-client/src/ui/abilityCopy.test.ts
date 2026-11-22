import { describe, expect, it } from "vitest";
import { abilityCopy, treeAbilityCopy } from "./abilityCopy";

// FS-8AY7S req 30, FS-Q18Q3 R28: each class's right-click copy; FS-E1ZDG §L.43: looked up by class and
// specialization, the archer's shot "Heavy Shot" for every archer but a Shadow Ranger

describe("abilityCopy (FS-8AY7S req 30; FS-E1ZDG §L.43)", () => {
  it.each([
    ["warrior", "Dash"],
    ["mage", "Triple Fireball"],
    ["archer", "Heavy Shot"],
    ["mercenary", "Parry"],
  ])("should name the %s's ability", (cls, name) => {
    expect(abilityCopy(cls)?.name).toBe(name);
  });

  it("should read the class whatever its case, and have no row for an unknown one", () => {
    expect(abilityCopy("Mage")?.name).toBe("Triple Fireball");
    for (const cls of ["necromancer", "constructor", "", undefined]) expect(abilityCopy(cls)).toBeNull();
  });

  it("should name an unspecialized archer's and a Hunter's shot Heavy Shot", () => {
    expect(abilityCopy("archer", undefined)?.name).toBe("Heavy Shot");
    expect(abilityCopy("archer", "hunter")?.name).toBe("Heavy Shot");
  });

  it("should name a Shadow Ranger's shot Shadow Shot, its line unchanged", () => {
    expect(abilityCopy("archer", "shadow_ranger")).toEqual({
      name: "Shadow Shot",
      line: abilityCopy("archer")?.line,
    });
    expect(abilityCopy("Archer", "shadow_ranger")?.name).toBe("Shadow Shot");
  });

  it("should give a Duelist's parry the two-charge line, its name unchanged (FS-E1ZDG §L.46)", () => {
    expect(abilityCopy("mercenary", "duelist")).toEqual({
      name: "Parry",
      line: "Turn a blow as it lands for a parry charge. At two, the cut ripostes.",
    });
    expect(abilityCopy("mercenary")?.line).toBe(
      "Turn a blow as it lands for a parry charge. At three, the cut ripostes.",
    );
  });

  it("should give a Sellsword's parry the sharpening line, its name unchanged (FS-E1ZDG §L.46)", () => {
    expect(abilityCopy("mercenary", "sellsword")).toEqual({
      name: "Parry",
      line: "Turn a blow as it lands for a parry charge. Each one held sharpens the cut.",
    });
  });

  it("should keep the class's row for another class's spec or an id it does not know", () => {
    expect(abilityCopy("warrior", "shadow_ranger")?.name).toBe("Dash");
    expect(abilityCopy("archer", "berserker")?.name).toBe("Heavy Shot");
    expect(abilityCopy("archer", "paladin")?.name).toBe("Heavy Shot");
  });
});

// FS-04EEA R50: each class's tree ability, its name and one line, for FS-Q18Q3's tooltip on the key-3 square
describe("treeAbilityCopy (FS-04EEA R50)", () => {
  it.each([
    ["warrior", "Earthbreaker", "Slam the ground: strike and stun all around you."],
    ["mage", "Blink", "Step through the dark toward where you point, never past a wall."],
    ["archer", "Arrow Rain", "Hold to mark the ground, release to rain arrows on it."],
    ["mercenary", "Settle the Debt", "Spend every parry charge on a flurry around you; each one cuts deeper."],
  ])("should name the %s's tree ability and say how it works", (cls, name, line) => {
    expect(treeAbilityCopy(cls)).toEqual({ name, line });
  });

  it("should read the class whatever its case, and have no row for an unknown one", () => {
    expect(treeAbilityCopy("Mage")?.name).toBe("Blink");
    for (const cls of ["necromancer", "constructor", "", undefined]) expect(treeAbilityCopy(cls)).toBeNull();
  });
});
