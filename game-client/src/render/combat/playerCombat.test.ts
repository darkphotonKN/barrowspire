import { describe, expect, it, vi } from "vitest";
import { ActionType } from "@/assets/types/client";
import { CHARGE_MS } from "@/render/effects/charge";
import {
  PRIMARY_COOLDOWN_MS,
  PlayerCombat,
  SPECIAL_COOLDOWN_MS,
  STRIKE_COOLDOWN_MS,
  STRIKE_RANGE,
  type CombatLook,
} from "./playerCombat";

/** A combat with its sends, its effects and its clock recorded; `elapse` runs what is due. */
function combatOnStage() {
  const send = vi.fn();
  const timers: { at: number; fn: () => void }[] = [];
  let now = 0;
  const look: { [K in keyof CombatLook]: ReturnType<typeof vi.fn> } = {
    slash: vi.fn(),
    dash: vi.fn(),
    arrow: vi.fn(),
    fireball: vi.fn(),
    attackClip: vi.fn(),
  };
  const combat = new PlayerCombat(
    { sendMessage: send, later: (ms, fn) => timers.push({ at: now + ms, fn }) },
    look,
  );
  const elapse = (ms: number) => {
    now += ms;
    for (const t of timers.splice(0).filter((t) => t.at <= now || !timers.push(t))) t.fn();
  };
  return { combat, send, look, elapse };
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
    ["archer", "triple_arrow", "arrow", undefined],
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
