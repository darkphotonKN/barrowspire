import { describe, expect, it } from "vitest";
import type { ClientGameState, EquipmentState, ItemState, PlayerState, ResourceState } from "@/types/gameState";
import {
  abilityBar,
  abilityGreyed,
  parryRefused,
  runOwnHud,
  type AbilityBarContext,
} from "./abilityBarView";
import { abilityAffordable } from "./resources";

// FS-Q18Q3 §E R22–R25, R27, §G R29–R30, §L R40: the bar's view, judged on the world's side from its state
// and what only its combat knows, handed to the UI scene as plain data

const stamina = (current: number, ability_cost = 25): ResourceState => ({ kind: "stamina", current, max: 100, ability_cost });

const health = { item_id: "i", entity_id: "e", name: "Lesser Heal Potion", quantity: 1, item_type: "consumable", healing_amount: 25 } as ItemState;
const equipment = (potions: number): EquipmentState =>
  ({
    weapon: null,
    head: null,
    chest: null,
    gloves: null,
    legs: null,
    ring_1: null,
    ring_2: null,
    consumable_1: potions > 0 ? health : null,
    consumable_2: potions > 1 ? health : null,
    consumable_3: potions > 2 ? health : null,
  }) as EquipmentState;

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

type BarState = Pick<ClientGameState, "world_type" | "current_player">;
const run = (fields: Partial<PlayerState> = {}): BarState => ({ world_type: "run", current_player: me(fields) });
const field = (fields: Partial<PlayerState> = {}): BarState => ({ world_type: "field", current_player: me(fields) });
const inRun: AbilityBarContext = { world: "run", lockedOut: false, aiming: false };
const inField: AbilityBarContext = { ...inRun, world: "field" };

describe("abilityGreyed (FS-8AY7S req 31; FS-JTNPR req 18)", () => {
  it("should grey exactly where the pool cannot pay, for every value", () => {
    for (let current = 0; current <= 100; current++) {
      const resource = stamina(current, 40);
      expect(abilityGreyed(resource, false)).toBe(!abilityAffordable(resource));
    }
  });

  it("should grey while the lockout runs, never by cost with no resource or a cost of 0", () => {
    expect(abilityGreyed(stamina(100), true)).toBe(true);
    expect(abilityGreyed(undefined, false)).toBe(false);
    expect(abilityGreyed({ kind: "parry_charges", current: 0, max: 3, ability_cost: 0 }, false)).toBe(false);
  });
});

describe("parryRefused (FS-MAMHR req 35, 37)", () => {
  it.each([
    ["the stance is open", { parry_open: true, parry_lockout: 0 }, true],
    ["the whiff lockout runs", { parry_open: false, parry_lockout: 0.98333 }, true],
    ["the stance is down and no lockout runs", { parry_open: false, parry_lockout: 0 }, false],
    ["the fields are absent (another class)", {}, false],
  ])("should judge a parry refused when %s", (_, fields, refused) => {
    expect(parryRefused(me({ class: "mercenary", ...fields }))).toBe(refused);
  });

  it("should refuse nothing before the first state", () => {
    expect(parryRefused(undefined)).toBe(false);
  });
});

describe("abilityBar: when it is up (FS-Q18Q3 §G R29, R30)", () => {
  it("should be up in a run and a field from the first state", () => {
    expect(abilityBar(run(), inRun)).not.toBeNull();
    expect(abilityBar(field(), inField)).not.toBeNull();
  });

  it("should be down in the hub and before the first state", () => {
    expect(abilityBar({ world_type: "hub", current_player: me() }, inRun)).toBeNull();
    expect(abilityBar({ world_type: "run", current_player: null }, inRun)).toBeNull();
  });

  it("should be down while a field's player lies fallen, as the bars are", () => {
    expect(abilityBar(field({ current_health: 0 }), inField)).toBeNull();
  });

  it("should be plain data: it survives a JSON round trip unchanged (R40)", () => {
    const view = abilityBar(run({ ability_cooldown: { remaining: 0.2, total: 0.4 } }), inRun);
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });
});

describe("abilityBar: the right-click square (FS-Q18Q3 §E R22, R23, R27)", () => {
  it.each([
    ["warrior", "dash"],
    ["mage", "triple_fireball"],
    ["archer", "shadow_shot"],
    ["mercenary", "parry"],
  ] as const)("should show the %s's icon", (cls, icon) => {
    expect(abilityBar(run({ class: cls }), inRun)?.ability.icon).toBe(icon);
  });

  it("should carry the specialization beside the icon as the copy key (FS-E1ZDG §L.43)", () => {
    expect(abilityBar(run({ class: "archer", specialization: "shadow_ranger" }), inRun)?.ability.specialization).toBe("shadow_ranger");
    expect(abilityBar(run({ class: "archer" }), inRun)?.ability).not.toHaveProperty("specialization");
  });

  it("should show an empty well for a class with no row (R27)", () => {
    expect(abilityBar(run({ class: "necromancer" }), inRun)?.ability.icon).toBeNull();
  });

  it("should grey one short of the cost, and light it at the cost", () => {
    expect(abilityBar(run({ resource: stamina(24) }), inRun)?.ability.greyed).toBe(true);
    expect(abilityBar(run({ resource: stamina(25) }), inRun)?.ability.greyed).toBe(false);
  });

  it("should grey while the server's cooldown runs, and light it at 0", () => {
    expect(abilityBar(run({ ability_cooldown: { remaining: 0.1, total: 0.4 } }), inRun)?.ability.greyed).toBe(true);
    expect(abilityBar(run({ ability_cooldown: { remaining: 0, total: 0 } }), inRun)?.ability.greyed).toBe(false);
  });

  it("should grey while the client's lockout runs, the cooldown not yet on the wire", () => {
    expect(abilityBar(run(), { ...inRun, lockedOut: true })?.ability.greyed).toBe(true);
  });

  it("should grey a parry the server would refuse", () => {
    const merc = (fields: Partial<PlayerState>) =>
      run({ class: "mercenary", resource: { kind: "parry_charges", current: 0, max: 3, ability_cost: 0 }, ...fields });
    expect(abilityBar(merc({ parry_lockout: 0.5 }), inRun)?.ability.greyed).toBe(true);
    expect(abilityBar(merc({ parry_lockout: 0 }), inRun)?.ability.greyed).toBe(false);
  });

  it("should be active while the archer holds Shadow Shot, and while the merc's stance is open (R23)", () => {
    expect(abilityBar(run({ class: "archer" }), { ...inRun, aiming: true })?.ability.active).toBe(true);
    expect(abilityBar(run({ class: "archer" }), inRun)?.ability.active).toBe(false);
    expect(abilityBar(run({ class: "mercenary", parry_open: true }), inRun)?.ability).toMatchObject({ active: true, greyed: true });
  });

  it("should be active and greyed together for a hold the pool cannot pay for", () => {
    const view = abilityBar(run({ class: "archer", resource: stamina(10, 90) }), { ...inRun, aiming: true });
    expect(view?.ability).toMatchObject({ active: true, greyed: true });
  });

  it("should carry the cost and its channel, none for a cost of 0 or no resource (R15)", () => {
    expect(abilityBar(run(), inRun)).toMatchObject({ ability: { cost: 25 }, costChannel: "stamina" });
    expect(abilityBar(run({ resource: { kind: "mana", current: 50, max: 100, ability_cost: 30 } }), inRun)?.costChannel).toBe("mana");
    expect(abilityBar(run({ resource: { kind: "parry_charges", current: 1, max: 3, ability_cost: 0 } }), inRun)).toMatchObject({
      ability: { cost: null },
      costChannel: "parry",
    });
    expect(abilityBar(run({ resource: undefined }), inRun)).toMatchObject({ ability: { cost: null, greyed: false }, costChannel: null });
  });

  it("should carry an unknown resource kind's costs in the unknown channel", () => {
    const odd = { kind: "fury", current: 5, max: 10, ability_cost: 3 } as unknown as ResourceState;
    expect(abilityBar(run({ resource: odd }), inRun)?.costChannel).toBe("unknown");
  });

  it("should carry the cooldowns as the state carried them, none from an older server (R40)", () => {
    const cd = { remaining: 0.3, total: 0.4 };
    expect(abilityBar(run({ ability_cooldown: cd }), inRun)?.cooldowns).toEqual({ ability: cd, tree: null });
    expect(abilityBar(run(), inRun)?.cooldowns).toEqual({ ability: null, tree: null });
  });
});

describe("abilityBar: the potion square (FS-Q18Q3 §E R24, §G R29)", () => {
  it.each([0, 1, 2, 3])("should count %i health potions worn", (n) => {
    expect(abilityBar(run({ equipment: equipment(n) }), inRun)?.potion).toEqual({ count: n, greyed: n === 0, field: false });
  });

  it("should read 0, greyed, with no equipment on the wire", () => {
    expect(abilityBar(run(), inRun)?.potion).toEqual({ count: 0, greyed: true, field: false });
  });

  it("should always be greyed in a field, where nothing is drunk, and say it is in a field (R28)", () => {
    expect(abilityBar(field({ equipment: equipment(3) }), inField)?.potion).toEqual({ count: 3, greyed: true, field: true });
  });
});

describe("abilityBar: the 3 square, locked (FS-Q18Q3 §E R25)", () => {
  it("should be locked with no tree_ability_cooldown on the wire, a tree_ability_cost beside it or not", () => {
    expect(abilityBar(run(), inRun)?.tree).toEqual({ locked: true });
    expect(abilityBar(run({ resource: { ...stamina(100), tree_ability_cost: 40 } }), inRun)?.tree).toEqual({ locked: true });
  });
});

// FS-Q18Q3 §G R30 and FS-QPDKN § Change: The party death flow and the spectate switcher, R168: out of the
// delve the run's own bars and the bar beside them are held as the resolving state drew them
describe("runOwnHud (FS-QPDKN R168; FS-Q18Q3 R30)", () => {
  const fills = (hud: ReturnType<typeof runOwnHud>) => hud.bars.map((b) => [b.channel, b.fill]);

  it("should be hudBars and the live bar while the player is in the delve", () => {
    const state = run({ current_health: 50, equipment: equipment(2) });
    const hud = runOwnHud(state, undefined, { ...inRun, aiming: true });
    expect(fills(hud)).toEqual([
      ["health", 0.5],
      ["stamina", 1],
    ]);
    expect(hud.bar).toEqual(abilityBar(state, { ...inRun, aiming: true }));
  });

  it.each([
    ["dead", { current_health: 0 }, 0],
    ["escaped", { escape: true }, 1],
  ] as const)("should hold a %s player's bar with every square greyed, the count and costs as that state had them", (_, fields, fill) => {
    const hud = runOwnHud(run({ ...fields, class: "archer", equipment: equipment(2), ability_cooldown: { remaining: 0.5, total: 1.2 } }), undefined, {
      ...inRun,
      aiming: true,
    });
    expect(fills(hud)[0]).toEqual(["health", fill]);
    expect(hud.bar).toEqual({
      potion: { count: 2, greyed: true, field: false },
      ability: { icon: "shadow_shot", greyed: true, active: false, cost: 25 },
      tree: { locked: true },
      costChannel: "stamina",
      cooldowns: { ability: null, tree: null },
    });
  });

  it("should give back what is held, whatever the state says", () => {
    const held = runOwnHud(run({ current_health: 0, equipment: equipment(1) }), undefined, inRun);
    expect(runOwnHud(run({ current_health: 120 }), held, inRun)).toBe(held);
    expect(runOwnHud({ world_type: "run", current_player: null }, held, inRun)).toBe(held);
  });

  it("should draw nothing in the hub, nor before the first state", () => {
    expect(runOwnHud({ world_type: "hub", current_player: me({ current_health: 0 }) }, undefined, inRun)).toEqual({ bars: [], bar: null });
    expect(runOwnHud({ world_type: "run", current_player: null }, undefined, inRun)).toEqual({ bars: [], bar: null });
  });
});
