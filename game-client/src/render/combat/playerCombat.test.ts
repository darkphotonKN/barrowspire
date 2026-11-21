import { describe, expect, it, vi } from "vitest";
import { ActionType } from "@/assets/types/client";
import { CHARGE_MS } from "@/render/effects/charge";
import { SHADOW_SHOT_COOLDOWN_MS, SHADOW_SHOT_MIN_HOLD_MS } from "@/scenes/shadowShotAim";
import type { ResourceState } from "@/types/gameState";
import {
  ATTACK_PIN_MS,
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
    lockout: vi.fn(),
    abilityCast: vi.fn(),
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

  // the 600 ms attack pin outlasts the strike's own cooldown (FS-JS7C8 D4)
  it("should strike once per pin, past its cooldown, and again once the pin is over", () => {
    const { combat, send, elapse } = combatOnStage();
    combat.strike(me, "boar-1", me);
    combat.strike(me, "boar-1", me);
    expect(send).toHaveBeenCalledTimes(1);

    elapse(STRIKE_COOLDOWN_MS);
    combat.strike(me, "boar-1", me);
    expect(send).toHaveBeenCalledTimes(1);

    elapse(ATTACK_PIN_MS - STRIKE_COOLDOWN_MS);
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

  // the special's cooldown binds after the dash, which never pins; after any attack the 600 ms
  // pin binds before either cooldown does (FS-JS7C8 D4, "Attacks paced by the pin")
  it("should hold every cast for the special cooldown", () => {
    const { combat, send, elapse } = combatOnStage();
    combat.cast("special", "warrior", me, me);
    combat.cast("primary", "warrior", me, me);
    elapse(SPECIAL_COOLDOWN_MS - 1);
    combat.cast("primary", "warrior", me, me);
    expect(send).toHaveBeenCalledTimes(1);

    elapse(1);
    combat.cast("primary", "warrior", me, me);
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
    expect(look.lockout).toHaveBeenCalledTimes(1);

    elapse(SPECIAL_COOLDOWN_MS);
    expect(combat.lockedOut).toBe(false);
    expect(look.lockout).toHaveBeenCalledTimes(2);
  });

  it("should not lock the ability out for a primary", () => {
    const { combat, look } = combatOnStage();
    combat.cast("primary", "warrior", me, { x: 200, y: 100 });
    expect(combat.lockedOut).toBe(false);
    expect(look.lockout).not.toHaveBeenCalled();
  });
});

describe("PlayerCombat Shadow Shot hold (FS-JTNPR req 8–18)", () => {
  const stamina = (current: number): ResourceState => ({ kind: "stamina", current, max: 100, ability_cost: 25 });
  const target = { x: 300, y: 100 };

  it("should only start aiming on an archer's right-press: nothing is sent, the hold is drawn", () => {
    const { combat, send, look } = combatOnStage();
    expect(combat.cast("special", "archer", me, target)).toBe(true);
    expect(combat.aiming).toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(look.aim).toHaveBeenCalledWith(me, false);
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
    expect(look.aim).toHaveBeenLastCalledWith(me, true);

    expect(combat.releaseAim(me, target)).toBe(true);
    expect(send).toHaveBeenCalledWith(ActionType.CastSkill, { skill_id: "shadow_shot", target_x: 300, target_y: 100 });
    expect(look.shadowShot).toHaveBeenCalledWith(me, target);
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

describe("PlayerCombat attack pin (FS-JS7C8 §Change: Attacking pins the attacker, R61–R64)", () => {
  it("should send nothing on a second primary while the pin runs, and send it once 600 ms have passed", () => {
    const { combat, send, look, elapse } = combatOnStage();
    combat.cast("primary", "mage", me, me);
    elapse(PRIMARY_COOLDOWN_MS);
    expect(combat.cast("primary", "mage", me, me)).toBe(false);
    elapse(300 - PRIMARY_COOLDOWN_MS);
    expect(combat.cast("primary", "mage", me, me)).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    expect(look.attackClip).toHaveBeenCalledTimes(1);

    elapse(ATTACK_PIN_MS - 300);
    expect(combat.cast("primary", "mage", me, me)).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  const target = { x: 160, y: 100 };
  const resource = {
    stamina: { kind: "stamina", current: 100, max: 100, ability_cost: 25 },
    charges: (current: number): ResourceState => ({ kind: "parry_charges", current, max: 3, ability_cost: 0 }),
  } as const;
  type Stage = ReturnType<typeof combatOnStage>;
  const sends: [string, ReturnType<CombatSelf>, (s: Stage) => boolean][] = [
    ["strike", undefined, ({ combat }) => combat.strike(me, "boar-1", target)],
    ["slash", undefined, ({ combat }) => combat.cast("primary", "warrior", me, target)],
    ["arrow", undefined, ({ combat }) => combat.cast("primary", "archer", me, target)],
    ["cut", { resource: resource.charges(2) }, ({ combat }) => combat.cast("primary", "mercenary", me, target)],
    ["riposte", { resource: resource.charges(3) }, ({ combat }) => combat.cast("primary", "mercenary", me, target)],
    ["fireball", undefined, ({ combat }) => combat.cast("primary", "mage", me, target)],
    ["triple_fireball", undefined, ({ combat }) => combat.cast("special", "mage", me, target)],
    [
      "a fired shadow_shot",
      { resource: resource.stamina },
      ({ combat, elapse }) => {
        combat.cast("special", "archer", me, target);
        elapse(SHADOW_SHOT_MIN_HOLD_MS);
        return combat.releaseAim(me, target);
      },
    ],
  ];
  const probes: [string, (s: Stage) => boolean][] = [
    ["strike", ({ combat }) => combat.strike(me, "boar-2", target)],
    ["a primary cast", ({ combat }) => combat.cast("primary", "mage", me, target)],
    ["a special cast", ({ combat }) => combat.cast("special", "mage", me, target)],
    ["the warrior's dash", ({ combat }) => combat.cast("special", "warrior", me, target)],
  ];
  const cases = sends.flatMap(([sent, self, send]) => probes.map(([probe, act]) => [sent, probe, self, send, act] as const));

  it.each(cases)("after %s, should answer %s with nothing sent or played until the pin is over", (_, __, self, sendIt, probe) => {
    const stage = combatOnStage(self);
    const { send, look, castSent, elapse } = stage;
    expect(sendIt(stage)).toBe(true);
    elapse(ATTACK_PIN_MS - 1);
    vi.clearAllMocks();

    expect(probe(stage)).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(castSent).not.toHaveBeenCalled();
    for (const fn of Object.values(look)) expect(fn).not.toHaveBeenCalled();

    elapse(1);
    expect(probe(stage)).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("should pin for 600 ms whatever gear is worn: +50% attack speed shortens nothing", () => {
    const weapon = { affixes: [{ stat: "attack_speed", tier: 1, value: 50 }] };
    const worn = { resource: resource.stamina, equipment: { weapon } };
    const { combat, send, elapse } = combatOnStage(worn as ReturnType<CombatSelf>);
    combat.cast("primary", "archer", me, target);
    elapse(ATTACK_PIN_MS - 1);
    expect(combat.cast("primary", "archer", me, target)).toBe(false);
    elapse(1);
    expect(combat.cast("primary", "archer", me, target)).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("should start no pin on a dash: a strike goes at once after it", () => {
    const { combat, send } = combatOnStage();
    expect(combat.cast("special", "warrior", me, target)).toBe(true);
    expect(combat.strike(me, "boar-1", target)).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("should still send a Mercenary's parry and raise the stance while the pin runs, starting no pin", () => {
    const { combat, send, look, self } = combatOnStage({ resource: resource.charges(0) });
    combat.cast("primary", "mercenary", me, target);
    expect(combat.cast("special", "mercenary", me, target)).toBe(true);
    expect(send).toHaveBeenLastCalledWith(ActionType.CastSkill, { skill_id: "parry", target_x: 160, target_y: 100 });
    expect(look.parry).toHaveBeenCalledTimes(1);

    const fresh = combatOnStage(self.me);
    fresh.combat.cast("special", "mercenary", me, target);
    expect(fresh.combat.cast("primary", "mercenary", me, target)).toBe(true);
  });

  it("should clear the pin on a reset: the next cast and strike go at once", () => {
    const { combat, send } = combatOnStage();
    combat.cast("primary", "warrior", me, target);
    combat.reset();
    expect(combat.cast("primary", "warrior", me, target)).toBe(true);
    combat.reset();
    expect(combat.strike(me, "boar-1", target)).toBe(true);
    expect(send).toHaveBeenCalledTimes(3);
  });

  describe("the archer's Shadow Shot hold (R63)", () => {
    function pinnedArcher() {
      const stage = combatOnStage({ resource: resource.stamina });
      stage.combat.cast("primary", "archer", me, target);
      vi.clearAllMocks();
      return stage;
    }

    it("should begin the hold on a right-press during the pin, with nothing sent", () => {
      const { combat, send, look } = pinnedArcher();
      expect(combat.cast("special", "archer", me, target)).toBe(true);
      expect(combat.aiming).toBe(true);
      expect(send).not.toHaveBeenCalled();
      expect(look.aim).toHaveBeenCalledWith(me, false);
    });

    it("should read not ready while the pin runs, held long enough, and end a release then with nothing sent", () => {
      const { combat, send, look, castSent, elapse } = pinnedArcher();
      combat.cast("special", "archer", me, target);
      elapse(SHADOW_SHOT_MIN_HOLD_MS);
      combat.aimFrame(me);
      expect(look.aim).toHaveBeenLastCalledWith(me, false);

      expect(combat.releaseAim(me, target)).toBe(false);
      expect(combat.aiming).toBe(false);
      expect(look.endAim).toHaveBeenCalledTimes(1);
      expect(send).not.toHaveBeenCalled();
      expect(castSent).not.toHaveBeenCalled();
      expect(look.shadowShot).not.toHaveBeenCalled();
      expect(look.attackClip).not.toHaveBeenCalled();
      expect(combat.lockedOut).toBe(false);
    });

    it("should fire a hold begun during the pin and released after it", () => {
      const { combat, send, look, elapse } = pinnedArcher();
      combat.cast("special", "archer", me, target);
      elapse(ATTACK_PIN_MS);
      combat.aimFrame(me);
      expect(look.aim).toHaveBeenLastCalledWith(me, true);
      expect(combat.releaseAim(me, target)).toBe(true);
      expect(send).toHaveBeenCalledWith(ActionType.CastSkill, { skill_id: "shadow_shot", target_x: 160, target_y: 100 });
    });

    it("should leave the cooldown unstarted by a release the pin refused: the next hold fires once the pin is over", () => {
      const { combat, send, elapse } = pinnedArcher();
      combat.cast("special", "archer", me, target);
      elapse(SHADOW_SHOT_MIN_HOLD_MS);
      combat.releaseAim(me, target);
      combat.cast("special", "archer", me, target);
      elapse(ATTACK_PIN_MS - SHADOW_SHOT_MIN_HOLD_MS);
      expect(combat.releaseAim(me, target)).toBe(true);
      expect(send).toHaveBeenCalledTimes(1);
    });
  });
});
