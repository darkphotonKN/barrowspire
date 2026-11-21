import { describe, expect, it } from "vitest";
import type { AbilityBarView } from "./abilityBarView";
import { abilityBarFrame } from "./abilityBarLayout";
import { ABILITY_TIP_MAX_W, abilityTip, abilityTipPlace } from "./abilityBarTip";

// FS-Q18Q3 §F R28, §L R40: which tooltip a hovered square shows, its words looked up on the UI side from the
// keys the bar's view carries, and its place over the square, kept inside the view

const VIEW: AbilityBarView = {
  potion: { count: 2, greyed: false, field: false },
  ability: { icon: "dash", greyed: false, active: false, cost: 25 },
  tree: { locked: true, ability: "earthbreaker", greyed: true, cost: null },
  costChannel: "stamina",
  cooldowns: { ability: null, tree: null },
};
const view = (fields: Partial<AbilityBarView> = {}): AbilityBarView => ({ ...VIEW, ...fields });

describe("abilityTip: the potion square (R28)", () => {
  it("should say in a field that potions are drunk only in the Spire", () => {
    expect(abilityTip("potion", view({ potion: { count: 2, greyed: true, field: true } }))).toEqual({
      name: "Health Potion",
      line: "Drink to heal at once, from your first potion slot.",
      note: "Potions are drunk only in the Spire.",
    });
  });

  it("should say none is worn at 0", () => {
    expect(abilityTip("potion", view({ potion: { count: 0, greyed: true, field: false } }))?.note).toBe("No health potion worn.");
  });

  it("should say the field's line over the empty one in a field with none worn", () => {
    expect(abilityTip("potion", view({ potion: { count: 0, greyed: true, field: true } }))?.note).toBe(
      "Potions are drunk only in the Spire.",
    );
  });

  it("should carry no third line with a potion worn in a run, greyed (held) or not", () => {
    expect(abilityTip("potion", VIEW)?.note).toBeUndefined();
    expect(abilityTip("potion", view({ potion: { count: 1, greyed: true, field: false } }))?.note).toBeUndefined();
  });
});

describe("abilityTip: the right-click square (R28, R27)", () => {
  it.each([
    ["dash", "Dash", "Charge a short way toward the cursor."],
    ["triple_fireball", "Triple Fireball", "Hurl three fireballs in a spread toward the cursor."],
    ["shadow_shot", "Heavy Shot", "Hold to aim, release to loose one slow, heavy bolt."],
    ["parry", "Parry", "Turn a blow as it lands for a parry charge. At three, the cut ripostes."],
  ] as const)("should read the %s row of the ability copy", (icon, name, line) => {
    expect(abilityTip("ability", view({ ability: { ...VIEW.ability, icon } }))).toEqual({ name, line });
  });

  it("should name the archer's shot by the specialization the view carries (FS-E1ZDG §L.43)", () => {
    const shot = (specialization?: string) =>
      abilityTip("ability", view({ ability: { ...VIEW.ability, icon: "shadow_shot", ...(specialization && { specialization }) } }))?.name;
    expect(shot()).toBe("Heavy Shot");
    expect(shot("hunter")).toBe("Heavy Shot");
    expect(shot("shadow_ranger")).toBe("Shadow Shot");
  });

  it("should give a Duelist's parry the two-charge line (FS-E1ZDG §L.46)", () => {
    expect(abilityTip("ability", view({ ability: { ...VIEW.ability, icon: "parry", specialization: "duelist" } }))).toEqual({
      name: "Parry",
      line: "Turn a blow as it lands for a parry charge. At two, the cut ripostes.",
    });
  });

  it("should give a Sellsword's parry the sharpening line (FS-E1ZDG §L.46)", () => {
    expect(abilityTip("ability", view({ ability: { ...VIEW.ability, icon: "parry", specialization: "sellsword" } }))).toEqual({
      name: "Parry",
      line: "Turn a blow as it lands for a parry charge. Each one held sharpens the cut.",
    });
  });

  it("should show the tooltip of a greyed square too", () => {
    expect(abilityTip("ability", view({ ability: { ...VIEW.ability, greyed: true } }))?.name).toBe("Dash");
  });

  it("should show none for a class with no row", () => {
    expect(abilityTip("ability", view({ ability: { icon: null, greyed: false, active: false, cost: null } }))).toBeNull();
  });
});

describe("abilityTip: the 3 square (R28; FS-04EEA R50)", () => {
  const LOCKED_NOTE = "Learned at the skill tree's third tier, from level 10.";
  const tree = (fields: Partial<AbilityBarView["tree"]>) => view({ tree: { ...VIEW.tree, ...fields } });

  it.each([
    ["earthbreaker", "Earthbreaker", "Slam the ground: strike and stun all around you."],
    ["blink", "Blink", "Step through the dark toward where you point, never past a wall."],
    ["arrow_rain", "Arrow Rain", "Hold to mark the ground, release to rain arrows on it."],
    ["settle_the_debt", "Settle the Debt", "Spend every parry charge on a flurry around you; each one cuts deeper."],
  ] as const)("should read the class's %s name and line, held, greyed or lit", (ability, name, line) => {
    expect(abilityTip("tree", tree({ locked: false, ability, greyed: false, cost: 40 }))).toEqual({ name, line });
    expect(abilityTip("tree", tree({ locked: false, ability, greyed: true, cost: 40 }))).toEqual({ name, line });
  });

  it("should read the same name and line locked, with the locked third line under them", () => {
    expect(abilityTip("tree", VIEW)).toEqual({
      name: "Earthbreaker",
      line: "Slam the ground: strike and stun all around you.",
      note: LOCKED_NOTE,
    });
  });

  it("should read only the locked third line for a class with no tree ability, and nothing held (R27)", () => {
    expect(abilityTip("tree", tree({ ability: null }))).toEqual({ note: LOCKED_NOTE });
    expect(abilityTip("tree", tree({ locked: false, ability: null, greyed: true }))).toBeNull();
  });
});

describe("abilityTipPlace (R28)", () => {
  const screen = { width: 1080, height: 720 };
  const bar = abilityBarFrame(screen);

  it("should centre the tooltip over its square, its foot over the bar's top", () => {
    const at = abilityTipPlace(bar, "ability", { width: 200, height: 60 }, screen);
    const well = bar.squares.ability.well;
    expect(at.x + 100).toBe(well.x + well.width / 2);
    expect(at.y + 60).toBeLessThan(bar.top);
  });

  it("should keep a tooltip over the right-hand square inside the view at 1080", () => {
    const at = abilityTipPlace(bar, "tree", { width: ABILITY_TIP_MAX_W, height: 80 }, screen);
    expect(at.x).toBeGreaterThanOrEqual(0);
    expect(at.x + ABILITY_TIP_MAX_W).toBeLessThanOrEqual(1080);
    expect(at.y).toBeGreaterThanOrEqual(0);
  });

  it("should hold a tooltip that would cross the view's edge inside it", () => {
    const narrow = { width: 200, height: 160 };
    const f = abilityBarFrame(narrow);
    const right = abilityTipPlace(f, "tree", { width: ABILITY_TIP_MAX_W - 60, height: 300 }, narrow);
    expect(right.x + ABILITY_TIP_MAX_W - 60).toBeLessThanOrEqual(200);
    expect(right.y).toBeGreaterThanOrEqual(0);
    const left = abilityTipPlace(f, "potion", { width: ABILITY_TIP_MAX_W - 60, height: 40 }, narrow);
    expect(left.x).toBeGreaterThanOrEqual(0);
  });

  it("should stand on whole pixels", () => {
    const at = abilityTipPlace(bar, "potion", { width: 151, height: 47 }, screen);
    expect(Number.isInteger(at.x) && Number.isInteger(at.y)).toBe(true);
  });
});
