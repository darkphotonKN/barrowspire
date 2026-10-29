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
  };
  const self = { me };
  const combat = new PlayerCombat(
    { sendMessage: send, later: (ms, fn) => timers.push({ at: now + ms, fn }), now: () => now },
    look,
    () => self.me,
  );
  const elapse = (ms: number) => {
    now += ms;
    for (const t of timers.splice(0).filter((t) => t.at <= now || !timers.push(t))) t.fn();
  };
  return { combat, send, look, elapse, self };
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
    ["warrior", "dash", "dash", CHARGE_MS],
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
