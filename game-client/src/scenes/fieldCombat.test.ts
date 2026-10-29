import { describe, expect, it, vi } from "vitest";
import { ActionType } from "@/assets/types/client";
import { ArtLibrary } from "@/render/art/library";
import { MonsterRoster } from "@/render/creatures";
import { STRIKE_RANGE } from "@/render/combat/playerCombat";
import { FieldCombat } from "./fieldCombat";

/** A drawn object that takes any call, remembering the handlers hung on it. */
function drawn() {
  const handlers: Record<string, () => void> = {};
  const self: Record<string, unknown> = { handlers, active: true, destroyed: false, width: 0 };
  const proxy: unknown = new Proxy(self, {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      if (prop === "then") return undefined;
      if (prop === "on" || prop === "once")
        return (event: string, fn: () => void) => {
          handlers[event] = fn;
          return proxy;
        };
      if (prop === "destroy")
        return () => {
          target.destroyed = true;
        };
      return () => proxy;
    },
  });
  return proxy as { handlers: Record<string, () => void>; destroyed: boolean };
}

/** The Meadows' boar, as a field state lists it. */
const boar = (entity_id: string, x: number, action: "idle" | "dead" = "idle") => ({
  entity_id,
  archetype: "boar",
  name: "Boar",
  level: 2,
  elite: false,
  boss: false,
  position: { x, y: 500 },
  facing: { x: 0, y: 1 },
  action,
  current_health: action === "dead" ? 0 : 20,
  max_health: 20,
});

const me = (x: number, current_health = 100, cls = "mage") => ({
  id: "me",
  entity_id: "e_me",
  username: "Wren",
  class: cls,
  position: { x, y: 500 },
  current_health,
  max_health: 100,
});

function fieldOnStage() {
  const sprites: ReturnType<typeof drawn>[] = [];
  const sendMessage = vi.fn();
  const cursor = vi.fn();
  const hits = { play: vi.fn(), clearAll: vi.fn() };
  const projectiles = { sync: vi.fn(), clear: vi.fn() };
  const body = drawn();
  const art = ArtLibrary.empty({ warn: () => {} });
  const combat = new FieldCombat({
    roster: (targeting) =>
      new MonsterRoster(
        {
          sprite: () => {
            const s = drawn();
            sprites.push(s);
            return s as never;
          },
          text: () => drawn() as never,
          graphics: () => drawn() as never,
        },
        art,
        targeting,
      ),
    port: { sendMessage, later: () => {} },
    look: { slash: vi.fn(), dash: vi.fn(), arrow: vi.fn(), fireball: vi.fn(), attackClip: vi.fn() },
    projectiles,
    hits,
    cursor,
    bodyOf: (id) => (id === "e_me" ? (body as never) : undefined),
  });
  const state = (player: ReturnType<typeof me> | null, monsters = [boar("b1", 1000), boar("b2", 1100, "dead")]) =>
    combat.sync({ current_player: player as never, other_players: [], monsters: monsters as never, projectiles: [] });
  return { combat, sprites, sendMessage, cursor, hits, projectiles, body, state };
}

describe("FieldCombat (FS-X2F2H §Requirements 56)", () => {
  it("should draw every monster the field state lists, corpses included, and forget the gone", () => {
    const { combat, state, sprites } = fieldOnStage();
    state(me(200));
    expect(combat.monsters.size).toBe(2);

    state(me(200), [boar("b1", 1000)]);
    expect(combat.monsters.size).toBe(1);
    expect(sprites[1].destroyed).toBe(true);
  });

  it("should strike a clicked living boar within reach, and nothing out of reach or on a corpse", () => {
    const { state, sprites, sendMessage } = fieldOnStage();
    state(me(1000 - STRIKE_RANGE - 1));
    sprites[0].handlers.pointerdown();
    sprites[1].handlers.pointerdown?.();
    expect(sendMessage).not.toHaveBeenCalled();

    state(me(1000 - STRIKE_RANGE + 10));
    sprites[0].handlers.pointerdown();
    expect(sendMessage).toHaveBeenCalledWith(ActionType.Attack, { enemy_entity_id: "b1" });
  });

  it("should not let a fallen player strike or cast", () => {
    const { combat, state, sprites, sendMessage } = fieldOnStage();
    state(me(990, 0));
    sprites[0].handlers.pointerdown();
    combat.cast("primary", { x: 900, y: 500 });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("should cast the player's class at the clicked ground", () => {
    const { combat, state, sendMessage } = fieldOnStage();
    state(me(200, 100, "Archer"));
    combat.cast("primary", { x: 400, y: 520 });
    expect(sendMessage).toHaveBeenCalledWith(ActionType.CastSkill, { skill_id: "arrow", target_x: 400, target_y: 520 });
  });

  it("should show the strike-mark over a living boar, and the gauntlet once the pointer leaves", () => {
    const { state, sprites, cursor } = fieldOnStage();
    state(me(200));
    sprites[0].handlers.pointerover();
    expect(cursor).toHaveBeenLastCalledWith(true);
    sprites[0].handlers.pointerout();
    expect(cursor).toHaveBeenLastCalledWith(false);
  });

  it("should fly the state's projectiles and tint the player when struck", () => {
    const { state, projectiles, hits, body } = fieldOnStage();
    state(me(200, 100));
    state(me(200, 92));
    expect(projectiles.sync).toHaveBeenCalledWith([]);
    expect(hits.play).toHaveBeenCalledTimes(1);
    expect(hits.play.mock.calls[0][0]).toBe(body);
  });

  it("should let everything go on release, ready for the next visit", () => {
    const { combat, state, projectiles, hits, sprites, sendMessage } = fieldOnStage();
    state(me(990));
    sprites[0].handlers.pointerdown();

    combat.release();

    expect(combat.monsters.size).toBe(0);
    expect(projectiles.clear).toHaveBeenCalled();
    expect(hits.clearAll).toHaveBeenCalled();
    state(me(990));
    sprites[2].handlers.pointerdown();
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });
});
