import { EventEmitter } from "eventemitter3";
import { describe, expect, it } from "vitest";
import {
  HubMusic,
  MUSIC_URL,
  sceneMusicStage,
  MUSIC_FADE_IN_MS,
  MUSIC_FADE_OUT_MS,
  MUSIC_KEY,
  MUSIC_VOLUME,
} from "./hubMusic";
import { MUSIC_SETTING_KEY } from "./musicSetting";

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
 * the hub's status and the game's step, which a test advances by hand.
 */
function fakeStage(opts: { cached?: boolean; audible?: boolean } = {}) {
  const sounds: FakeSound[] = [];
  const steps = new Set<(delta: number) => void>();
  const stage = {
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
    hubBusy: () => stage.busy,
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

/** No store at all, which reads as on and keeps nothing (FS-28DDG R17). */
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

describe("hubMusic tunables (FS-28DDG R2, R3, R8)", () => {
  it("should name the volume and the fade lengths", () => {
    expect(MUSIC_VOLUME).toBe(0.4);
    expect(MUSIC_FADE_IN_MS).toBe(2000);
    expect(MUSIC_FADE_OUT_MS).toBe(1000);
    expect(MUSIC_KEY).toBeTypeOf("string");
  });
});

describe("HubMusic entering the hub (FS-28DDG R2, R10)", () => {
  it("should add one sound at volume 0 and ramp it to 0.4 over 2000 ms", () => {
    const stage = fakeStage();
    const music = new HubMusic(stage, ON);

    music.enter();
    const [sound] = stage.sounds;
    expect(stage.sounds).toHaveLength(1);
    expect(sound.plays).toBe(1);

    stage.advance(1000);
    expect(close(sound.volume, MUSIC_VOLUME / 2)).toBe(true);
    stage.advance(1000);
    expect(sound.volume).toBe(MUSIC_VOLUME);
    expect(Math.max(...sound.volumes)).toBe(MUSIC_VOLUME);
    expect(stage.stepping()).toBe(0);
  });
});

describe("HubMusic under a suspended context (FS-28DDG R10, Edge States: Locked context)", () => {
  it("should start the sound at once but hold it silent, and begin the fade-in when the context first runs", () => {
    const stage = fakeStage({ audible: false });
    const music = new HubMusic(stage, ON);

    music.enter();
    const [sound] = stage.sounds;
    expect(sound.plays).toBe(1);
    stage.advance(5000);
    expect(sound.volumes.every((v) => v === 0)).toBe(true);

    stage.canHear = true;
    stage.advance(1000);
    expect(sound.volume).toBeGreaterThan(0);
    expect(sound.volume).toBeLessThan(MUSIC_VOLUME);
    stage.advance(1000);
    expect(sound.volume).toBe(MUSIC_VOLUME);
  });
});

describe("HubMusic leaving the hub (FS-28DDG R3, R13)", () => {
  it("should ramp from the current volume to 0 over 1000 ms, then stop the sound and free it", () => {
    const stage = fakeStage();
    const music = new HubMusic(stage, ON);
    music.enter();
    stage.advance(MUSIC_FADE_IN_MS);
    const [sound] = stage.sounds;

    music.leave("shutdown");
    stage.advance(500);
    expect(close(sound.volume, MUSIC_VOLUME / 2)).toBe(true);
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
    const music = new HubMusic(stage, ON);
    music.enter();
    stage.advance(MUSIC_FADE_IN_MS / 2);
    const [sound] = stage.sounds;

    music.leave("shutdown");
    stage.advance(500);
    expect(close(sound.volume, MUSIC_VOLUME / 4)).toBe(true);
    stage.advance(500);
    expect(sound.volume).toBe(0);
    expect(sound.destroyed).toBe(true);
  });
});

describe("HubMusic entering again (FS-28DDG R4, R5, R13; Edge States: Hub restart, Freed while loading again)", () => {
  it("should take the fading sound back up from its current volume, with no second sound and no restart", () => {
    const stage = fakeStage();
    const music = new HubMusic(stage, ON);
    music.enter();
    stage.advance(MUSIC_FADE_IN_MS);
    const [sound] = stage.sounds;
    music.leave("shutdown");
    stage.advance(500);
    const atLeave = sound.at;

    music.enter();
    stage.advance(1000);
    expect(close(sound.volume, MUSIC_VOLUME * 0.75)).toBe(true);
    stage.advance(1000);

    expect(stage.sounds).toHaveLength(1);
    expect(sound.plays).toBe(1);
    expect(sound.stops).toBe(0);
    expect(sound.at).toBe(atLeave + 2000);
    expect(sound.volume).toBe(MUSIC_VOLUME);
  });

  it("should keep the stopped sound while the hub loads again, and play it from the top on entry", () => {
    const stage = fakeStage();
    const music = new HubMusic(stage, ON);
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
    expect(close(sound.volume, MUSIC_VOLUME / 2)).toBe(true);
  });

  it("should add a new sound from the top once the old one was freed and the track loaded again", () => {
    const stage = fakeStage();
    const music = new HubMusic(stage, ON);
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
    expect(stage.sounds[1].volume).toBe(MUSIC_VOLUME);
  });
});

describe("HubMusic without the track (FS-28DDG R14)", () => {
  it("should add no sound for a key not in the audio cache, and leave quietly", () => {
    const stage = fakeStage({ cached: false });
    const music = new HubMusic(stage, ON);

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

describe("HubMusic left twice (FS-28DDG Edge States: Two leaves in a row)", () => {
  it("should not restart a fade-out already running", () => {
    const stage = fakeStage();
    const music = new HubMusic(stage, ON);
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
    const music = new HubMusic(stage, ON);
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

describe("HubMusic when the game is destroyed (FS-28DDG R21; Edge States: Leaving /game)", () => {
  it.each([
    { when: "mid fade-in", before: MUSIC_FADE_IN_MS / 2, leftFirst: false },
    { when: "playing", before: MUSIC_FADE_IN_MS, leftFirst: false },
    { when: "mid fade-out", before: MUSIC_FADE_IN_MS, leftFirst: true },
  ])(
    "should ask the sound and the cache nothing $when, and let go of the sound",
    ({ before, leftFirst }) => {
      const stage = fakeStage();
      const music = new HubMusic(stage, ON);
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
  opts: { context?: { state: string }; locked?: boolean } = {},
) {
  const audio = new Map<string, unknown>([[MUSIC_KEY, {}]]);
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
  it("should load the mp3 alone from the public audio folder", () => {
    expect(MUSIC_URL).toBe("/audio/music/village.mp3");
  });

  it("should add the track looping at silence, never touching the manager's volume or mute", () => {
    const { scene, added, managerWrites } = fakeScene({
      context: { state: "running" },
    });
    const stage = sceneMusicStage(scene);

    stage.add();

    expect(added).toEqual([
      { key: MUSIC_KEY, config: { loop: true, volume: 0 } },
    ]);
    expect(managerWrites).toEqual([]);
  });

  it("should read the track's key in the audio cache, and remove it", () => {
    const { scene, audio } = fakeScene();
    const stage = sceneMusicStage(scene);

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

      expect(sceneMusicStage(scene).audible()).toBe(audible);
    },
  );

  it.each([
    { status: 1, busy: true },
    { status: 3, busy: true },
    { status: 5, busy: true },
    { status: 8, busy: false },
    { status: 9, busy: false },
  ])(
    "should call the hub busy at scene status $status: $busy",
    ({ status, busy }) => {
      const { scene } = fakeScene();
      scene.sys.settings.status = status;

      expect(sceneMusicStage(scene).hubBusy()).toBe(busy);
    },
  );

  it("should step on the game's own step, which outlives the scene, until let go", () => {
    const { scene, events } = fakeScene();
    const deltas: number[] = [];

    const stop = sceneMusicStage(scene).onStep((delta) => deltas.push(delta));
    events.emit("step", 1000, 16);
    stop();
    events.emit("step", 1016, 16);

    expect(deltas).toEqual([16]);
    expect(events.listenerCount("step")).toBe(0);
  });
});

describe("HubMusic with the music set off (FS-28DDG R17, R18)", () => {
  it("should read the setting on entering and start nothing while it is off", () => {
    const stage = fakeStage();
    const store = settingStore("off");
    const music = new HubMusic(stage, () => store);

    music.enter();
    stage.advance(MUSIC_FADE_IN_MS);

    expect(music.setting).toBe("off");
    expect(stage.sounds.every((sound) => sound.plays === 0)).toBe(true);
  });

  it("should still free the loaded track once the hub is left (R13)", () => {
    const stage = fakeStage();
    const music = new HubMusic(stage, () => settingStore("off"));
    music.enter();

    music.leave("shutdown");
    stage.advance(MUSIC_FADE_OUT_MS);

    expect(stage.uncached).toBe(1);
    expect(stage.sounds.every((sound) => sound.destroyed && sound.plays === 0)).toBe(true);
    expect(stage.stepping()).toBe(0);
  });

  it("should read it again on each entry, a change from another tab included (Edge States: Setting changed in another tab)", () => {
    const stage = fakeStage();
    const store = settingStore(null);
    const music = new HubMusic(stage, () => store);
    music.enter();
    stage.advance(MUSIC_FADE_IN_MS);
    const [sound] = stage.sounds;
    expect(music.setting).toBe("on");

    store.held = "off";
    expect(music.setting).toBe("on");
    music.leave("shutdown");
    stage.busy = true;
    music.enter();
    stage.advance(MUSIC_FADE_OUT_MS);

    expect(music.setting).toBe("off");
    expect(sound.volume).toBe(0);
    expect(sound.stops).toBe(1);
    expect(sound.plays).toBe(1);
  });
});

describe("HubMusic switched from the ESC menu (FS-28DDG R16, R17)", () => {
  /** The music playing at full in a running hub. */
  function playing(held: string | null = null) {
    const stage = fakeStage();
    stage.busy = true;
    const store = settingStore(held);
    const music = new HubMusic(stage, () => store);
    music.enter();
    stage.advance(MUSIC_FADE_IN_MS);
    return { stage, store, music };
  }

  it("should fade the music out and leave it stopped, kept for the running hub, and write off", () => {
    const { stage, store, music } = playing();
    const [sound] = stage.sounds;

    music.toggle();
    expect(music.setting).toBe("off");
    stage.advance(MUSIC_FADE_OUT_MS / 2);
    expect(close(sound.volume, MUSIC_VOLUME / 2)).toBe(true);
    stage.advance(MUSIC_FADE_OUT_MS / 2);

    expect(sound.volume).toBe(0);
    expect(sound.stops).toBe(1);
    expect(sound.destroyed).toBe(false);
    expect(stage.uncached).toBe(0);
    expect(store.writes).toEqual(["off"]);
    expect(stage.stepping()).toBe(0);
  });

  it("should start it from the top and fade it in on a second press, and write on", () => {
    const { stage, store, music } = playing();
    music.toggle();
    stage.advance(MUSIC_FADE_OUT_MS);
    const [sound] = stage.sounds;

    music.toggle();
    expect(music.setting).toBe("on");
    expect(sound.plays).toBe(2);
    expect(sound.at).toBe(0);
    stage.advance(MUSIC_FADE_IN_MS / 2);
    expect(close(sound.volume, MUSIC_VOLUME / 2)).toBe(true);
    stage.advance(MUSIC_FADE_IN_MS / 2);

    expect(sound.volume).toBe(MUSIC_VOLUME);
    expect(stage.sounds).toHaveLength(1);
    expect(store.writes).toEqual(["off", "on"]);
  });

  it("should play at once and fade in when turned on in a hub entered with it off (R18)", () => {
    const stage = fakeStage();
    stage.busy = true;
    const store = settingStore("off");
    const music = new HubMusic(stage, () => store);
    music.enter();
    stage.advance(MUSIC_FADE_IN_MS);

    music.toggle();
    stage.advance(MUSIC_FADE_IN_MS);

    expect(stage.sounds).toHaveLength(1);
    expect(stage.sounds[0].plays).toBe(1);
    expect(stage.sounds[0].volume).toBe(MUSIC_VOLUME);
    expect(store.writes).toEqual(["on"]);
  });

  it("should turn a fade-in around where it stands on Silence (Edge States: Toggled during a fade)", () => {
    const stage = fakeStage();
    stage.busy = true;
    const music = new HubMusic(stage, ON);
    music.enter();
    stage.advance(MUSIC_FADE_IN_MS / 2);
    const [sound] = stage.sounds;

    music.toggle();
    stage.advance(MUSIC_FADE_OUT_MS / 2);
    expect(close(sound.volume, MUSIC_VOLUME / 4)).toBe(true);
    stage.advance(MUSIC_FADE_OUT_MS / 2);

    expect(sound.volume).toBe(0);
    expect(sound.stops).toBe(1);
  });

  it("should turn a fade-out around where it stands on Let the music play, with no second sound and no restart (Edge States: Toggled during a fade)", () => {
    const { stage, music } = playing();
    const [sound] = stage.sounds;
    music.toggle();
    stage.advance(MUSIC_FADE_OUT_MS / 2);
    const at = sound.at;

    music.toggle();
    stage.advance(MUSIC_FADE_IN_MS / 2);
    expect(close(sound.volume, MUSIC_VOLUME * 0.75)).toBe(true);
    stage.advance(MUSIC_FADE_IN_MS / 2);

    expect(sound.volume).toBe(MUSIC_VOLUME);
    expect(stage.sounds).toHaveLength(1);
    expect(sound.plays).toBe(1);
    expect(sound.stops).toBe(0);
    expect(sound.at).toBe(at + MUSIC_FADE_IN_MS);
  });

  it("should free the stopped music as usual once the hub is left (Edge States: Toggled off, then leave)", () => {
    const { stage, music } = playing();
    music.toggle();
    stage.advance(MUSIC_FADE_OUT_MS);
    const [sound] = stage.sounds;

    stage.busy = false;
    music.leave("shutdown");
    stage.advance(MUSIC_FADE_OUT_MS);

    expect(sound.destroyed).toBe(true);
    expect(stage.uncached).toBe(1);
    expect(sound.plays).toBe(1);
    expect(stage.stepping()).toBe(0);
  });

  it("should still switch the music when the store refuses the write (Edge States: Storage refused)", () => {
    const stage = fakeStage();
    stage.busy = true;
    const music = new HubMusic(stage, () => {
      throw new Error("SecurityError");
    });
    music.enter();
    stage.advance(MUSIC_FADE_IN_MS);
    const [sound] = stage.sounds;

    expect(music.setting).toBe("on");
    expect(() => music.toggle()).not.toThrow();
    stage.advance(MUSIC_FADE_OUT_MS);

    expect(music.setting).toBe("off");
    expect(sound.volume).toBe(0);
    expect(sound.stops).toBe(1);
  });
});
