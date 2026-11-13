import { afterEach, describe, expect, it, vi } from "vitest";
import type * as Phaser from "phaser";
import type { KeyValueStore } from "@/characters/roster";
import type { ContainerKind } from "@/types/gameState";
import { renderGameplaySfx } from "./gameplaySfx";
import {
  GAMEPLAY_EFFECTS,
  GameplaySounds,
  containerOpenEffect,
  gameplaySoundKey,
  installGameplaySounds,
  type GameplayEffect,
  type GameplaySoundCache,
  type GameplaySoundContext,
} from "./gameplaySounds";
import { SFX_SETTING_KEY, sfxGain, type SfxSettingStore } from "./sfxSetting";
import { UI_EFFECTS, uiSoundKey, type UiSoundStage } from "./uiSounds";
import { TOWER_TRACK, VILLAGE_TRACK } from "./worldMusic";

describe("the gameplay effects' names and keys (FS-AND39 R1, R12)", () => {
  it("should name the 11 effects", () => {
    expect([...GAMEPLAY_EFFECTS]).toEqual([
      "hit_monster",
      "hit_player",
      "chest_open",
      "loot_open",
      "stash_open",
      "item_pickup",
      "item_swap",
      "dash",
      "triple_fireball",
      "shadow_shot",
      "parry",
    ]);
  });

  it("should key each as sfx:<name>, apart from every interface effect's and every world's track", () => {
    expect(gameplaySoundKey("hit_monster")).toBe("sfx:hit_monster");
    const keys = GAMEPLAY_EFFECTS.map(gameplaySoundKey);
    const others = [...UI_EFFECTS.map(uiSoundKey), VILLAGE_TRACK.key, TOWER_TRACK.key];
    expect(keys.filter((key) => others.includes(key))).toEqual([]);
  });
});

/** A Web Audio context, as far as the install reaches it: every buffer it makes is kept. */
function fakeContext(sampleRate: number) {
  const made: { channels: number; length: number; sampleRate: number; data: Float32Array }[] = [];
  const context = {
    sampleRate,
    createBuffer(channels: number, length: number, rate: number) {
      const buffer = { channels, length, sampleRate: rate, data: new Float32Array(length) };
      made.push(buffer);
      return {
        getChannelData: (channel: number) => {
          if (channel !== 0) throw new Error(`no channel ${channel}`);
          return buffer.data;
        },
      };
    },
  };
  return { context, made };
}

/** The game's audio cache, as far as the install reaches it: what was added, by key. */
function audioCache() {
  const added = new Map<string, unknown>();
  const cache: GameplaySoundCache = { add: (key, data) => added.set(key, data) };
  return { cache, added };
}

describe("installGameplaySounds, the boot install (FS-AND39 R12)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should take Web Audio's context and Phaser's audio cache as they are (checked by tsc)", () => {
    const fits = (context: AudioContext, scene: Phaser.Scene): [GameplaySoundContext, GameplaySoundCache] => [
      context,
      scene.cache.audio,
    ];
    expect(fits).toBeTypeOf("function");
  });

  it.each([44100, 48000])("should add the 11 effects, each a mono buffer at the context's %i Hz holding its samples", (rate) => {
    const { context, made } = fakeContext(rate);
    const { cache, added } = audioCache();

    const installed = installGameplaySounds(context, cache);

    expect(installed).toEqual([...GAMEPLAY_EFFECTS]);
    expect([...added.keys()]).toEqual(GAMEPLAY_EFFECTS.map((effect) => `sfx:${effect}`));
    expect(made).toHaveLength(11);
    GAMEPLAY_EFFECTS.forEach((effect, i) => {
      const samples = renderGameplaySfx(effect, rate);
      expect(made[i]).toMatchObject({ channels: 1, sampleRate: rate, length: samples.length });
      expect(made[i].data).toEqual(samples);
      expect(added.get(gameplaySoundKey(effect))).toBeDefined();
    });
  });

  it("should add nothing and throw nothing without a Web Audio context (HTML5 audio, or none)", () => {
    const { cache, added } = audioCache();

    expect(installGameplaySounds(undefined, cache)).toEqual([]);
    expect(added.size).toBe(0);
  });

  it("should leave out an effect whose render throws, and install the rest", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { context } = fakeContext(48000);
    const { cache, added } = audioCache();
    const render = (effect: GameplayEffect, rate: number) => {
      if (effect === "parry") throw new Error("broken recipe");
      return renderGameplaySfx(effect, rate);
    };

    const installed = installGameplaySounds(context, cache, render);

    expect(installed).toEqual(GAMEPLAY_EFFECTS.filter((effect) => effect !== "parry"));
    expect(added.has("sfx:parry")).toBe(false);
    expect(added.size).toBe(10);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("should leave out an effect whose buffer the context refuses, and install the rest", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { context } = fakeContext(48000);
    const refusing = {
      ...context,
      createBuffer(channels: number, length: number, rate: number) {
        if (length > 0.55 * rate) throw new Error("NotSupportedError");
        return context.createBuffer(channels, length, rate);
      },
    };
    const { cache, added } = audioCache();

    installGameplaySounds(refusing, cache);

    const long = GAMEPLAY_EFFECTS.filter((effect) => renderGameplaySfx(effect, 48000).length > 0.55 * 48000);
    expect(long.length).toBeGreaterThan(0);
    expect(added.size).toBe(11 - long.length);
  });
});

/** One effect's sound: every config handed to its play, and every property written on it. */
function fakeSound(key: string) {
  const writes: string[] = [];
  const self = {
    key,
    configs: [] as object[],
    play(config: { volume: number }) {
      self.configs.push({ ...config });
      return true;
    },
  };
  const sound = new Proxy(self, {
    set(target, prop, value) {
      writes.push(String(prop));
      return Reflect.set(target, prop, value);
    },
  });
  return { sound, self, writes };
}

/** The game as the player sees it, the store holding level `level`. */
function player(opts: { cached?: GameplayEffect[]; audible?: boolean; level?: string } = {}) {
  const cached = new Set((opts.cached ?? [...GAMEPLAY_EFFECTS]).map(gameplaySoundKey));
  const sounds = new Map<string, ReturnType<typeof fakeSound>>();
  const added: string[] = [];
  const state = { audible: opts.audible ?? true, level: opts.level ?? "3" };
  const stage: UiSoundStage = {
    cached: (key) => cached.has(key),
    get: (key) => sounds.get(key)?.sound ?? null,
    add: (key) => {
      added.push(key);
      const made = fakeSound(key);
      sounds.set(key, made);
      return made.sound;
    },
    audible: () => state.audible,
  };
  const kv: KeyValueStore = {
    getItem: (key) => (key === SFX_SETTING_KEY ? state.level : null),
    setItem: () => undefined,
    removeItem: () => undefined,
  };
  const store: SfxSettingStore = () => kv;
  const gameplay = new GameplaySounds(stage, store);
  const plays = () => [...sounds.values()].flatMap(({ self }) => self.configs.map(() => self.key));
  return { gameplay, sounds, added, state, plays };
}

describe("GameplaySounds.play, the player (FS-AND39 R13, R14)", () => {
  it.each([1, 2, 3, 4, 5])("should start the effect's one sound at level %i's gain", (n) => {
    const p = player({ level: String(n) });

    p.gameplay.play("hit_monster");

    expect(p.added).toEqual(["sfx:hit_monster"]);
    expect(p.sounds.get("sfx:hit_monster")!.self.configs).toEqual([{ volume: sfxGain(n) }]);
  });

  it("should restart a sounding effect rather than add a second sound, and let different effects overlap", () => {
    const p = player();

    p.gameplay.play("hit_monster");
    p.gameplay.play("hit_monster");
    p.gameplay.play("item_pickup");

    expect(p.added).toEqual(["sfx:hit_monster", "sfx:item_pickup"]);
    expect(p.plays()).toEqual(["sfx:hit_monster", "sfx:hit_monster", "sfx:item_pickup"]);
  });

  it.each<[string, { cached?: GameplayEffect[]; audible?: boolean; level?: string }]>([
    ["at level 0", { level: "0" }],
    ["while the context does not run", { audible: false }],
    ["for an effect not in the cache", { cached: ["parry"] }],
  ])("should play nothing, add nothing and throw nothing %s", (_, opts) => {
    const p = player(opts);

    expect(() => p.gameplay.play("dash")).not.toThrow();

    expect(p.added).toEqual([]);
    expect(p.plays()).toEqual([]);
  });

  it("should play nothing late once the context runs", () => {
    const p = player({ audible: false });

    p.gameplay.play("chest_open");
    p.state.audible = true;

    expect(p.plays()).toEqual([]);
  });

  it("should read the level at each play: a change between two plays is heard on the second", () => {
    const p = player({ level: "5" });

    p.gameplay.play("parry");
    p.state.level = "1";
    p.gameplay.play("parry");

    expect(p.sounds.get("sfx:parry")!.self.configs).toEqual([{ volume: sfxGain(5) }, { volume: sfxGain(1) }]);
  });

  it("should hand its play only a volume and write nothing on the sound: no pitch, rate, detune or pan", () => {
    const p = player();

    p.gameplay.play("shadow_shot");
    p.gameplay.play("shadow_shot");

    const { self, writes } = p.sounds.get("sfx:shadow_shot")!;
    expect(writes).toEqual([]);
    expect(self.configs.map((config) => Object.keys(config))).toEqual([["volume"], ["volume"]]);
  });

  it("should work handed on unbound, as the modules that play are handed it", () => {
    const p = player();
    const { play } = p.gameplay;

    play("triple_fireball");

    expect(p.plays()).toEqual(["sfx:triple_fireball"]);
  });
});

describe("containerOpenEffect, the coffer view's open (FS-AND39 R5)", () => {
  it.each([
    ["chest", "chest_open"],
    ["sack", "loot_open"],
    ["drop_pile", "loot_open"],
    // a kind this client does not know is read as a chest (FS-1D6BX D2)
    ["reliquary", "chest_open"],
  ])("should play %s's open as %s", (kind, effect) => {
    expect(containerOpenEffect(kind as ContainerKind)).toBe(effect);
  });
});
