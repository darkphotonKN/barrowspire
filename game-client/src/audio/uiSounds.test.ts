import { describe, expect, it } from "vitest";
import type * as Phaser from "phaser";
import type { KeyValueStore } from "@/characters/roster";
import { SFX_DEFAULT_LEVEL, SFX_MAX_GAIN, SFX_SETTING_KEY, sfxGain, type SfxSettingStore } from "./sfxSetting";
import {
  UI_EFFECTS,
  UiSounds,
  sceneUiSoundStage,
  uiSoundKey,
  uiSoundUrls,
  windowSound,
  type UiEffect,
  type UiSoundScene,
  type UiSoundStage,
  type WindowState,
} from "./uiSounds";

/** A window state with only `open` open. */
function open(...windows: (keyof WindowState)[]): WindowState {
  const state: WindowState = { menu: false, letter: false, party: false, inventory: false, character: false };
  for (const w of windows) state[w] = true;
  return state;
}

describe("windowSound, the one rule (FS-WDM0X S8, S3, S5, S6)", () => {
  it.each<[string, WindowState, WindowState, UiEffect | null]>([
    ["the menu opening over the gear and the party panel", open("inventory", "character", "party"), open("menu"), "settings_open"],
    ["the letter panel opening over the gear", open("inventory", "character"), open("letter"), "mailbox_open"],
    ["the inventory opening over the letter panel", open("letter"), open("inventory"), "inventory_open"],
    ["the party panel opening over the letter panel", open("letter"), open("party"), "party_open"],
    ["the character panel opening over the letter panel", open("letter"), open("character"), "character_open"],
    ["the character panel opening beside the open inventory", open("inventory"), open("inventory", "character"), "character_open"],
    ["both gear panels closing", open("inventory", "character"), open(), "inventory_close"],
    ["the character panel alone closing", open("inventory", "character"), open("inventory"), "character_close"],
    ["the menu closing over nothing", open("menu"), open(), "settings_close"],
    ["the letter panel closing", open("letter"), open(), "mailbox_close"],
    ["the party panel closing", open("party", "inventory"), open("inventory"), "party_close"],
    ["the menu slot occupied before and after (an OPTIONS swap)", open("menu"), open("menu"), null],
    ["nothing changing", open("inventory", "party"), open("inventory", "party"), null],
    ["nothing open before or after", open(), open(), null],
  ])("should give %s its one effect", (_, before, after, effect) => {
    expect(windowSound(before, after)).toBe(effect);
  });
});

/**
 * One effect's sound as Phaser 4.2.1 plays it: one config object, which `play(config)` merges the
 * given config into, since `Extend` mutates its target, and then applies (`BaseSound.play`,
 * BaseSound.js:318, :338, then `createAndStartBufferSource` → `applyConfig`). The volume setter
 * writes that same config (`currentConfig === config`, BaseSound.js:147–149), so a volume written
 * before a play holds as well. Every property written on the sound, and every config handed to
 * its play, is recorded.
 */
function fakeSound(key: string) {
  const writes: string[] = [];
  const configs: object[] = [];
  const config = { volume: 1 };
  const self = {
    key,
    plays: 0,
    configs,
    /** The volume it sounds at: its config's. */
    get heard() {
      return config.volume;
    },
    get volume() {
      return config.volume;
    },
    set volume(value: number) {
      config.volume = value;
    },
    play(given?: { volume?: number }) {
      self.plays++;
      configs.push({ ...given });
      Object.assign(config, given);
      return true;
    },
  };
  const sound = new Proxy(self, {
    set(target, prop, value) {
      writes.push(String(prop));
      return Reflect.set(target, prop, value);
    },
  });
  return { sound, writes, self };
}

/** The game as the player sees it: which effects are cached, whether the context runs, and the sounds added so far. */
function fakeStage(opts: { cached?: UiEffect[]; audible?: boolean } = {}) {
  const cached = new Set((opts.cached ?? [...UI_EFFECTS]).map(uiSoundKey));
  const sounds = new Map<string, ReturnType<typeof fakeSound>>();
  const added: string[] = [];
  const state = { audible: opts.audible ?? true };
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
  return { stage, sounds, added, state, cached };
}

/** A browser store holding the effects' level, `"3"` until a test writes another. */
function levelStore(held: string | null = "3") {
  const store = { held };
  const kv: KeyValueStore = {
    getItem: (key) => (key === SFX_SETTING_KEY ? store.held : null),
    setItem: (key, value) => {
      if (key === SFX_SETTING_KEY) store.held = value;
    },
    removeItem: () => undefined,
  };
  const reach: SfxSettingStore = () => kv;
  return { store, reach };
}

/** A player over a fake stage, a store and a window state the test moves by hand. */
function player(opts: { cached?: UiEffect[]; audible?: boolean; level?: string | null } = {}) {
  const fake = fakeStage(opts);
  const level = levelStore(opts.level === undefined ? "3" : opts.level);
  const windows = open();
  const sounds = new UiSounds(fake.stage, level.reach, () => ({ ...windows }));
  /** Every effect started, in order. */
  const played = () =>
    [...fake.sounds.values()].flatMap(({ self }) => Array.from({ length: self.plays }, () => self.key));
  /** The one sound added for `key`. */
  const soundOf = (key: string) => fake.sounds.get(key)!;
  return { ...fake, level, windows, sounds, played, soundOf };
}

describe("the effects' files (FS-WDM0X S1, S21; S21 order set by the integrator)", () => {
  it("should name the owner's 11 effects", () => {
    expect([...UI_EFFECTS].sort()).toEqual(
      [
        "character_close",
        "character_open",
        "inventory_close",
        "inventory_open",
        "mailbox_close",
        "mailbox_open",
        "map_mode_switch",
        "party_close",
        "party_open",
        "settings_close",
        "settings_open",
      ].sort(),
    );
  });

  it("should key each as sfx:<name> and load it m4a first, then the ogg", () => {
    expect(uiSoundKey("party_open")).toBe("sfx:party_open");
    expect(uiSoundUrls("party_open")).toEqual(["/audio/sfx/party_open.m4a", "/audio/sfx/party_open.ogg"]);
  });
});

describe("UiSounds.play, the player (FS-WDM0X S10–S13, S16, S22)", () => {
  it.each([1, 2, 3, 4, 5])("should start the effect's one sound at level %i's gain, handed to its play", (n) => {
    const p = player({ level: String(n) });

    p.sounds.play("inventory_open");

    expect(p.added).toEqual(["sfx:inventory_open"]);
    const { self } = p.soundOf("sfx:inventory_open");
    expect(self.plays).toBe(1);
    expect(self.configs).toEqual([{ volume: sfxGain(n) }]);
    expect(self.heard).toBeCloseTo((SFX_MAX_GAIN * n) / 5, 12);
    expect(self.heard).toBeCloseTo(sfxGain(n), 12);
  });

  it("should restart a sounding effect from the top rather than add a second sound of it", () => {
    const p = player();

    p.sounds.play("character_close");
    p.sounds.play("character_close");

    expect(p.added).toEqual(["sfx:character_close"]);
    expect(p.played()).toEqual(["sfx:character_close", "sfx:character_close"]);
  });

  it("should let different effects sound at once, each its own sound", () => {
    const p = player();

    p.sounds.play("inventory_open");
    p.sounds.play("character_open");

    expect(p.added).toEqual(["sfx:inventory_open", "sfx:character_open"]);
  });

  it.each<[string, { cached?: UiEffect[]; audible?: boolean; level?: string | null }]>([
    ["at level 0", { level: "0" }],
    ["while the context does not run", { audible: false }],
    ["for an effect that failed to load", { cached: ["party_open"] }],
  ])("should play nothing, add no sound and throw nothing %s", (_, opts) => {
    const p = player(opts);

    expect(() => p.sounds.play("inventory_open")).not.toThrow();

    expect(p.added).toEqual([]);
    expect(p.played()).toEqual([]);
  });

  it("should play nothing late once the context runs", () => {
    const p = player({ audible: false });

    p.sounds.play("settings_open");
    p.state.audible = true;

    expect(p.played()).toEqual([]);
    p.sounds.play("settings_close");
    expect(p.played()).toEqual(["sfx:settings_close"]);
  });

  it("should play at the default level where nothing is kept", () => {
    const p = player({ level: null });

    p.sounds.play("map_mode_switch");

    expect(p.soundOf("sfx:map_mode_switch").self.heard).toBeCloseTo(sfxGain(SFX_DEFAULT_LEVEL), 12);
  });

  it("should read the kept level at each play: a change written between two plays is heard on the second", () => {
    const p = player({ level: "5" });

    p.sounds.play("party_open");
    expect(p.soundOf("sfx:party_open").self.heard).toBeCloseTo(1, 12);
    p.level.store.held = "1";
    p.sounds.play("party_open");
    expect(p.soundOf("sfx:party_open").self.heard).toBeCloseTo(0.2, 12);
    p.level.store.held = "0";
    p.sounds.play("party_open");
    expect(p.soundOf("sfx:party_open").self.plays).toBe(2);
  });

  it("should hand its play only a volume and write nothing on the sound: no pitch, rate or detune", () => {
    const p = player();

    p.sounds.play("mailbox_open");
    p.sounds.play("mailbox_open");

    const { writes, self } = p.soundOf("sfx:mailbox_open");
    expect(writes).toEqual([]);
    expect(self.configs.map((given) => Object.keys(given))).toEqual([["volume"], ["volume"]]);
  });
});

describe("UiSounds.act, the wrapper every player path runs through (FS-WDM0X S9)", () => {
  it("should play the rule's effect for the change its action made, and hand back what the action returned", () => {
    const p = player();

    const result = p.sounds.act(() => {
      p.windows.inventory = true;
      return "open now";
    });

    expect(result).toBe("open now");
    expect(p.played()).toEqual(["sfx:inventory_open"]);
  });

  it("should play once, for the outer action's change, when called inside another", () => {
    const p = player();
    p.windows.letter = true;

    p.sounds.act(() => {
      p.sounds.act(() => {
        p.windows.letter = false;
      });
      p.sounds.act(() => {
        p.windows.party = true;
      });
    });

    expect(p.played()).toEqual(["sfx:party_open"]);
  });

  it("should play nothing for a change made outside it", () => {
    const p = player();

    p.windows.menu = true;
    p.windows.inventory = true;
    p.sounds.act(() => undefined);

    expect(p.played()).toEqual([]);
  });

  it("should play nothing for an action that changes nothing, and nothing for a menu ↔ OPTIONS swap", () => {
    const p = player();
    p.windows.menu = true;

    p.sounds.act(() => {
      p.windows.menu = false; // closeMenu()
      p.windows.menu = true; // the OPTIONS panel in the slot
    });

    expect(p.played()).toEqual([]);
  });

  it("should play nothing for an action that throws, pass the throw on, and play again after", () => {
    const p = player();

    expect(() =>
      p.sounds.act(() => {
        p.windows.party = true;
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(p.played()).toEqual([]);

    p.sounds.act(() => void (p.windows.party = false));
    expect(p.played()).toEqual(["sfx:party_close"]);
  });

  it("should work handed on unbound, as a module that hears its own input gets it", () => {
    const p = player();
    const { act, play } = p.sounds;

    act(() => void (p.windows.character = true));
    play("map_mode_switch");

    expect(p.played()).toEqual(["sfx:character_open", "sfx:map_mode_switch"]);
  });
});

/** The slice of a Phaser 4.2.1 scene the effects' stage reaches, every write on its sound manager recorded. */
function fakeScene(opts: { context?: { state: string }; locked?: boolean; cached?: string[] } = {}) {
  const audio = new Set(opts.cached ?? [uiSoundKey("inventory_open")]);
  const list: { key: string }[] = [];
  const addCalls: unknown[][] = [];
  const managerWrites: string[] = [];
  const manager = {
    context: opts.context,
    locked: opts.locked ?? false,
    get: (key: string) => list.find((s) => s.key === key) ?? null,
    add: (...args: unknown[]) => {
      addCalls.push(args);
      const made = fakeSound(String(args[0])).sound;
      list.push(made);
      return made;
    },
  };
  const sound = new Proxy(manager, {
    set(target, key, value) {
      managerWrites.push(String(key));
      return Reflect.set(target, key, value);
    },
  });
  const scene = { cache: { audio: { exists: (key: string) => audio.has(key) } }, sound };
  return { scene, addCalls, managerWrites, list };
}

describe("sceneUiSoundStage (FS-WDM0X S11–S13)", () => {
  it("should take a Phaser scene as it is (checked by tsc)", () => {
    const fits = (scene: Phaser.Scene): UiSoundScene => scene;
    expect(fits).toBeTypeOf("function");
  });

  it("should read the game's audio cache", () => {
    const stage = sceneUiSoundStage(fakeScene().scene);

    expect(stage.cached(uiSoundKey("inventory_open"))).toBe(true);
    expect(stage.cached(uiSoundKey("party_open"))).toBe(false);
  });

  it("should add a sound by its key alone, and find it again on the game's sound manager", () => {
    const { scene, addCalls } = fakeScene();
    const stage = sceneUiSoundStage(scene);

    expect(stage.get("sfx:inventory_open")).toBeNull();
    const added = stage.add("sfx:inventory_open");

    expect(addCalls).toEqual([["sfx:inventory_open"]]);
    expect(stage.get("sfx:inventory_open")).toBe(added);
  });

  it("should play through the game's manager without writing its volume or mute", () => {
    const { scene, managerWrites, addCalls } = fakeScene({ context: { state: "running" } });
    const sounds = new UiSounds(sceneUiSoundStage(scene), levelStore("4").reach, () => open());

    sounds.play("inventory_open");
    sounds.play("inventory_open");

    expect(addCalls).toHaveLength(1);
    expect(managerWrites).toEqual([]);
  });

  it.each([
    { context: { state: "suspended" }, locked: true, audible: false },
    // Phaser still counts itself locked while a context handed to it already runs, as WorldMusic's check
    { context: { state: "running" }, locked: true, audible: true },
    { context: { state: "interrupted" }, locked: false, audible: false },
    // HTML5 audio, no context: Phaser's own lock says
    { context: undefined, locked: true, audible: false },
    { context: undefined, locked: false, audible: true },
  ])("should call a $context.state context (locked $locked) audible: $audible", ({ context, locked, audible }) => {
    expect(sceneUiSoundStage(fakeScene({ context, locked }).scene).audible()).toBe(audible);
  });
});
