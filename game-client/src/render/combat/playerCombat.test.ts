import { describe, expect, it, vi } from "vitest";
import { ActionType } from "@/assets/types/client";
import { CHARGE_MS } from "@/render/effects/charge";
import { SHADOW_SHOT_COOLDOWN_MS, SHADOW_SHOT_MIN_HOLD_MS } from "@/scenes/shadowShotAim";
import type { ResourceState } from "@/types/gameState";
import {
  PRIMARY_COOLDOWN_MS,
  PlayerCombat,
  SPECIAL_COOLDOWN_MS,
  STRIKE_COOLDOWN_MS,
  STRIKE_RANGE,
  type CombatLook,
  type CombatSelf,
} from "./playerCombat";

/**
 * A combat with its sends, its effects and its clock recorded; `elapse` runs what is due. `me` is
 * this client's player as the latest state reports them, which the kit's gates read.
 */
function combatOnStage(me: ReturnType<CombatSelf> = undefined) {
  const send = vi.fn();
  const castSent = vi.fn();
  const timers: { at: number; fn: () => void }[] = [];
  let now = 0;
  const look: { [K in keyof Required<CombatLook>]: ReturnType<typeof vi.fn> } = {
    slash: vi.fn(),
    dash: vi.fn(),
    arrow: vi.fn(),
    fireball: vi.fn(),
    cut: vi.fn(),
    riposte: vi.fn(),
    parry: vi.fn(),
    shadowShot: vi.fn(),
    aim: vi.fn(),
    endAim: vi.fn(),
    attackClip: vi.fn(),
    abilityChanged: vi.fn(),
    abilityCast: vi.fn(),
    earthbreaker: vi.fn(),
    blink: vi.fn(),
    settleTheDebt: vi.fn(),
    rainAim: vi.fn(),
    endRainAim: vi.fn(),
    arrowRain: vi.fn(),
  };
  const self = { me };
  const combat = new PlayerCombat(
    { sendMessage: send, later: (ms, fn) => timers.push({ at: now + ms, fn }), now: () => now, castSent },
    look,
    () => self.me,
  );
  const elapse = (ms: number) => {
    now += ms;
    for (const t of timers.splice(0).filter((t) => t.at <= now || !timers.push(t))) t.fn();
  };
  return { combat, send, look, elapse, self, castSent };
}

const me = { x: 100, y: 100 };

describe("PlayerCombat strike (FS-77AB6 req 39; FS-X2F2H §Requirements 56)", () => {
  it("should send attack with the monster's entity id, swing and play the attack clip, within reach", () => {
    const { combat, send, look } = combatOnStage();

    expect(combat.strike(me, "boar-1", { x: 140, y: 100 })).toBe(true);

    expect(send).toHaveBeenCalledWith(ActionType.Attack, { enemy_entity_id: "boar-1" });
    expect(look.slash).toHaveBeenCalledWith(me, { x: 140, y: 100 });
    expect(look.attackClip).toHaveBeenCalledWith({ x: 40, y: 0 });
  });

  it("should not swing at a monster out of reach", () => {
    const { combat, send } = combatOnStage();

    expect(combat.strike(me, "boar-1", { x: 100 + STRIKE_RANGE + 1, y: 100 })).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("should strike once per cooldown, and again once it has passed", () => {
    const { combat, send, elapse } = combatOnStage();
    combat.strike(me, "boar-1", me);
    combat.strike(me, "boar-1", me);
    expect(send).toHaveBeenCalledTimes(1);

    elapse(STRIKE_COOLDOWN_MS);
    combat.strike(me, "boar-1", me);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("should be ready again at once after a reset", () => {
    const { combat, send } = combatOnStage();
    combat.strike(me, "boar-1", me);
    combat.reset();
    combat.strike(me, "boar-1", me);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe("PlayerCombat cast (FS-2325V §E.4; FS-KYPQ9 §D)", () => {
  it("should slash a warrior's primary toward the pointer, clamped to the blade's reach", () => {
    const { combat, send, look } = combatOnStage();

    combat.cast("primary", "warrior", me, { x: 300, y: 100 });

    expect(send).toHaveBeenCalledWith(ActionType.CastSkill, { skill_id: "slash", target_x: 150, target_y: 100 });
    expect(look.slash).toHaveBeenCalledWith(me, { x: 150, y: 100 });
    expect(look.attackClip).toHaveBeenCalledWith({ x: 200, y: 0 }, undefined);
  });

  it.each([
    ["archer", "arrow", "arrow"],
    ["mage", "fireball", "fireball"],
  ] as const)("should loose a %s's primary at the pointer", (cls, skill, effect) => {
    const { combat, send, look } = combatOnStage();
    const target = { x: 400, y: 260 };

    combat.cast("primary", cls, me, target);

    expect(send).toHaveBeenCalledWith(ActionType.CastSkill, { skill_id: skill, target_x: 400, target_y: 260 });
    expect(look[effect]).toHaveBeenCalledWith(me, target);
  });

  it.each([
    ["warrior", "dash", "dash", { charge: true, holdMs: CHARGE_MS }],
    ["mage", "triple_fireball", "fireball", undefined],
  ] as const)("should cast a %s's special, %s", (cls, skill, effect, hold) => {
    const { combat, send, look } = combatOnStage();
    const target = { x: 220, y: 40 };

    combat.cast("special", cls, me, target);

    expect(send).toHaveBeenCalledWith(ActionType.CastSkill, { skill_id: skill, target_x: 220, target_y: 40 });
    expect(look[effect]).toHaveBeenCalledWith(me, target);
    expect(look.attackClip).toHaveBeenCalledWith({ x: 120, y: -60 }, hold);
  });

  it.each([
    ["primary", PRIMARY_COOLDOWN_MS],
    ["special", SPECIAL_COOLDOWN_MS],
  ] as const)("should hold every cast for the %s cooldown", (button, cooldown) => {
    const { combat, send, elapse } = combatOnStage();
    combat.cast(button, "mage", me, me);
    combat.cast("primary", "mage", me, me);
    elapse(cooldown - 1);
    combat.cast("primary", "mage", me, me);
    expect(send).toHaveBeenCalledTimes(1);

    elapse(1);
    combat.cast("primary", "mage", me, me);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("should send a fireball for a class it does not know, as the run always has", () => {
    const { combat, send } = combatOnStage();
    combat.cast("primary", "bard", me, me);
    expect(send).toHaveBeenCalledWith(ActionType.CastSkill, { skill_id: "fireball", target_x: 100, target_y: 100 });
  });
});

describe("PlayerCombat ability lockout (FS-8AY7S req 31)", () => {
  it("should lock the ability out for the special's cooldown, saying so as it starts and ends", () => {
    const { combat, look, elapse } = combatOnStage();
    combat.cast("special", "warrior", me, { x: 200, y: 100 });
    expect(combat.lockedOut).toBe(true);
    expect(look.abilityChanged).toHaveBeenCalledTimes(1);

    elapse(SPECIAL_COOLDOWN_MS);
    expect(combat.lockedOut).toBe(false);
    expect(look.abilityChanged).toHaveBeenCalledTimes(2);
  });

  it("should not lock the ability out for a primary", () => {
    const { combat, look } = combatOnStage();
    combat.cast("primary", "warrior", me, { x: 200, y: 100 });
    expect(combat.lockedOut).toBe(false);
    expect(look.abilityChanged).not.toHaveBeenCalled();
  });
});

describe("PlayerCombat Shadow Shot hold (FS-JTNPR req 8–18)", () => {
  const stamina = (current: number): ResourceState => ({ kind: "stamina", current, max: 100, ability_cost: 25 });
  const target = { x: 300, y: 100 };

  // FS-Q18Q3 R23: the bar's right-click square is active while the hold lasts, so its start and its end
  // each say the ability changed, once
  it("should say the ability changed as a hold begins, and again as it ends unfired or is cancelled", () => {
    const { combat, look, elapse } = combatOnStage({ resource: stamina(100) });
    combat.cast("special", "archer", me, target);
    expect(look.abilityChanged).toHaveBeenCalledTimes(1);
    combat.aimFrame(me);
    expect(look.abilityChanged).toHaveBeenCalledTimes(1);
    // a quick tap: released before it is ready, nothing fired
    expect(combat.releaseAim(me, target)).toBe(false);
    expect(look.abilityChanged).toHaveBeenCalledTimes(2);
    combat.cast("special", "archer", me, target);
    combat.cancelAim();
    expect(look.abilityChanged).toHaveBeenCalledTimes(4);
    combat.cancelAim();
    elapse(SHADOW_SHOT_MIN_HOLD_MS);
    expect(look.abilityChanged).toHaveBeenCalledTimes(4);
  });

  it("should only start aiming on an archer's right-press: nothing is sent, the hold is drawn", () => {
    const { combat, send, look } = combatOnStage();
    expect(combat.cast("special", "archer", me, target)).toBe(true);
    expect(combat.aiming).toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(look.aim).toHaveBeenCalledWith(me, false, false);
  });

  it("should answer no other click and no strike while aiming", () => {
    const { combat, send } = combatOnStage();
    combat.cast("special", "archer", me, target);
    combat.cast("primary", "archer", me, target);
    combat.strike(me, "boar-1", { x: 120, y: 100 }, "archer", 0);
    expect(send).not.toHaveBeenCalled();
  });

  it("should not strike on an archer's right button, which is the hold", () => {
    const { combat, send } = combatOnStage();
    expect(combat.strike(me, "boar-1", { x: 120, y: 100 }, "archer", 2)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("should fire one shadow_shot on a release held long enough, with the release, the clip and the lockout", () => {
    const { combat, send, look, elapse } = combatOnStage({ resource: stamina(100) });
    combat.cast("special", "archer", me, target);
    elapse(SHADOW_SHOT_MIN_HOLD_MS);
    combat.aimFrame(me);
    expect(look.aim).toHaveBeenLastCalledWith(me, true, false);

    expect(combat.releaseAim(me, target)).toBe(true);
    expect(send).toHaveBeenCalledWith(ActionType.CastSkill, { skill_id: "shadow_shot", target_x: 300, target_y: 100 });
    expect(look.shadowShot).toHaveBeenCalledWith(me, target, false);
    expect(look.attackClip).toHaveBeenCalledWith({ x: 200, y: 0 });
    expect(look.endAim).toHaveBeenCalledTimes(1);
    expect(combat.aiming).toBe(false);
    expect(combat.lockedOut).toBe(true);

    elapse(SHADOW_SHOT_COOLDOWN_MS);
    expect(combat.lockedOut).toBe(false);
  });

  it.each([
    ["released too soon", SHADOW_SHOT_MIN_HOLD_MS - 1, 100],
    ["short of the cost", SHADOW_SHOT_MIN_HOLD_MS, 24],
  ])("should send nothing on a release %s", (_, held, current) => {
    const { combat, send, look, elapse } = combatOnStage({ resource: stamina(current) });
    combat.cast("special", "archer", me, target);
    elapse(held);
    expect(combat.releaseAim(me, target)).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(look.endAim).toHaveBeenCalledTimes(1);
  });

  it("should end a cancelled hold with nothing sent, and none at all without a hold", () => {
    const { combat, send, look, elapse } = combatOnStage();
    combat.cancelAim();
    expect(look.endAim).not.toHaveBeenCalled();

    combat.cast("special", "archer", me, target);
    combat.cancelAim();
    elapse(SHADOW_SHOT_MIN_HOLD_MS);
    combat.releaseAim(me, target);
    expect(send).not.toHaveBeenCalled();
    expect(look.endAim).toHaveBeenCalledTimes(1);
  });

  it("should leave no hold standing after a reset", () => {
    const { combat } = combatOnStage();
    combat.cast("special", "archer", me, target);
    combat.reset();
    expect(combat.aiming).toBe(false);
  });

  // FS-1J1CB §F R41, R42: the shadow is a Shadow Ranger's alone; every other archer's is the Heavy Shot
  it.each([
    ["a Shadow Ranger", "shadow_ranger", true],
    ["a Hunter", "hunter", false],
    ["an unspecialized archer", undefined, false],
  ])("should aim and release %s's shot with the shadow: %s", (_, specialization, shadow) => {
    const { combat, look, elapse } = combatOnStage({ resource: stamina(100), specialization });
    combat.cast("special", "archer", me, target);
    expect(look.aim).toHaveBeenLastCalledWith(me, false, shadow);
    elapse(SHADOW_SHOT_MIN_HOLD_MS);
    combat.aimFrame(me);
    expect(look.aim).toHaveBeenLastCalledWith(me, true, shadow);
    combat.releaseAim(me, target);
    expect(look.shadowShot).toHaveBeenCalledWith(me, target, shadow);
  });

  it("should judge the shadow by the latest state, so a pick that lands mid-world shows on the next hold", () => {
    const { combat, look, elapse, self } = combatOnStage({ resource: stamina(100) });
    combat.cast("special", "archer", me, target);
    combat.cancelAim();
    self.me = { resource: stamina(100), specialization: "shadow_ranger" };
    combat.cast("special", "archer", me, target);
    elapse(SHADOW_SHOT_MIN_HOLD_MS);
    combat.releaseAim(me, target);
    expect(look.shadowShot).toHaveBeenCalledWith(me, target, true);
  });
});

describe("PlayerCombat Mercenary (FS-MAMHR §G.32–§G.35)", () => {
  const charges = (current: number): ResourceState => ({ kind: "parry_charges", current, max: 3, ability_cost: 0 });
  const target = { x: 160, y: 100 };

  it("should send cut and play the cut below 3 parry charges, with the attack clip", () => {
    const { combat, send, look } = combatOnStage({ resource: charges(2) });
    combat.cast("primary", "mercenary", me, target);
    expect(send).toHaveBeenCalledWith(ActionType.CastSkill, { skill_id: "cut", target_x: 160, target_y: 100 });
    expect(look.cut).toHaveBeenCalledWith(me, target);
    expect(look.riposte).not.toHaveBeenCalled();
    expect(look.attackClip).toHaveBeenCalledWith({ x: 60, y: 0 }, undefined);
  });

  it("should still send cut at 3 parry charges, and play the riposte slice", () => {
    const { combat, send, look } = combatOnStage({ resource: charges(3) });
    combat.cast("primary", "mercenary", me, target);
    expect(send).toHaveBeenCalledWith(ActionType.CastSkill, { skill_id: "cut", target_x: 160, target_y: 100 });
    expect(look.riposte).toHaveBeenCalledWith(me, target);
    expect(look.cut).not.toHaveBeenCalled();
  });

  it("should send parry and raise the stance on a right-click, with no clip and no lockout", () => {
    const { combat, send, look } = combatOnStage({ resource: charges(0) });
    combat.cast("special", "mercenary", me, target);
    expect(send).toHaveBeenCalledWith(ActionType.CastSkill, { skill_id: "parry", target_x: 160, target_y: 100 });
    expect(look.parry).toHaveBeenCalledTimes(1);
    expect(look.attackClip).not.toHaveBeenCalled();
    expect(combat.lockedOut).toBe(false);
  });

  it("should not hold the parry behind the cut's own cooldown", () => {
    const { combat, send } = combatOnStage({ resource: charges(0) });
    combat.cast("primary", "mercenary", me, target);
    combat.cast("special", "mercenary", me, target);
    expect(send.mock.calls.map(([, p]) => (p as { skill_id: string }).skill_id)).toEqual(["cut", "parry"]);
  });

  it.each([
    ["the stance is open", { parry_open: true }],
    ["the whiff lockout runs", { parry_lockout: 0.4 }],
  ])("should send no parry while %s", (_, fields) => {
    const { combat, send, look } = combatOnStage({ resource: charges(0), ...fields });
    expect(combat.cast("special", "mercenary", me, target)).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(look.parry).not.toHaveBeenCalled();
  });
});

describe("PlayerCombat castSent (FS-48CTQ §C.6: a cast that can strike names the hovered monster)", () => {
  const target = { x: 350, y: 100 };
  const stamina = (current: number): ResourceState => ({ kind: "stamina", current, max: 100, ability_cost: 25 });

  it.each(["warrior", "archer", "mercenary", "mage"])("should tell the port once on a %s's primary, as it is sent", (cls) => {
    const { combat, send, castSent } = combatOnStage();
    castSent.mockImplementation(() => expect(send).toHaveBeenCalledTimes(1));
    combat.cast("primary", cls, me, target);
    expect(castSent).toHaveBeenCalledTimes(1);
  });

  it.each(["warrior", "mage"])("should tell the port once on a %s's right-click ability", (cls) => {
    const { combat, castSent } = combatOnStage();
    combat.cast("special", cls, me, target);
    expect(castSent).toHaveBeenCalledTimes(1);
  });

  it("should not tell it on the archer's right-press, which sends nothing, but on the Shadow Shot it fires", () => {
    const { combat, castSent, elapse } = combatOnStage({ resource: stamina(100) });
    combat.cast("special", "archer", me, target);
    expect(castSent).not.toHaveBeenCalled();
    elapse(SHADOW_SHOT_MIN_HOLD_MS);
    expect(combat.releaseAim(me, target)).toBe(true);
    expect(castSent).toHaveBeenCalledTimes(1);
  });

  it("should not tell it on a hold let go too soon, which fires nothing", () => {
    const { combat, castSent } = combatOnStage({ resource: stamina(100) });
    combat.cast("special", "archer", me, target);
    expect(combat.releaseAim(me, target)).toBe(false);
    expect(castSent).not.toHaveBeenCalled();
  });

  it("should not tell it on the Mercenary's parry, which strikes nothing", () => {
    const { combat, send, castSent } = combatOnStage();
    combat.cast("special", "mercenary", me, target);
    expect(send).toHaveBeenCalledTimes(1);
    expect(castSent).not.toHaveBeenCalled();
  });

  it("should not tell it on a cast the cooldown holds back, nor on a strike, which names its own monster", () => {
    const { combat, castSent } = combatOnStage();
    combat.cast("primary", "mage", me, target);
    combat.cast("primary", "mage", me, target);
    combat.strike(me, "boar-1", { x: 120, y: 100 });
    expect(castSent).toHaveBeenCalledTimes(1);
  });
});

describe("PlayerCombat abilityCast (FS-AND39 R4: each class's ability, once, at its send)", () => {
  const target = { x: 300, y: 100 };
  const stamina = (current: number): ResourceState => ({ kind: "stamina", current, max: 100, ability_cost: 25 });
  const charges = (current: number): ResourceState => ({ kind: "parry_charges", current, max: 3, ability_cost: 0 });

  it.each([
    ["warrior", "dash"],
    ["mage", "triple_fireball"],
  ] as const)("should report a %s's right-click as %s, once, as it is sent", (cls, ability) => {
    const { combat, send, look } = combatOnStage();
    look.abilityCast.mockImplementation(() => expect(send).toHaveBeenCalledTimes(1));
    combat.cast("special", cls, me, target);
    expect(look.abilityCast).toHaveBeenCalledTimes(1);
    expect(look.abilityCast).toHaveBeenCalledWith(ability);
  });

  it("should report an archer's fired Shadow Shot once, on the release and never the press", () => {
    const { combat, look, elapse } = combatOnStage({ resource: stamina(100) });
    combat.cast("special", "archer", me, target);
    elapse(SHADOW_SHOT_MIN_HOLD_MS);
    combat.aimFrame(me);
    expect(look.abilityCast).not.toHaveBeenCalled();
    expect(combat.releaseAim(me, target)).toBe(true);
    expect(look.abilityCast).toHaveBeenCalledTimes(1);
    expect(look.abilityCast).toHaveBeenCalledWith("shadow_shot");
  });

  it("should report a Mercenary's sent parry once", () => {
    const { combat, look } = combatOnStage({ resource: charges(0) });
    combat.cast("special", "mercenary", me, target);
    expect(look.abilityCast).toHaveBeenCalledTimes(1);
    expect(look.abilityCast).toHaveBeenCalledWith("parry");
  });

  it.each(["warrior", "archer", "mercenary", "mage"])("should report nothing for a %s's primary", (cls) => {
    const { combat, look } = combatOnStage();
    combat.cast("primary", cls, me, target);
    expect(look.abilityCast).not.toHaveBeenCalled();
  });

  it("should report nothing for a strike", () => {
    const { combat, look } = combatOnStage();
    combat.strike(me, "boar-1", { x: 120, y: 100 });
    expect(look.abilityCast).not.toHaveBeenCalled();
  });

  it("should report nothing for a cast the cooldown holds back", () => {
    const { combat, look } = combatOnStage();
    combat.cast("special", "mage", me, target);
    combat.cast("special", "mage", me, target);
    expect(look.abilityCast).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["released too soon", SHADOW_SHOT_MIN_HOLD_MS - 1, 100],
    ["short of the cost", SHADOW_SHOT_MIN_HOLD_MS, 24],
  ])("should report nothing for a Shadow Shot %s", (_, held, current) => {
    const { combat, look, elapse } = combatOnStage({ resource: stamina(current) });
    combat.cast("special", "archer", me, target);
    elapse(held);
    expect(combat.releaseAim(me, target)).toBe(false);
    expect(look.abilityCast).not.toHaveBeenCalled();
  });

  it("should report nothing for a cancelled hold", () => {
    const { combat, look, elapse } = combatOnStage({ resource: stamina(100) });
    combat.cast("special", "archer", me, target);
    elapse(SHADOW_SHOT_MIN_HOLD_MS);
    combat.cancelAim();
    combat.releaseAim(me, target);
    expect(look.abilityCast).not.toHaveBeenCalled();
  });

  it("should report nothing for a refused parry", () => {
    const { combat, look } = combatOnStage({ resource: charges(0), parry_open: true });
    expect(combat.cast("special", "mercenary", me, target)).toBe(false);
    expect(look.abilityCast).not.toHaveBeenCalled();
  });
});

describe("PlayerCombat tree ability on key 3 (FS-04EEA §G R35–R37, R39, R40)", () => {
  /** A `cls` character as the latest state shows them, holding their tree's ability unless told otherwise. */
  const holding = (
    cls: string,
    resource: Partial<ResourceState> = {},
    fields: { held?: boolean; remaining?: number } = {},
  ): ReturnType<CombatSelf> => ({
    passive_ranks: fields.held === false ? {} : { [`${cls}.t3`]: 1 },
    tree_ability_cooldown: { remaining: fields.remaining ?? 0, total: 10 },
    resource: { kind: "stamina", current: 100, max: 100, ability_cost: 25, tree_ability_cost: 40, ...resource },
  });
  const mercenary = (charges: number) =>
    holding("mercenary", { kind: "parry_charges", current: charges, max: 3, ability_cost: 0, tree_ability_cost: 1 });
  const target = { x: 260, y: 40 };

  it("should send one settle_the_debt at the cursor for a mercenary holding 2 parry charges", () => {
    const { combat, send, look } = combatOnStage(mercenary(2));

    expect(combat.treeAbility("mercenary", me, target)).toBe(true);

    expect(send.mock.calls).toEqual([
      [ActionType.CastSkill, { skill_id: "settle_the_debt", target_x: 260, target_y: 40 }],
    ]);
    expect(look.settleTheDebt).toHaveBeenCalledWith(me, 2);
  });

  it("should send nothing, and play nothing, for a mercenary at 0 parry charges", () => {
    const { combat, send, look } = combatOnStage(mercenary(0));

    expect(combat.treeAbility("mercenary", me, target)).toBe(false);

    expect(send).not.toHaveBeenCalled();
    expect(look.settleTheDebt).not.toHaveBeenCalled();
  });

  it("should send nothing on a key's auto-repeat: a held 3 sends once", () => {
    const { combat, send } = combatOnStage(mercenary(2));

    combat.treeAbility("mercenary", me, target);
    combat.treeAbility("mercenary", me, target, true);
    combat.treeAbility("mercenary", me, target, true);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["warrior", "earthbreaker"],
    ["mage", "blink"],
  ] as const)("should send a %s's %s at the cursor's world point", (cls, skill) => {
    const { combat, send, look } = combatOnStage(holding(cls));

    expect(combat.treeAbility(cls, me, target)).toBe(true);

    expect(send.mock.calls).toEqual([[ActionType.CastSkill, { skill_id: skill, target_x: 260, target_y: 40 }]]);
    if (cls === "warrior") expect(look.earthbreaker).toHaveBeenCalledWith(me);
    else expect(look.blink).toHaveBeenCalledWith(me, target);
  });

  // R40: a Blink strikes nothing, so it names no last-hit monster
  it.each([
    ["warrior", holding("warrior"), true],
    ["mercenary", mercenary(1), true],
    ["mage", holding("mage"), false],
  ] as const)("should tell castSent for a %s's tree ability: %s", (cls, self, told) => {
    const { combat, castSent } = combatOnStage(self);
    combat.treeAbility(cls, me, target);
    expect(castSent).toHaveBeenCalledTimes(told ? 1 : 0);
  });

  it.each([
    ["the tree ability is not held", holding("warrior", {}, { held: false })],
    ["no ranks are on the wire", { resource: holding("warrior")?.resource }],
    ["it is on cooldown", holding("warrior", {}, { remaining: 0.4 })],
    ["it is not affordable", holding("warrior", { current: 39 })],
    ["no state has come yet", undefined],
  ])("should send nothing when %s", (_, self) => {
    const { combat, send, look, castSent } = combatOnStage(self);

    expect(combat.treeAbility("warrior", me, target)).toBe(false);

    expect(send).not.toHaveBeenCalled();
    expect(look.earthbreaker).not.toHaveBeenCalled();
    expect(castSent).not.toHaveBeenCalled();
  });

  it("should send as soon as the cooldown the state shows is over, whatever was sent before", () => {
    const { combat, send, self } = combatOnStage(holding("mage", {}, { remaining: 2 }));
    combat.treeAbility("mage", me, target);
    self.me = holding("mage");
    combat.treeAbility("mage", me, target);
    expect(send).toHaveBeenCalledTimes(1);
  });


  it("should send nothing for a class with no tree ability", () => {
    const { combat, send } = combatOnStage(holding("bard"));
    expect(combat.treeAbility("bard", me, target)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  // R39: one hold at a time
  it("should send nothing while a Shadow Shot hold is in progress", () => {
    const { combat, send } = combatOnStage(holding("warrior"));
    combat.cast("special", "archer", me, target);
    expect(combat.aiming).toBe(true);

    expect(combat.treeAbility("warrior", me, target)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("should neither wait on nor start the click casts' cooldowns", () => {
    const { combat, send } = combatOnStage(holding("warrior"));
    combat.cast("special", "warrior", me, target);
    expect(combat.treeAbility("warrior", me, target)).toBe(true);
    expect(combat.cast("primary", "warrior", me, target)).toBe(false);
    expect(send.mock.calls.map(([, p]) => (p as { skill_id: string }).skill_id)).toEqual(["dash", "earthbreaker"]);
  });

  // R42: the class attack clip, aimed at the target, rides the send as every ability's does
  it.each([
    ["warrior", holding("warrior")],
    ["mage", holding("mage")],
    ["mercenary", mercenary(2)],
  ] as const)("should play a %s's attack clip toward the cursor on the send", (cls, self) => {
    const { combat, look } = combatOnStage(self);
    combat.treeAbility(cls, me, target);
    expect(look.attackClip).toHaveBeenCalledTimes(1);
    expect(look.attackClip).toHaveBeenCalledWith({ x: target.x - me.x, y: target.y - me.y });
  });

  it("should play no attack clip for a press that sends nothing", () => {
    const { combat, look } = combatOnStage(holding("warrior", { current: 0 }));
    combat.treeAbility("warrior", me, target);
    expect(look.attackClip).not.toHaveBeenCalled();
  });

  // R48: no new sound; the class abilities' sound hook is never told of a tree ability
  it("should report no class ability cast for a tree ability", () => {
    const { combat, look } = combatOnStage(holding("warrior"));
    combat.treeAbility("warrior", me, target);
    expect(look.abilityCast).not.toHaveBeenCalled();
  });
});

describe("PlayerCombat Arrow Rain aim on key 3 (FS-04EEA §G R38–R40)", () => {
  /** An archer as the latest state shows them, holding Arrow Rain unless told otherwise. */
  const archer = (
    resource: Partial<ResourceState> = {},
    fields: { held?: boolean; remaining?: number } = {},
  ): ReturnType<CombatSelf> => ({
    passive_ranks: fields.held === false ? {} : { "archer.t3": 1 },
    tree_ability_cooldown: { remaining: fields.remaining ?? 0, total: 12 },
    resource: { kind: "stamina", current: 100, max: 100, ability_cost: 25, tree_ability_cost: 35, ...resource },
  });
  const origin = { x: 0, y: 0 };
  const near = { x: 120, y: 50 };
  const far = { x: 500, y: 0 };

  it("should send nothing on the press and draw the circle at the cursor", () => {
    const { combat, send, look } = combatOnStage(archer());
    expect(combat.treeAbility("archer", origin, near)).toBe(true);
    expect(combat.rainAiming).toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(look.rainAim).toHaveBeenLastCalledWith(near);
  });

  it("should draw the circle each frame at the cursor now, pulled in to 300 px", () => {
    const { combat, look } = combatOnStage(archer());
    combat.treeAbility("archer", origin, near);
    combat.aimFrame(origin, far);
    expect(look.rainAim).toHaveBeenLastCalledWith({ x: 300, y: 0 });
  });

  it("should send the pulled-in centre on the release, counted as a cast that can strike", () => {
    const { combat, send, look, castSent } = combatOnStage(archer());
    combat.treeAbility("archer", origin, near);
    expect(combat.releaseTreeAbility("archer", origin, far)).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(ActionType.CastSkill, { skill_id: "arrow_rain", target_x: 300, target_y: 0 });
    expect(castSent).toHaveBeenCalledTimes(1);
    expect(look.endRainAim).toHaveBeenCalledTimes(1);
    expect(look.arrowRain).toHaveBeenCalledWith(origin, { x: 300, y: 0 });
    expect(combat.rainAiming).toBe(false);
  });

  // R42: the clip rides the release that sends, aimed at the circle; the press sends nothing and plays nothing
  it("should play the attack clip toward the circle on the release that sends, and none on the press", () => {
    const { combat, look } = combatOnStage(archer());
    combat.treeAbility("archer", origin, near);
    expect(look.attackClip).not.toHaveBeenCalled();
    combat.releaseTreeAbility("archer", origin, far);
    expect(look.attackClip).toHaveBeenCalledTimes(1);
    expect(look.attackClip).toHaveBeenCalledWith({ x: 300, y: 0 });
  });

  it("should play no attack clip on a release that sends nothing", () => {
    const { combat, look, self } = combatOnStage(archer());
    combat.treeAbility("archer", origin, near);
    self.me = archer({ current: 0 });
    combat.releaseTreeAbility("archer", origin, near);
    expect(look.attackClip).not.toHaveBeenCalled();
  });

  it("should send one arrow_rain at the cursor on a tap", () => {
    const { combat, send } = combatOnStage(archer());
    combat.treeAbility("archer", me, near);
    combat.releaseTreeAbility("archer", me, near);
    expect(send.mock.calls).toEqual([[ActionType.CastSkill, { skill_id: "arrow_rain", target_x: 120, target_y: 50 }]]);
  });

  it.each([
    ["now on cooldown", archer({}, { remaining: 4 })],
    ["now short of stamina", archer({ current: 20 })],
  ])("should send nothing on a release when the gates no longer hold: %s", (_, now) => {
    const { combat, send, look, self, castSent } = combatOnStage(archer());
    combat.treeAbility("archer", origin, near);
    self.me = now;
    expect(combat.releaseTreeAbility("archer", origin, near)).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(castSent).not.toHaveBeenCalled();
    expect(look.arrowRain).not.toHaveBeenCalled();
    expect(look.endRainAim).toHaveBeenCalledTimes(1);
    expect(combat.rainAiming).toBe(false);
  });

  it.each([
    ["off cooldown but not held", archer({}, { held: false })],
    ["on cooldown", archer({}, { remaining: 4 })],
    ["short of stamina", archer({ current: 34 })],
  ])("should neither aim nor draw on a press %s", (_, now) => {
    const { combat, look } = combatOnStage(now);
    expect(combat.treeAbility("archer", origin, near)).toBe(false);
    expect(combat.rainAiming).toBe(false);
    expect(look.rainAim).not.toHaveBeenCalled();
  });

  it("should start nothing more on the key's auto-repeat", () => {
    const { combat, look } = combatOnStage(archer());
    combat.treeAbility("archer", origin, near);
    combat.treeAbility("archer", origin, far, true);
    expect(look.rainAim).toHaveBeenCalledTimes(1);
  });

  it("should end on a cancel with nothing sent and no circle left", () => {
    const { combat, send, look } = combatOnStage(archer());
    combat.treeAbility("archer", origin, near);
    combat.cancelAim();
    expect(combat.rainAiming).toBe(false);
    expect(look.endRainAim).toHaveBeenCalledTimes(1);
    expect(combat.releaseTreeAbility("archer", origin, near)).toBe(false);
    combat.aimFrame(origin, near);
    expect(look.rainAim).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("should leave no aim standing after a reset", () => {
    const { combat } = combatOnStage(archer());
    combat.treeAbility("archer", origin, near);
    combat.reset();
    expect(combat.rainAiming).toBe(false);
  });

  // the archer keeps walking: an Arrow Rain aim is not the Shadow Shot hold the keys read released by
  it("should not read as the Shadow Shot hold", () => {
    const { combat } = combatOnStage(archer());
    combat.treeAbility("archer", origin, near);
    expect(combat.aiming).toBe(false);
  });

  // R38, R39: left- and right-click are ignored while the aim is held, one hold at a time
  it("should answer no click and no strike during the aim", () => {
    const { combat, send, look } = combatOnStage(archer());
    combat.treeAbility("archer", me, near);
    expect(combat.cast("primary", "archer", me, near)).toBe(false);
    expect(combat.cast("special", "archer", me, near)).toBe(false);
    expect(combat.strike(me, "boar-1", { x: 120, y: 100 }, "archer", 0)).toBe(false);
    expect(combat.aiming).toBe(false);
    expect(look.aim).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("should start no aim while a Shadow Shot hold is in progress", () => {
    const { combat, look } = combatOnStage(archer());
    combat.cast("special", "archer", me, near);
    expect(combat.treeAbility("archer", me, near)).toBe(false);
    expect(combat.rainAiming).toBe(false);
    expect(look.rainAim).not.toHaveBeenCalled();
  });

  it("should send nothing on a release with no aim running", () => {
    const { combat, send, look } = combatOnStage(archer());
    expect(combat.releaseTreeAbility("archer", me, near)).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(look.endRainAim).not.toHaveBeenCalled();
  });
});
