import { describe, expect, it } from "vitest";
import { abilityCopy } from "./abilityCopy";

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

  it("should keep the class's row for another class's spec or an id it does not know", () => {
    expect(abilityCopy("warrior", "shadow_ranger")?.name).toBe("Dash");
    expect(abilityCopy("archer", "berserker")?.name).toBe("Heavy Shot");
    expect(abilityCopy("archer", "paladin")?.name).toBe("Heavy Shot");
  });
});
