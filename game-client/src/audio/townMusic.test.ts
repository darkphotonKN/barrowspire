import { describe, expect, it } from "vitest";
import { CHAPEL_TRACK, INN_TRACK, TOWN_TRACKS, townMusic, type TownPlace } from "./townMusic";
import { MUSIC_FADE_IN_MS, MUSIC_FADE_OUT_MS, VILLAGE_TRACK, type MusicStage, type MusicTrack } from "./worldMusic";
import { MUSIC_DEFAULT_LEVEL, MUSIC_SETTING_KEY, musicGain } from "./musicSetting";

/** A sound as a track plays it: its last volume, and each play, stop and destroy in order. */
class Sound {
  volume = 0;
  calls: string[] = [];
  play() {
    this.calls.push("play");
    return true;
  }
  stop() {
    this.calls.push("stop");
    return true;
  }
  destroy() {
    this.calls.push("destroy");
  }
}

/**
 * The game as the town's music sees it: one audio cache holding every track that loaded, the hub's
 * status, and one step every track's fades ride on, advanced by hand.
 */
function town(opts: { loaded?: MusicTrack[]; held?: string } = {}) {
  const cache = new Set((opts.loaded ?? Object.values(TOWN_TRACKS)).map((t) => t.key));
  const sounds = new Map<string, Sound>();
  const steps = new Set<(delta: number) => void>();
  const world = { busy: true };
  const kept = new Map<string, string>(opts.held === undefined ? [] : [[MUSIC_SETTING_KEY, opts.held]]);
  const store = () => ({
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  });
  const stageOf = (track: MusicTrack): MusicStage => ({
    maxGain: track.maxGain,
    cached: () => cache.has(track.key),
    add: () => {
      const sound = new Sound();
      sounds.set(track.key, sound);
      return sound;
    },
    uncache: () => void cache.delete(track.key),
    audible: () => true,
    worldBusy: () => world.busy,
    onStep: (tick) => {
      steps.add(tick);
      return () => void steps.delete(tick);
    },
  });
  const music = townMusic(stageOf, store);
  const step = (ms: number) => {
    for (let left = ms; left > 0; left -= 16) for (const tick of [...steps]) tick(Math.min(16, left));
  };
  const sound = (track: MusicTrack) => sounds.get(track.key);
  return { music, step, sound, cache, world, kept };
}

const FULL = musicGain(MUSIC_DEFAULT_LEVEL);

describe("TownMusic (FS-28DDG § Change: The chapel's and the Inn's music)", () => {
  it("should name the village track for the street, and a track of its own for the chapel and the Inn", () => {
    expect(TOWN_TRACKS).toEqual({ street: VILLAGE_TRACK, chapel: CHAPEL_TRACK, inn: INN_TRACK });
    expect(CHAPEL_TRACK.urls).toEqual(["/audio/music/chapel.m4a"]);
    expect(INN_TRACK.urls).toEqual(["/audio/music/inn.m4a"]);
  });

  it.each<[TownPlace, MusicTrack]>([
    ["street", VILLAGE_TRACK],
    ["chapel", CHAPEL_TRACK],
    ["inn", INN_TRACK],
  ])("should play only the %s's track when the hub is entered there", (place, track) => {
    const { music, step, sound } = town();

    music.enter(place);
    step(MUSIC_FADE_IN_MS);

    for (const other of Object.values(TOWN_TRACKS)) {
      if (other === track) {
        expect(sound(other)?.calls).toEqual(["play"]);
        expect(sound(other)?.volume).toBeCloseTo(FULL, 12);
      } else {
        expect(sound(other)?.calls).toEqual([]);
      }
    }
  });

  it("should fade the village out and the chapel's track in over each other on stepping into the chapel", () => {
    const { music, step, sound } = town();
    music.enter("street");
    step(MUSIC_FADE_IN_MS);

    music.moveTo("chapel");
    step(MUSIC_FADE_OUT_MS / 2);

    // halfway through the village's fall, the chapel is already rising
    expect(sound(VILLAGE_TRACK)?.volume).toBeGreaterThan(0);
    expect(sound(VILLAGE_TRACK)?.volume).toBeLessThan(FULL);
    expect(sound(CHAPEL_TRACK)?.volume).toBeGreaterThan(0);

    step(MUSIC_FADE_IN_MS);
    expect(sound(VILLAGE_TRACK)?.calls).toEqual(["play", "stop"]);
    expect(sound(VILLAGE_TRACK)?.volume).toBe(0);
    expect(sound(CHAPEL_TRACK)?.calls).toEqual(["play"]);
    expect(sound(CHAPEL_TRACK)?.volume).toBeCloseTo(FULL, 12);
  });

  it("should keep the stopped village while the hub runs, and start it from the top back on the street", () => {
    const { music, step, sound, cache } = town();
    music.enter("street");
    step(MUSIC_FADE_IN_MS);
    music.moveTo("inn");
    step(MUSIC_FADE_IN_MS);

    expect(cache.has(VILLAGE_TRACK.key)).toBe(true);

    music.moveTo("street");
    step(MUSIC_FADE_IN_MS);

    expect(sound(VILLAGE_TRACK)?.calls).toEqual(["play", "stop", "play"]);
    expect(sound(VILLAGE_TRACK)?.volume).toBeCloseTo(FULL, 12);
    expect(sound(INN_TRACK)?.calls).toEqual(["play", "stop"]);
  });

  it("should do nothing while the player stays where they are", () => {
    const { music, step, sound } = town();
    music.enter("chapel");
    step(MUSIC_FADE_IN_MS);

    music.moveTo("chapel");
    step(MUSIC_FADE_OUT_MS);

    expect(sound(CHAPEL_TRACK)?.calls).toEqual(["play"]);
    expect(sound(CHAPEL_TRACK)?.volume).toBeCloseTo(FULL, 12);
  });

  it("should free every track as the hub is left, the ones never played as well", () => {
    const { music, step, sound, cache, world } = town();
    music.enter("street");
    step(MUSIC_FADE_IN_MS);

    world.busy = false;
    music.leave("shutdown");
    step(MUSIC_FADE_OUT_MS);

    expect(cache.size).toBe(0);
    expect(sound(VILLAGE_TRACK)?.calls).toEqual(["play", "stop", "destroy"]);
    expect(sound(CHAPEL_TRACK)?.calls).toEqual(["destroy"]);
    expect(sound(INN_TRACK)?.calls).toEqual(["destroy"]);
  });

  it("should ask no sound anything when the game is destroyed", () => {
    const { music, step, sound, cache } = town();
    music.enter("inn");
    step(MUSIC_FADE_IN_MS);

    music.leave("destroy");
    step(MUSIC_FADE_OUT_MS);

    expect(sound(INN_TRACK)?.calls).toEqual(["play"]);
    expect(sound(VILLAGE_TRACK)?.calls).toEqual([]);
    expect(cache.size).toBe(3);
  });

  it("should set the level on the playing track, and the next place should read it on entry", () => {
    const { music, step, sound, kept } = town();
    music.enter("chapel");
    step(MUSIC_FADE_IN_MS);

    music.setLevel(5);
    step(MUSIC_FADE_IN_MS);
    expect(music.level()).toBe(5);
    expect(kept.get(MUSIC_SETTING_KEY)).toBe("5");
    expect(sound(CHAPEL_TRACK)?.volume).toBeCloseTo(musicGain(5), 12);

    music.moveTo("street");
    step(MUSIC_FADE_IN_MS);
    expect(music.level()).toBe(5);
    expect(sound(VILLAGE_TRACK)?.volume).toBeCloseTo(musicGain(5), 12);
  });

  it("should start nothing in a new place while the music is at level 0", () => {
    const { music, step, sound } = town({ held: "0" });
    music.enter("street");
    step(MUSIC_FADE_IN_MS);

    music.moveTo("inn");
    step(MUSIC_FADE_IN_MS);

    expect(sound(VILLAGE_TRACK)?.calls).toEqual([]);
    expect(sound(INN_TRACK)?.calls).toEqual([]);
  });

  it("should play the village alone when the indoor tracks failed to load", () => {
    const { music, step, sound } = town({ loaded: [VILLAGE_TRACK] });
    music.enter("street");
    step(MUSIC_FADE_IN_MS);

    music.moveTo("chapel");
    step(MUSIC_FADE_IN_MS);

    // the chapel is silent, as a world whose track failed is (R14)
    expect(sound(CHAPEL_TRACK)).toBeUndefined();
    expect(sound(VILLAGE_TRACK)?.calls).toEqual(["play", "stop"]);
  });
});
