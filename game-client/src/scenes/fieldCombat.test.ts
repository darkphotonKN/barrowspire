import { describe, expect, it, vi } from "vitest";
import { ActionType } from "@/assets/types/client";
import { shippedManifest } from "@/render/art/artLoader.standin";
import { ArtLibrary, atlasTextureKey } from "@/render/art/library";
import { MonsterRoster } from "@/render/creatures";
import { STRIKE_RANGE } from "@/render/combat/playerCombat";
import { SHADOW_SHOT_MIN_HOLD_MS } from "./shadowShotAim";
import { EffectsRuntime } from "@/render/effects/runtime";
import { FieldCombat, fieldCombatOnScene } from "./fieldCombat";

// the claw's drawing has its own suite (render/effects/demonClaw.test.ts): here, only who plays it
const { playDemonClaw } = vi.hoisted(() => ({ playDemonClaw: vi.fn() }));
vi.mock("@/render/effects/demonClaw", () => ({ playDemonClaw }));

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

const me = (x: number, current_health = 100, cls = "mage", fields: Record<string, unknown> = {}) => ({
  id: "me",
  entity_id: "e_me",
  username: "Wren",
  class: cls,
  position: { x, y: 500 },
  current_health,
  max_health: 100,
  ...fields,
});

function fieldOnStage() {
  const sprites: ReturnType<typeof drawn>[] = [];
  const sendMessage = vi.fn();
  const cursor = vi.fn();
  const hits = { play: vi.fn(), clearAll: vi.fn() };
  const projectiles = { sync: vi.fn(), clear: vi.fn() };
  const body = drawn();
  const art = ArtLibrary.empty({ warn: () => {} });
  const clock = { now: 0 };
  const button = { pressed: 0 as number | undefined };
  const kit = { sync: vi.fn(), forget: vi.fn() };
  const sounds = { play: vi.fn() };
  const look = {
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
  };
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
    port: { sendMessage, later: () => {}, now: () => clock.now },
    look,
    kit,
    button: () => button.pressed,
    projectiles,
    hits,
    cursor,
    bodyOf: (id) => (id === "e_me" ? (body as never) : undefined),
    sounds,
  });
  const state = (
    player: ReturnType<typeof me> | null,
    monsters = [boar("b1", 1000), boar("b2", 1100, "dead")],
    others: ReturnType<typeof me>[] = [],
  ) => combat.sync({ current_player: player as never, other_players: others as never, monsters: monsters as never, projectiles: [] });
  return { combat, sprites, sendMessage, cursor, hits, projectiles, body, state, clock, button, kit, look, sounds };
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

  it("should show the strike-mark over a living boar, and the hand once the pointer leaves", () => {
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

  // Leaving /game mid-field destroys the game, and the scene's input plugin has destroyed itself
  // before the field lets its fight go: setting the cursor then throws on its nulled manager. Letting
  // the boar under the pointer go set the hand back as a hover ending would (asked 2026-11-06).
  it("should set no cursor on release with a boar under the pointer: the scene hands the cursor back itself", () => {
    const { combat, state, sprites, cursor } = fieldOnStage();
    state(me(200));
    sprites[0].handlers.pointerover();
    cursor.mockClear();

    combat.release();

    expect(cursor).not.toHaveBeenCalled();
    expect(combat.monsters.size).toBe(0);
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

describe("FieldCombat the player's own wound (FS-AND39 R3)", () => {
  const teammate = (current_health: number) => ({ ...me(300, current_health), id: "ally", entity_id: "e_ally" });

  it("should play hit_player once on a drop in the player's own health", () => {
    const { state, sounds } = fieldOnStage();
    state(me(200, 100));
    state(me(200, 92));
    expect(sounds.play.mock.calls).toEqual([["hit_player"]]);
  });

  it("should play nothing on the first state, which has nothing to compare", () => {
    const { state, sounds } = fieldOnStage();
    state(me(200, 40));
    expect(sounds.play).not.toHaveBeenCalled();
  });

  it("should play nothing on a rise: a potion or a respawn", () => {
    const { state, sounds } = fieldOnStage();
    state(me(200, 0));
    state(me(200, 100));
    state(me(200, 100));
    expect(sounds.play).not.toHaveBeenCalled();
  });

  it("should play nothing for a teammate's drop", () => {
    const { state, sounds } = fieldOnStage();
    state(me(200, 100), [], [teammate(100)]);
    state(me(200, 100), [], [teammate(60)]);
    expect(sounds.play).not.toHaveBeenCalled();
  });

  it("should play nothing on the first state after a release: a new visit compares nothing", () => {
    const { combat, state, sounds } = fieldOnStage();
    state(me(200, 100));
    combat.release();
    state(me(200, 50));
    expect(sounds.play).not.toHaveBeenCalled();
  });
});

describe("FieldCombat class kits, the run's own (FS-X2F2H §Requirements 56; FS-JTNPR; FS-MAMHR)", () => {
  it("should fire an archer's Shadow Shot on a held release, and send nothing on the press", () => {
    const { combat, state, sendMessage, clock } = fieldOnStage();
    state(me(200, 100, "archer", { resource: { kind: "stamina", current: 100, max: 100, ability_cost: 25 } }));
    combat.cast("special", { x: 400, y: 500 });
    expect(combat.aiming).toBe(true);
    expect(sendMessage).not.toHaveBeenCalled();

    clock.now = SHADOW_SHOT_MIN_HOLD_MS;
    combat.releaseAim({ x: 400, y: 500 });
    expect(sendMessage).toHaveBeenCalledWith(ActionType.CastSkill, { skill_id: "shadow_shot", target_x: 400, target_y: 500 });
    expect(combat.lockedOut).toBe(true);
  });

  it("should not strike on an archer's right button", () => {
    const { state, sprites, sendMessage, button } = fieldOnStage();
    state(me(990, 100, "archer"));
    button.pressed = 2;
    sprites[0].handlers.pointerdown();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("should end a hold, with nothing sent, once the player falls", () => {
    const { combat, state, sendMessage, clock, look } = fieldOnStage();
    state(me(200, 100, "archer"));
    combat.cast("special", { x: 400, y: 500 });
    state(me(200, 0, "archer"));
    expect(combat.aiming).toBe(false);
    expect(look.endAim).toHaveBeenCalled();

    clock.now = SHADOW_SHOT_MIN_HOLD_MS;
    combat.releaseAim({ x: 400, y: 500 });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("should send a Mercenary's cut, its riposte at 3 parry charges, and parry on the right click", () => {
    const { combat, state, sendMessage, look } = fieldOnStage();
    const charges = (current: number) => ({ resource: { kind: "parry_charges", current, max: 3, ability_cost: 0 } });
    state(me(200, 100, "mercenary", charges(3)));
    combat.cast("primary", { x: 250, y: 500 });
    combat.cast("special", { x: 250, y: 500 });
    expect(sendMessage.mock.calls.map(([, p]) => (p as { skill_id: string }).skill_id)).toEqual(["cut", "parry"]);
    expect(look.riposte).toHaveBeenCalledTimes(1);
    expect(look.parry).toHaveBeenCalledTimes(1);
  });

  it("should hand the kit each state's own player, and let it go on release", () => {
    const { combat, state, kit } = fieldOnStage();
    const player = me(200, 100, "mercenary", { parry_open: true });
    state(player);
    expect(kit.sync).toHaveBeenCalledWith(player, 0);
    combat.release();
    expect(kit.forget).toHaveBeenCalledTimes(1);
  });
});

/**
 * A stand-in that answers anything: every property is another stand-in, every call returns one.
 * Enough of a Phaser scene for {@link fieldCombatOnScene} to wire its parts on.
 */
function anything(): never {
  const target = () => {};
  const proxy: unknown = new Proxy(target, {
    get: (_t, prop) => (prop === "then" ? undefined : prop === Symbol.toPrimitive ? () => 0 : anything()),
    apply: () => anything(),
  });
  return proxy as never;
}

describe("fieldCombatOnScene: a demon's fire claw in a field (FS-VHGE7 §D R32–33)", () => {
  /** A blood demon, as a field's state (dev_test_room's) lists it. */
  const demon = (action: "idle" | "claw") => ({
    ...boar("d1", 1000),
    archetype: "blood_demon",
    name: "Blood Demon",
    boss: true,
    facing: { x: 1, y: 0 },
    action,
  });

  it("should play the claw on the field's effects runtime when a shown demon turns to claw, once per turn", () => {
    playDemonClaw.mockClear();
    const fight = fieldCombatOnScene(anything(), ArtLibrary.empty({ warn: () => {} }), anything(), {
      selfAnim: () => undefined,
      selfAt: () => undefined,
      bodyOf: () => undefined,
    });
    const state = (action: "idle" | "claw") =>
      fight.sync({ current_player: null, other_players: [], monsters: [demon(action)] as never, projectiles: [] });

    state("idle");
    state("claw");
    state("claw");

    expect(playDemonClaw).toHaveBeenCalledTimes(1);
    const [fx, owner, at, facing] = playDemonClaw.mock.calls[0];
    expect(fx).toBeInstanceOf(EffectsRuntime);
    expect(owner).toBe("d1");
    expect(at).toEqual({ x: 1000, y: 500 });
    expect(facing).toEqual({ x: 1, y: 0 });
  });

  it("should fetch the blood demon's art group when one is listed (FS-VHGE7 §F R44, R51)", () => {
    const manifest = shippedManifest();
    const images: string[] = [];
    const overrides: Record<string | symbol, unknown> = {
      cache: { json: { get: () => manifest } },
      textures: { exists: () => false },
      load: {
        on: () => undefined,
        off: () => undefined,
        once: () => undefined,
        start: () => undefined,
        image: (key: string) => images.push(key),
      },
    };
    const scene = new Proxy(anything() as object, {
      get: (target, prop) => (prop in overrides ? overrides[prop] : Reflect.get(target, prop)),
    }) as never;
    const fight = fieldCombatOnScene(scene, ArtLibrary.empty({ warn: () => {} }), anything(), {
      selfAnim: () => undefined,
      selfAt: () => undefined,
      bodyOf: () => undefined,
    });

    fight.sync({ current_player: null, other_players: [], monsters: [demon("idle")] as never, projectiles: [] });

    expect(images).toEqual(
      Object.keys(manifest.atlases)
        .filter((atlas) => atlas.startsWith("blood_demon-"))
        .map(atlasTextureKey),
    );
    expect(images.length).toBeGreaterThan(0);
  });
});

describe("fieldCombatOnScene: what the field sounds (FS-AND39 R2, R4)", () => {
  function soundingField() {
    const sounds = { play: vi.fn() };
    const fight = fieldCombatOnScene(anything(), ArtLibrary.empty({ warn: () => {} }), anything(), {
      selfAnim: () => undefined,
      selfAt: () => undefined,
      bodyOf: () => undefined,
      sounds,
    });
    return { fight, sounds };
  }

  it("should play hit_monster when a shown monster's health drops, and nothing on first sight", () => {
    const { fight, sounds } = soundingField();
    const state = (health: number) =>
      fight.sync({
        current_player: null,
        other_players: [],
        monsters: [{ ...boar("b1", 1000), current_health: health }] as never,
        projectiles: [],
      });
    state(20);
    expect(sounds.play).not.toHaveBeenCalled();
    state(12);
    expect(sounds.play.mock.calls).toEqual([["hit_monster"]]);
  });

  it.each([
    ["warrior", "dash"],
    ["mage", "triple_fireball"],
    ["mercenary", "parry"],
  ])("should play a %s's right-click ability as %s", (cls, effect) => {
    const { fight, sounds } = soundingField();
    fight.sync({ current_player: me(200, 100, cls) as never, other_players: [], monsters: [], projectiles: [] });
    fight.cast("special", { x: 400, y: 500 });
    expect(sounds.play.mock.calls).toEqual([[effect]]);
  });

  // the fired release's report is PlayerCombat's (playerCombat.test.ts); here, the draw is silent
  it("should play nothing on an archer's press, which only begins the draw", () => {
    const { fight, sounds } = soundingField();
    const stamina = { resource: { kind: "stamina", current: 100, max: 100, ability_cost: 25 } };
    fight.sync({ current_player: me(200, 100, "archer", stamina) as never, other_players: [], monsters: [], projectiles: [] });
    fight.cast("special", { x: 400, y: 500 });
    expect(sounds.play).not.toHaveBeenCalled();
  });

  it("should play nothing for a mage's primary fireball", () => {
    const { fight, sounds } = soundingField();
    fight.sync({ current_player: me(200, 100, "mage") as never, other_players: [], monsters: [], projectiles: [] });
    fight.cast("primary", { x: 400, y: 500 });
    expect(sounds.play).not.toHaveBeenCalled();
  });
});
