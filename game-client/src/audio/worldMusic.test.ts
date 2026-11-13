import { EventEmitter } from "eventemitter3";
import { describe, expect, it } from "vitest";
import {
  WorldMusic,
  sceneMusicStage,
  worldTrack,
  MUSIC_FADE_IN_MS,
  MUSIC_FADE_OUT_MS,
  MUSIC_LEVEL_RAMP_MS,
  TOWER_TRACK,
  VILLAGE_TRACK,
  WORLD_TRACKS,
} from "./worldMusic";
import { MUSIC_DEFAULT_LEVEL, MUSIC_MAX_GAIN, MUSIC_SETTING_KEY, musicGain } from "./musicSetting";

/** The village track's key, which most of these tests play (FS-28DDG; § Change W1). */
const MUSIC_KEY = VILLAGE_TRACK.key;

/** One sound as the module plays it, recording every volume written and each play and stop. */
class FakeSound {
  volumes: number[] = [];
  plays = 0;
  stops = 0;
  destroyed = false;
  /** Where in the track it is, in ms: from the top on each play, as Phaser's stop resets the seek. */
  at = 0;
  set volume(value: number) {
    this.volumes.push(value);
  }
  get volume(): number {
    return this.volumes.at(-1) ?? 0;
  }
  play(): boolean {
    this.plays++;
    this.at = 0;
    return true;
  }
  stop(): boolean {
    this.stops++;
    return true;
  }
  destroy(): void {
    this.destroyed = true;
  }
}

/**
 * The game as the module sees it: the audio cache, the sound manager, whether the context runs,
 * the hub's status and the game's step, which a test advances by hand. Its track is the village's
 * unless `maxGain` names another track's ceiling.
 */
function fakeStage(opts: { cached?: boolean; audible?: boolean; maxGain?: number } = {}) {
  const sounds: FakeSound[] = [];
  const steps = new Set<(delta: number) => void>();
  const stage = {
    maxGain: opts.maxGain ?? VILLAGE_TRACK.maxGain,
    isCached: opts.cached ?? true,
    canHear: opts.audible ?? true,
    busy: false,
    uncached: 0,
    sounds,
    cached: () => stage.isCached,
    add: () => {
      const sound = new FakeSound();
      sounds.push(sound);
      return sound;
    },
    uncache: () => {
      stage.uncached++;
      stage.isCached = false;
    },
    audible: () => stage.canHear,
    worldBusy: () => stage.busy,
    onStep: (tick: (delta: number) => void) => {
      steps.add(tick);
      return () => void steps.delete(tick);
    },
    /** Steps the game `ms` on, in 16 ms frames (the last one shorter). */
    advance(ms: number) {
      for (let left = ms; left > 0; left -= 16) {
        const delta = Math.min(16, left);
        for (const sound of sounds) sound.at += delta;
        for (const tick of [...steps]) tick(delta);
      }
    },
    stepping: () => steps.size,
  };
  return stage;
}

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** The default level's gain, what a browser that never chose plays at (FS-28DDG § Change C9). */
const FULL = musicGain(MUSIC_DEFAULT_LEVEL);

/** No store at all, which reads as the default level and keeps nothing (FS-28DDG R17, § Change C15). */
const ON = () => null;

/** A browser store holding the music setting, recording each write. */
function settingStore(held: string | null) {
  const store = {
    held,
    writes: [] as string[],
    getItem: (key: string) => (key === MUSIC_SETTING_KEY ? store.held : null),
    setItem: (key: string, value: string) => {
      if (key !== MUSIC_SETTING_KEY) return;
      store.writes.push(value);
      store.held = value;
    },
    removeItem: () => {},
  };
  return store;
}

describe("worldMusic tunables (FS-28DDG R2, R3; § Change C10)", () => {
  it("should name the fade lengths and the level ramp", () => {
    expect(MUSIC_FADE_IN_MS).toBe(2000);
    expect(MUSIC_FADE_OUT_MS).toBe(1000);
    expect(MUSIC_LEVEL_RAMP_MS).toBe(200);
    expect(MUSIC_KEY).toBeTypeOf("string");
  });
});

describe("WorldMusic entering the hub (FS-28DDG R2, R10)", () => {
  it("should add one sound at volume 0 and ramp it to the default level's gain over 2000 ms", () => {
    const stage = fakeStage();
    const music = new WorldMusic(stage, ON);

    music.enter();
    const [sound] = stage.sounds;
    expect(stage.sounds).toHaveLength(1);
    expect(sound.plays).toBe(1);

    stage.advance(1000);
    expect(close(sound.volume, FULL / 2)).toBe(true);
    stage.advance(1000);
    expect(sound.volume).toBe(FULL);
    expect(Math.max(...sound.volumes)).toBe(FULL);
    expect(stage.stepping()).toBe(0);
  });
});

describe("WorldMusic under a suspended context (FS-28DDG R10, Edge States: Locked context)", () => {
  it("should start the sound at once but hold it silent, and begin the fade-in when the context first runs", () => {
    const stage = fakeStage({ audible: false });
    const music = new WorldMusic(stage, ON);

    music.enter();
    const [sound] = stage.sounds;
    expect(sound.plays).toBe(1);
    stage.advance(5000);
    expect(sound.volumes.every((v) => v === 0)).toBe(true);

    stage.canHear = true;
    stage.advance(1000);
    expect(sound.volume).toBeGreaterThan(0);
    expect(sound.volume).toBeLessThan(FULL);
    stage.advance(1000);
    expect(sound.volume).toBe(FULL);
  });
});

describe("WorldMusic leaving the hub (FS-28DDG R3, R13)", () => {
  it("should ramp from the current volume to 0 over 1000 ms, then stop the sound and free it", () => {
    const stage = fakeStage();
    const music = new WorldMusic(stage, ON);
    music.enter();
    stage.advance(MUSIC_FADE_IN_MS);
    const [sound] = stage.sounds;

    music.leave("shutdown");
    stage.advance(500);
    expect(close(sound.volume, FULL / 2)).toBe(true);
    expect(sound.stops).toBe(0);
    stage.advance(500);

    expect(sound.volume).toBe(0);
    expect(sound.stops).toBe(1);
    expect(sound.destroyed).toBe(true);
    expect(stage.uncached).toBe(1);
    expect(stage.stepping()).toBe(0);
  });

  it("should fall from wherever the fade-in had reached, over the whole 1000 ms", () => {
    const stage = fakeStage();
    const music = new WorldMusic(stage, ON);
    music.enter();
    stage.advance(MUSIC_FADE_IN_MS / 2);
    const [sound] = stage.sounds;

    music.leave("shutdown");
    stage.advance(500);
    expect(close(sound.volume, FULL / 4)).toBe(true);
    stage.advance(500);
    expect(sound.volume).toBe(0);
    expect(sound.destroyed).toBe(true);
  });
});

describe("WorldMusic entering again (FS-28DDG R4, R5, R13; Edge States: Hub restart, Freed while loading again)", () => {
  it("should take the fading sound back up from its current volume, with no second sound and no restart", () => {
    const stage = fakeStage();
    const music = new WorldMusic(stage, ON);
    music.enter();
    stage.advance(MUSIC_FADE_IN_MS);
    const [sound] = stage.sounds;
    music.leave("shutdown");
    stage.advance(500);
    const atLeave = sound.at;

    music.enter();
    stage.advance(1000);
    expect(close(sound.volume, FULL * 0.75)).toBe(true);
    stage.advance(1000);

    expect(stage.sounds).toHaveLength(1);
    expect(sound.plays).toBe(1);
    expect(sound.stops).toBe(0);
    expect(sound.at).toBe(atLeave + 2000);
    expect(sound.volume).toBe(FULL);
  });

  it("should keep the stopped sound while the hub loads again, and play it from the top on entry", () => {
    const stage = fakeStage();
    const music = new WorldMusic(stage, ON);
    music.enter();
    stage.advance(MUSIC_FADE_IN_MS);
    const [sound] = stage.sounds;
    music.leave("shutdown");
    stage.busy = true;
    stage.advance(MUSIC_FADE_OUT_MS);

    expect(sound.stops).toBe(1);
    expect(sound.destroyed).toBe(false);
    expect(stage.uncached).toBe(0);

    music.enter();
    expect(stage.sounds).toHaveLength(1);
    expect(sound.plays).toBe(2);
    expect(sound.at).toBe(0);
    stage.advance(MUSIC_FADE_IN_MS / 2);
    expect(close(sound.volume, FULL / 2)).toBe(true);
  });

  it("should add a new sound from the top once the old one was freed and the track loaded again", () => {
    const stage = fakeStage();
    const music = new WorldMusic(stage, ON);
    music.enter();
    stage.advance(MUSIC_FADE_IN_MS);
    music.leave("shutdown");
    stage.advance(MUSIC_FADE_OUT_MS);
    expect(stage.isCached).toBe(false);

    stage.isCached = true;
    music.enter();
    stage.advance(MUSIC_FADE_IN_MS);

    expect(stage.sounds).toHaveLength(2);
    expect(stage.sounds[1].plays).toBe(1);
    expect(stage.sounds[1].volume).toBe(FULL);
  });
});

describe("WorldMusic without the track (FS-28DDG R14)", () => {
  it("should add no sound for a key not in the audio cache, and leave quietly", () => {
    const stage = fakeStage({ cached: false });
    const music = new WorldMusic(stage, ON);

    expect(() => {
      music.enter();
      stage.advance(MUSIC_FADE_IN_MS);
      music.leave("shutdown");
      stage.advance(MUSIC_FADE_OUT_MS);
    }).not.toThrow();
    expect(stage.sounds).toHaveLength(0);
    expect(stage.uncached).toBe(0);
    expect(stage.stepping()).toBe(0);
  });
});

describe("WorldMusic left twice (FS-28DDG Edge States: Two leaves in a row)", () => {
  it("should not restart a fade-out already running", () => {
    const stage = fakeStage();
    const music = new WorldMusic(stage, ON);
    music.enter();
    stage.advance(MUSIC_FADE_IN_MS);
    const [sound] = stage.sounds;

    music.leave("shutdown");
    stage.advance(500);
    music.leave("shutdown");
    stage.advance(500);

    expect(sound.volume).toBe(0);
    expect(sound.destroyed).toBe(true);
  });

  it("should do nothing once the music has stopped and been freed", () => {
    const stage = fakeStage();
    const music = new WorldMusic(stage, ON);
    music.enter();
    music.leave("shutdown");
    stage.advance(MUSIC_FADE_OUT_MS);

    music.leave("shutdown");
    stage.advance(MUSIC_FADE_OUT_MS);

    expect(stage.uncached).toBe(1);
    expect(stage.sounds[0].stops).toBe(1);
    expect(stage.stepping()).toBe(0);
  });
});

describe("WorldMusic when the game is destroyed (FS-28DDG R21; Edge States: Leaving /game)", () => {
  it.each([
    { when: "mid fade-in", before: MUSIC_FADE_IN_MS / 2, leftFirst: false },
    { when: "playing", before: MUSIC_FADE_IN_MS, leftFirst: false },
    { when: "mid fade-out", before: MUSIC_FADE_IN_MS, leftFirst: true },
  ])(
    "should ask the sound and the cache nothing $when, and let go of the sound",
    ({ before, leftFirst }) => {
      const stage = fakeStage();
      const music = new WorldMusic(stage, ON);
      music.enter();
      stage.advance(before);
      if (leftFirst) {
        music.leave("shutdown");
        stage.advance(MUSIC_FADE_OUT_MS / 2);
      }
      const [sound] = stage.sounds;
      const written = sound.volumes.length;

      music.leave("destroy");
      stage.advance(MUSIC_FADE_OUT_MS * 2);

      expect(sound.volumes).toHaveLength(written);
      expect(sound.stops).toBe(0);
      expect(sound.destroyed).toBe(false);
      expect(stage.uncached).toBe(0);
      expect(stage.stepping()).toBe(0);
    },
  );
});

/**
 * The slice of a Phaser 4.2.1 scene the music's stage reaches: the game's audio cache, sound
 * manager and events, and the scene's status (`scene/const.js`: INIT 1 … SLEEPING 7, SHUTDOWN 8).
 */
function fakeScene(
  opts: { context?: { state: string }; locked?: boolean; key?: string } = {},
) {
  const audio = new Map<string, unknown>([[opts.key ?? MUSIC_KEY, {}]]);
  const added: { key: string; config: unknown }[] = [];
  const managerWrites: string[] = [];
  const manager = {
    context: opts.context,
    locked: opts.locked ?? false,
    add: (key: string, config: unknown) => {
      added.push({ key, config });
      return new FakeSound();
    },
  };
  const sound = new Proxy(manager, {
    set(target, key, value) {
      managerWrites.push(String(key));
      return Reflect.set(target, key, value);
    },
  });
  const events = new EventEmitter();
  const scene = {
    cache: {
      audio: {
        exists: (key: string) => audio.has(key),
        remove: (key: string) => void audio.delete(key),
      },
    },
    sound,
    game: { events },
    sys: { settings: { status: 5 } },
  };
  return { scene, audio, added, managerWrites, events, manager };
}

describe("sceneMusicStage (FS-28DDG R6–R8, R10, R13)", () => {
  it("should load the village mp3 alone from the public audio folder (R6)", () => {
    expect(VILLAGE_TRACK.urls).toEqual(["/audio/music/village.mp3"]);
  });

  it("should add the track looping at silence, never touching the manager's volume or mute", () => {
    const { scene, added, managerWrites } = fakeScene({
      context: { state: "running" },
    });
    const stage = sceneMusicStage(scene, VILLAGE_TRACK);

    stage.add();

    expect(added).toEqual([
      { key: MUSIC_KEY, config: { loop: true, volume: 0 } },
    ]);
    expect(managerWrites).toEqual([]);
  });

  it("should read the track's key in the audio cache, and remove it", () => {
    const { scene, audio } = fakeScene();
    const stage = sceneMusicStage(scene, VILLAGE_TRACK);

    expect(stage.cached()).toBe(true);
    stage.uncache();
    expect(audio.has(MUSIC_KEY)).toBe(false);
    expect(stage.cached()).toBe(false);
  });

  it.each([
    { context: { state: "suspended" }, locked: true, audible: false },
    // Phaser still counts itself locked while a context handed to it already runs (Edge States)
    { context: { state: "running" }, locked: true, audible: true },
    { context: { state: "interrupted" }, locked: false, audible: false },
    // HTML5 audio, no context: Phaser's own lock says
    { context: undefined, locked: true, audible: false },
    { context: undefined, locked: false, audible: true },
  ])(
    "should call a $context.state context (locked $locked) audible: $audible",
    ({ context, locked, audible }) => {
      const { scene } = fakeScene({ context, locked });

      expect(sceneMusicStage(scene, VILLAGE_TRACK).audible()).toBe(audible);
    },
  );

  it.each([
    { status: 1, busy: true },
    { status: 3, busy: true },
    { status: 5, busy: true },
    { status: 8, busy: false },
    { status: 9, busy: false },
  ])(
    "should call the world busy at scene status $status: $busy",
    ({ status, busy }) => {
      const { scene } = fakeScene();
      scene.sys.settings.status = status;

      expect(sceneMusicStage(scene, VILLAGE_TRACK).worldBusy()).toBe(busy);
    },
  );

  it("should step on the game's own step, which outlives the scene, until let go", () => {
    const { scene, events } = fakeScene();
    const deltas: number[] = [];

    const stop = sceneMusicStage(scene, VILLAGE_TRACK).onStep((delta) => deltas.push(delta));
    events.emit("step", 1000, 16);
    stop();
    events.emit("step", 1016, 16);

    expect(deltas).toEqual([16]);
    expect(events.listenerCount("step")).toBe(0);
  });
});

describe("WorldMusic at level 0, the on/off row's off (FS-28DDG R18; § Change C12, C15)", () => {
  it.each(["off", "0"])("should read the level on entering and start nothing while it is 0 (stored %s)", (held) => {
    const stage = fakeStage();
    const store = settingStore(held);
    const music = new WorldMusic(stage, () => store);

    music.enter();
    stage.advance(MUSIC_FADE_IN_MS);

    expect(music.level()).toBe(0);
    expect(stage.sounds.every((sound) => sound.plays === 0)).toBe(true);
    expect(store.writes).toEqual([]);
  });

  it("should still free the loaded track once the hub is left (R13)", () => {
    const stage = fakeStage();
    const music = new WorldMusic(stage, () => settingStore("0"));
    music.enter();

    music.leave("shutdown");
    stage.advance(MUSIC_FADE_OUT_MS);

    expect(stage.uncached).toBe(1);
    expect(stage.sounds.every((sound) => sound.destroyed && sound.plays === 0)).toBe(true);
    expect(stage.stepping()).toBe(0);
  });

  it("should read it again on each entry, a change from another tab included (Edge States: Changed in a field or a run)", () => {
    const stage = fakeStage();
    const store = settingStore(null);
    const music = new WorldMusic(stage, () => store);
    music.enter();
    stage.advance(MUSIC_FADE_IN_MS);
    const [sound] = stage.sounds;
    expect(music.level()).toBe(MUSIC_DEFAULT_LEVEL);

    store.held = "0";
    expect(music.level()).toBe(MUSIC_DEFAULT_LEVEL);
    music.leave("shutdown");
    stage.busy = true;
    music.enter();
    stage.advance(MUSIC_FADE_OUT_MS);

    expect(music.level()).toBe(0);
    expect(sound.volume).toBe(0);
    expect(sound.stops).toBe(1);
    expect(sound.plays).toBe(1);
  });
});

describe("WorldMusic entering at a stored level (FS-28DDG § Change C9, C12)", () => {
  it.each([
    { held: "1", gain: musicGain(1) },
    { held: "4", gain: musicGain(4) },
    { held: "5", gain: musicGain(5) },
    { held: "on", gain: musicGain(3) },
  ])("should fade in from silence to $gain over 2000 ms at stored $held", ({ held, gain }) => {
    const stage = fakeStage();
    const music = new WorldMusic(stage, () => settingStore(held));

    music.enter();
    const [sound] = stage.sounds;
    stage.advance(MUSIC_FADE_IN_MS / 2);
    expect(sound.volume).toBeCloseTo(gain / 2, 9);
    stage.advance(MUSIC_FADE_IN_MS / 2);

    expect(sound.volume).toBeCloseTo(gain, 12);
    expect(Math.max(...sound.volumes)).toBeCloseTo(gain, 12);
    expect(stage.stepping()).toBe(0);
  });
});

describe("WorldMusic.setLevel, from the Options panel's Music row (FS-28DDG § Change C10–C12, C15)", () => {
  /** The music playing at the default level, its fade-in done, in a running hub. */
  function playing(held: string | null = null) {
    const stage = fakeStage();
    stage.busy = true;
    const store = settingStore(held);
    const music = new WorldMusic(stage, () => store);
    music.enter();
    stage.advance(MUSIC_FADE_IN_MS);
    return { stage, store, music, sound: stage.sounds[0] };
  }

  it("should ramp level 3's gain to level 5's over 200 ms on the game's step for a change from 3 to 5, and keep it", () => {
    const { stage, store, music, sound } = playing();

    music.setLevel(5);
    expect(music.level()).toBe(5);
    stage.advance(MUSIC_LEVEL_RAMP_MS / 2);
    expect(sound.volume).toBeCloseTo(musicGain(4), 9);
    stage.advance(MUSIC_LEVEL_RAMP_MS / 2);

    expect(sound.volume).toBeCloseTo(musicGain(5), 12);
    expect(store.writes).toEqual(["5"]);
    expect(stage.stepping()).toBe(0);
    expect(sound.plays).toBe(1);
    expect(stage.sounds).toHaveLength(1);
  });

  it("should ramp from where the volume stands for a second change mid-ramp", () => {
    const { stage, store, music, sound } = playing();
    music.setLevel(5);
    stage.advance(MUSIC_LEVEL_RAMP_MS / 2);

    music.setLevel(1);
    stage.advance(MUSIC_LEVEL_RAMP_MS / 2);
    expect(sound.volume).toBeCloseTo((musicGain(4) + musicGain(1)) / 2, 9);
    stage.advance(MUSIC_LEVEL_RAMP_MS / 2);

    expect(sound.volume).toBeCloseTo(musicGain(1), 12);
    expect(store.writes).toEqual(["5", "1"]);
  });

  it("should retarget a fade-in: from the volume it reached to the new gain, over the time it has left", () => {
    const stage = fakeStage();
    const music = new WorldMusic(stage, ON);
    music.enter();
    stage.advance(MUSIC_FADE_IN_MS / 2);
    const [sound] = stage.sounds;
    expect(sound.volume).toBeCloseTo(FULL / 2, 9);

    music.setLevel(5);
    stage.advance(MUSIC_FADE_IN_MS / 4);
    expect(sound.volume).toBeCloseTo(FULL / 2 + (musicGain(5) - FULL / 2) / 2, 9);
    stage.advance(MUSIC_FADE_IN_MS / 4);

    expect(sound.volume).toBeCloseTo(musicGain(5), 12);
    expect(stage.stepping()).toBe(0);
    expect(sound.plays).toBe(1);
  });

  it("should give a fade-in retargeted near its end at least the level ramp's 200 ms, so no jump in loudness (C10)", () => {
    const stage = fakeStage();
    const music = new WorldMusic(stage, ON);
    music.enter();
    stage.advance(MUSIC_FADE_IN_MS - 10);
    const [sound] = stage.sounds;
    const reached = sound.volume;

    music.setLevel(5);
    stage.advance(MUSIC_LEVEL_RAMP_MS / 2);
    expect(sound.volume).toBeCloseTo(reached + (musicGain(5) - reached) / 2, 9);
    stage.advance(MUSIC_LEVEL_RAMP_MS / 2 - 1);
    expect(sound.volume).toBeLessThan(musicGain(5));
    stage.advance(1);

    expect(sound.volume).toBeCloseTo(musicGain(5), 12);
    expect(stage.stepping()).toBe(0);
  });

  it("should only change the target of a fade-in not yet heard (R10)", () => {
    const stage = fakeStage({ audible: false });
    const music = new WorldMusic(stage, ON);
    music.enter();
    stage.advance(500);
    const [sound] = stage.sounds;

    music.setLevel(5);
    stage.advance(500);
    expect(sound.volumes.every((v) => v === 0)).toBe(true);
    stage.canHear = true;
    stage.advance(MUSIC_FADE_IN_MS / 2);
    expect(sound.volume).toBeCloseTo(musicGain(5) / 2, 9);
    stage.advance(MUSIC_FADE_IN_MS / 2);

    expect(sound.volume).toBeCloseTo(musicGain(5), 12);
  });

  it("should fade out over 1000 ms from where it stands and stop on a change to 0, kept for the running hub", () => {
    const { stage, store, music, sound } = playing();

    music.setLevel(0);
    stage.advance(MUSIC_FADE_OUT_MS / 2);
    expect(close(sound.volume, FULL / 2)).toBe(true);
    expect(sound.stops).toBe(0);
    stage.advance(MUSIC_FADE_OUT_MS / 2);

    expect(sound.volume).toBe(0);
    expect(sound.stops).toBe(1);
    expect(sound.destroyed).toBe(false);
    expect(stage.uncached).toBe(0);
    expect(store.writes).toEqual(["0"]);
    expect(stage.stepping()).toBe(0);
  });

  it("should start it from the top and fade in over 2000 ms to the new gain on a change from 0", () => {
    const { stage, store, music, sound } = playing();
    music.setLevel(0);
    stage.advance(MUSIC_FADE_OUT_MS);

    music.setLevel(4);
    expect(sound.plays).toBe(2);
    expect(sound.at).toBe(0);
    stage.advance(MUSIC_FADE_IN_MS / 2);
    expect(sound.volume).toBeCloseTo(musicGain(4) / 2, 9);
    stage.advance(MUSIC_FADE_IN_MS / 2);

    expect(sound.volume).toBeCloseTo(musicGain(4), 12);
    expect(stage.sounds).toHaveLength(1);
    expect(store.writes).toEqual(["0", "4"]);
  });

  it("should play at once and fade in on a change from 0 in a hub entered at 0", () => {
    const stage = fakeStage();
    stage.busy = true;
    const store = settingStore("off");
    const music = new WorldMusic(stage, () => store);
    music.enter();
    stage.advance(MUSIC_FADE_IN_MS);

    music.setLevel(2);
    stage.advance(MUSIC_FADE_IN_MS);

    expect(stage.sounds).toHaveLength(1);
    expect(stage.sounds[0].plays).toBe(1);
    expect(stage.sounds[0].volume).toBeCloseTo(musicGain(2), 12);
    expect(store.writes).toEqual(["2"]);
  });

  it("should turn a fade-in around where it stands on a change to 0", () => {
    const stage = fakeStage();
    stage.busy = true;
    const music = new WorldMusic(stage, ON);
    music.enter();
    stage.advance(MUSIC_FADE_IN_MS / 2);
    const [sound] = stage.sounds;

    music.setLevel(0);
    stage.advance(MUSIC_FADE_OUT_MS / 2);
    expect(close(sound.volume, FULL / 4)).toBe(true);
    stage.advance(MUSIC_FADE_OUT_MS / 2);

    expect(sound.volume).toBe(0);
    expect(sound.stops).toBe(1);
  });

  it("should turn the fade-out of a change to 0 around where it stands, with no second sound and no restart (Edge States: Change during the fade-out)", () => {
    const { stage, music, sound } = playing();
    music.setLevel(0);
    stage.advance(MUSIC_FADE_OUT_MS / 2);
    const at = sound.at;

    music.setLevel(4);
    stage.advance(MUSIC_FADE_IN_MS / 2);
    expect(sound.volume).toBeCloseTo(FULL / 2 + (musicGain(4) - FULL / 2) / 2, 9);
    stage.advance(MUSIC_FADE_IN_MS / 2);

    expect(sound.volume).toBeCloseTo(musicGain(4), 12);
    expect(stage.sounds).toHaveLength(1);
    expect(sound.plays).toBe(1);
    expect(sound.stops).toBe(0);
    expect(sound.at).toBe(at + MUSIC_FADE_IN_MS);
  });

  it("should free the stopped music as usual once the hub is left after a change to 0", () => {
    const { stage, music, sound } = playing();
    music.setLevel(0);
    stage.advance(MUSIC_FADE_OUT_MS);

    stage.busy = false;
    music.leave("shutdown");
    stage.advance(MUSIC_FADE_OUT_MS);

    expect(sound.destroyed).toBe(true);
    expect(stage.uncached).toBe(1);
    expect(sound.plays).toBe(1);
    expect(stage.stepping()).toBe(0);
  });

  it("should change nothing and write nothing for the level it already holds, and clamp one outside 0–5", () => {
    const { stage, store, music, sound } = playing();
    const written = sound.volumes.length;

    music.setLevel(MUSIC_DEFAULT_LEVEL);
    stage.advance(MUSIC_LEVEL_RAMP_MS);
    expect(sound.volumes).toHaveLength(written);
    expect(store.writes).toEqual([]);

    music.setLevel(9);
    stage.advance(MUSIC_LEVEL_RAMP_MS);
    expect(music.level()).toBe(5);
    expect(sound.volume).toBeCloseTo(musicGain(5), 12);
    expect(store.writes).toEqual(["5"]);
  });

  it("should still apply the change when the store refuses the write (C15)", () => {
    const stage = fakeStage();
    stage.busy = true;
    const music = new WorldMusic(stage, () => {
      throw new Error("SecurityError");
    });
    music.enter();
    stage.advance(MUSIC_FADE_IN_MS);
    const [sound] = stage.sounds;

    expect(music.level()).toBe(MUSIC_DEFAULT_LEVEL);
    expect(() => music.setLevel(0)).not.toThrow();
    stage.advance(MUSIC_FADE_OUT_MS);

    expect(music.level()).toBe(0);
    expect(sound.volume).toBe(0);
    expect(sound.stops).toBe(1);
  });

  it("should keep and store the level with no track, and play nothing (Edge States: Track failed to load)", () => {
    const stage = fakeStage({ cached: false });
    const store = settingStore(null);
    const music = new WorldMusic(stage, () => store);
    music.enter();

    music.setLevel(5);
    music.setLevel(0);
    music.setLevel(2);
    stage.advance(MUSIC_FADE_IN_MS);

    expect(music.level()).toBe(2);
    expect(store.writes).toEqual(["5", "0", "2"]);
    expect(stage.sounds).toHaveLength(0);
    expect(stage.stepping()).toBe(0);
  });
});

describe("worldMusic tracks, one per world (FS-28DDG § Change: The tower's music on every floor of a run, W1, W5, W8; Tunes FS-28DDG)", () => {
  it("should play the village track in the hub, the tower track in the run, and nothing in a field", () => {
    expect(worldTrack("hub")).toBe(VILLAGE_TRACK);
    expect(worldTrack("run")).toBe(TOWER_TRACK);
    // @ts-expect-error a field plays no music, so it cannot ask for a track
    expect(worldTrack("field")).toBeUndefined();
  });

  it("should load the tower track m4a first, then the owner's ogg, under its own key", () => {
    expect(TOWER_TRACK.urls).toEqual(["/audio/music/tower.m4a", "/audio/music/tower.ogg"]);
    expect(TOWER_TRACK.key).not.toBe(VILLAGE_TRACK.key);
  });

  it("should top the tower at the file's full loudness and keep the village at the shared 0.3 (Tunes FS-28DDG, I-28DDG-8)", () => {
    expect(TOWER_TRACK.maxGain).toBe(1);
    expect(VILLAGE_TRACK.maxGain).toBe(MUSIC_MAX_GAIN);
    expect(VILLAGE_TRACK.maxGain).toBe(0.3);
  });

  // Phaser does not clamp a Web Audio sound's volume: a ceiling over 1 would amplify past the file
  it.each(Object.entries(WORLD_TRACKS))(
    "should keep the %s track's ceiling above 0 and at most the file's full loudness, 1.0",
    (_world, track) => {
      expect(track.maxGain).toBeGreaterThan(0);
      expect(track.maxGain).toBeLessThanOrEqual(1);
    },
  );
});

describe("WorldMusic with a track's own ceiling (FS-28DDG § Change: The tower's music on every floor of a run, W5; Tunes FS-28DDG)", () => {
  it.each([
    { level: 1, gain: 0.2 },
    { level: 2, gain: 0.4 },
    { level: 3, gain: 0.6 },
    { level: 4, gain: 0.8 },
    { level: 5, gain: 1 },
  ])("should fade the tower in to $gain at level $level", ({ level, gain }) => {
    const stage = fakeStage({ maxGain: TOWER_TRACK.maxGain });
    const music = new WorldMusic(stage, () => settingStore(String(level)));

    music.enter();
    stage.advance(MUSIC_FADE_IN_MS);

    expect(stage.sounds[0].volume).toBeCloseTo(gain, 12);
  });

  it("should fade the tower in to 0.6 at the default level", () => {
    const stage = fakeStage({ maxGain: TOWER_TRACK.maxGain });
    const music = new WorldMusic(stage, ON);

    music.enter();
    stage.advance(MUSIC_FADE_IN_MS);

    expect(stage.sounds[0].volume).toBeCloseTo(0.6, 12);
  });

  it("should ramp a tower level change to the new level's gain under its ceiling: 5 is 1.0", () => {
    const stage = fakeStage({ maxGain: TOWER_TRACK.maxGain });
    const store = settingStore(null);
    const music = new WorldMusic(stage, () => store);
    music.enter();
    stage.advance(MUSIC_FADE_IN_MS);

    music.setLevel(5);
    stage.advance(MUSIC_LEVEL_RAMP_MS);

    expect(stage.sounds[0].volume).toBeCloseTo(1, 12);
  });

  it("should leave the village where it was: 0.18 at the default level, 0.3 at level 5", () => {
    const stage = fakeStage({ maxGain: VILLAGE_TRACK.maxGain });
    const store = settingStore(null);
    const music = new WorldMusic(stage, () => store);
    music.enter();
    stage.advance(MUSIC_FADE_IN_MS);
    expect(stage.sounds[0].volume).toBeCloseTo(0.18, 12);

    music.setLevel(5);
    stage.advance(MUSIC_LEVEL_RAMP_MS);

    expect(stage.sounds[0].volume).toBeCloseTo(0.3, 12);
  });

  it("should read the ceiling from its track's stage alone, so the track is named once (review fix)", () => {
    const stage = fakeStage({ maxGain: 0.5 });
    const music = new WorldMusic(stage, ON);

    music.enter();
    stage.advance(MUSIC_FADE_IN_MS);

    expect(stage.sounds[0].volume).toBeCloseTo(musicGain(MUSIC_DEFAULT_LEVEL, 0.5), 12);
    expect(stage.sounds[0].volume).not.toBeCloseTo(FULL, 12);
  });
});

describe("sceneMusicStage for the tower track (FS-28DDG § Change: The tower's music on every floor of a run, W2, W9)", () => {
  it.each([TOWER_TRACK, VILLAGE_TRACK])("should carry $key's own ceiling, the one source of it (W5)", (track) => {
    const { scene } = fakeScene({ key: track.key });

    expect(sceneMusicStage(scene, track).maxGain).toBe(track.maxGain);
  });

  it("should add, find and free the given track's key, never the village's", () => {
    const { scene, audio, added } = fakeScene({ key: TOWER_TRACK.key, context: { state: "running" } });
    const stage = sceneMusicStage(scene, TOWER_TRACK);

    expect(stage.cached()).toBe(true);
    stage.add();
    stage.uncache();

    expect(added).toEqual([{ key: TOWER_TRACK.key, config: { loop: true, volume: 0 } }]);
    expect(audio.has(TOWER_TRACK.key)).toBe(false);
  });

  it("should keep the track while its own world's scene runs or loads again", () => {
    const { scene } = fakeScene({ key: TOWER_TRACK.key });
    const stage = sceneMusicStage(scene, TOWER_TRACK);

    scene.sys.settings.status = 3;
    expect(stage.worldBusy()).toBe(true);
    scene.sys.settings.status = 8;
    expect(stage.worldBusy()).toBe(false);
  });
});
