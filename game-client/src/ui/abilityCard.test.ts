import { describe, expect, it } from "vitest";
import type { ClientGameState, PlayerState, ResourceState } from "@/types/gameState";
import { abilityCard, abilityCopy, abilityGreyed, parryRefused } from "./abilityCard";
import { abilityAffordable } from "./resources";

const stamina = (current: number, ability_cost = 25): ResourceState => ({
  kind: "stamina",
  current,
  max: 100,
  ability_cost,
});

function me(fields: Partial<PlayerState> = {}): PlayerState {
  return {
    id: "me",
    entity_id: "e-me",
    username: "Aldric",
    class: "warrior",
    position: { x: 0, y: 0 },
    direction: { vx: 0, vy: 0, speed: 0 },
    escape: false,
    current_health: 100,
    max_health: 100,
    resource: stamina(100),
    ...fields,
  };
}

type CardState = Pick<ClientGameState, "world_type" | "current_player">;
const run = (fields: Partial<PlayerState> = {}): CardState =>
  ({ world_type: "run", current_player: me(fields) }) as CardState;
const clear = { lockedOut: false, leaveUp: false };

describe("abilityCopy (FS-8AY7S req 30)", () => {
  it.each([
    ["warrior", "Dash", "Charge a short way toward the cursor."],
    ["mage", "Triple Fireball", "Hurl three fireballs in a spread toward the cursor."],
    ["archer", "Shadow Shot", "Hold to aim, release to loose one slow, heavy bolt."],
    [
      "mercenary",
      "Parry",
      "Turn a blow as it lands for a parry charge. At three, the cut ripostes.",
    ],
  ])("should name the %s's ability and say how it works", (cls, name, line) => {
    expect(abilityCopy(cls)).toEqual({ name, line });
  });

  it("should read the class whatever its case", () => {
    expect(abilityCopy("Mage")?.name).toBe("Triple Fireball");
  });

  it.each([["necromancer"], [""], [undefined]])(
    "should have no row for the class %j",
    (cls) => {
      expect(abilityCopy(cls)).toBeNull();
    },
  );
});

describe("abilityGreyed against abilityAffordable (FS-8AY7S req 31; FS-JTNPR req 18)", () => {
  it("should grey the card exactly where the pool cannot pay, for every value", () => {
    for (let current = 0; current <= 100; current++) {
      const resource = stamina(current, 40);
      expect(abilityGreyed(resource, false)).toBe(!abilityAffordable(resource));
    }
  });
});

describe("abilityGreyed (FS-8AY7S req 31)", () => {
  it("should grey a card whose ability the pool cannot pay for", () => {
    expect(abilityGreyed(stamina(24), false)).toBe(true);
  });

  it("should light it at exactly the cost", () => {
    expect(abilityGreyed(stamina(25), false)).toBe(false);
  });

  it("should grey it while the cast lockout runs, however full the pool", () => {
    expect(abilityGreyed(stamina(100), true)).toBe(true);
  });

  it("should never grey by cost with no resource on the wire", () => {
    expect(abilityGreyed(undefined, false)).toBe(false);
    expect(abilityGreyed(undefined, true)).toBe(true);
  });

  it("should never grey by cost an ability that costs nothing", () => {
    expect(abilityGreyed({ kind: "parry_charges", current: 0, max: 3, ability_cost: 0 }, false)).toBe(false);
  });
});

describe("abilityCard (FS-8AY7S req 29–32)", () => {
  it("should show the player's class card, lit, in a run", () => {
    expect(abilityCard(run({ class: "mage" }), clear)).toEqual({
      name: "Triple Fireball",
      line: "Hurl three fireballs in a spread toward the cursor.",
      greyed: false,
    });
  });

  it("should grey it when the pool falls short of the cost", () => {
    expect(abilityCard(run({ resource: stamina(24) }), clear)?.greyed).toBe(true);
  });

  it("should grey it during the lockout and light it after", () => {
    const state = run();
    expect(abilityCard(state, { ...clear, lockedOut: true })?.greyed).toBe(true);
    expect(abilityCard(state, clear)?.greyed).toBe(false);
  });

  it("should show it lit with no resource on the wire", () => {
    expect(abilityCard(run({ resource: undefined }), clear)?.greyed).toBe(false);
  });

  it("should show no card for a class with no row", () => {
    expect(abilityCard(run({ class: "necromancer" }), clear)).toBeNull();
  });

  it("should show no card in the hub", () => {
    expect(abilityCard({ ...run(), world_type: "hub" }, clear)).toBeNull();
  });

  it("should show no card before the first state", () => {
    expect(abilityCard({ world_type: "run" } as CardState, clear)).toBeNull();
  });

  it.each([
    ["dead", { current_health: 0 }],
    ["escaped", { escape: true }],
  ])("should show no card once the player is %s", (_, fields) => {
    expect(abilityCard(run(fields), clear)).toBeNull();
  });

  it("should give the corner to the leave button whenever it is up", () => {
    expect(abilityCard(run(), { ...clear, leaveUp: true })).toBeNull();
  });
});

describe("parryRefused (FS-MAMHR req 35, 37)", () => {
  it.each([
    ["the stance is open", { parry_open: true, parry_lockout: 0 }, true],
    ["the whiff lockout runs", { parry_open: false, parry_lockout: 0.98333 }, true],
    ["the lockout is all but over", { parry_open: false, parry_lockout: 0.001 }, true],
    ["the stance is down and no lockout runs", { parry_open: false, parry_lockout: 0 }, false],
    ["the fields are absent (another class)", {}, false],
  ])("should judge a parry refused when %s: %s", (_, fields, refused) => {
    expect(parryRefused(me({ class: "mercenary", ...fields }))).toBe(refused);
  });

  it("should refuse nothing before the first state", () => {
    expect(parryRefused(undefined)).toBe(false);
  });
});

describe("abilityCard for the Mercenary (FS-MAMHR req 37)", () => {
  const parryCharges = (current: number): ResourceState => ({ kind: "parry_charges", current, max: 3, ability_cost: 0 });
  const merc = (fields: Partial<PlayerState> = {}) =>
    run({ class: "mercenary", resource: parryCharges(0), parry_open: false, parry_lockout: 0, parries: 0, ...fields });

  it("should name Parry, lit, with the stance down and no lockout", () => {
    expect(abilityCard(merc(), clear)).toMatchObject({ name: "Parry", greyed: false });
  });

  it("should grey it while parry_lockout is above 0, and light it once it reaches 0", () => {
    expect(abilityCard(merc({ parry_lockout: 0.98333 }), clear)?.greyed).toBe(true);
    expect(abilityCard(merc({ parry_lockout: 0 }), clear)?.greyed).toBe(false);
  });

  it("should grey it while the stance is open (a parry then is refused)", () => {
    expect(abilityCard(merc({ parry_open: true }), clear)?.greyed).toBe(true);
  });

  it("should never grey it by cost, at any parry charge count", () => {
    for (let current = 0; current <= 3; current++)
      expect(abilityCard(merc({ resource: parryCharges(current) }), clear)?.greyed).toBe(false);
  });
});
