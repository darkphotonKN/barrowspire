import { describe, expect, it, vi } from "vitest";
import type { KeyValueStore } from "@/characters/roster";
import {
  MUSIC_DEFAULT_LEVEL,
  MUSIC_MAX_GAIN,
  MUSIC_SETTING_KEY,
  MUSIC_TOP_LEVEL,
  musicGain,
  readMusicLevel,
  rememberMusicLevel,
  storedMusicLevel,
} from "./musicSetting";

/** A browser store holding `held` under the music's key. */
function storeWith(held: string | null): KeyValueStore & { set: string[] } {
  const set: string[] = [];
  return {
    set,
    getItem: (key) => (key === MUSIC_SETTING_KEY ? held : null),
    setItem: (key, value) => {
      if (key === MUSIC_SETTING_KEY) set.push(value);
    },
    removeItem: vi.fn(),
  };
}

const throwing = (): KeyValueStore => ({
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
});

describe("the music level's tunables (FS-28DDG § Change: Music volume in an Options panel, C9)", () => {
  it("should cap the loudest level at half the file's loudness and default to level 3", () => {
    expect(MUSIC_MAX_GAIN).toBe(0.5);
    expect(MUSIC_DEFAULT_LEVEL).toBe(3);
    expect(MUSIC_TOP_LEVEL).toBe(5);
  });

  it("should map levels 0–5 linearly onto the cap: 0, 0.1, 0.2, 0.3, 0.4 and 0.5", () => {
    const gains = [0, 1, 2, 3, 4, 5].map((level) => musicGain(level));
    [0, 0.1, 0.2, 0.3, 0.4, 0.5].forEach((gain, level) => expect(gains[level]).toBeCloseTo(gain, 12));
    expect(musicGain(MUSIC_DEFAULT_LEVEL)).toBeCloseTo(0.3, 12);
  });

  it("should derive every level's gain from the cap, so another cap changes them all", () => {
    expect([0, 1, 2, 3, 4, 5].map((level) => musicGain(level, 1))).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });
});

describe("the music level in this browser (FS-28DDG § Change C15)", () => {
  it("should keep the level as its digit under barrowspire_music", () => {
    expect(MUSIC_SETTING_KEY).toBe("barrowspire_music");
    const store = storeWith(null);
    for (const level of [0, 1, 2, 3, 4, 5]) rememberMusicLevel(() => store, level);
    expect(store.set).toEqual(["0", "1", "2", "3", "4", "5"]);
  });

  it.each(["0", "1", "2", "3", "4", "5"])("should read %s as that level", (held) => {
    expect(readMusicLevel(() => storeWith(held))).toBe(Number(held));
  });

  it("should read the on/off row's off as level 0, so a silenced town stays silent", () => {
    expect(readMusicLevel(() => storeWith("off"))).toBe(0);
  });

  it.each([
    ["the on/off row's on", "on"],
    ["nothing stored", null],
    ["an unknown value", "loud"],
    ["a cased value", "OFF"],
    ["an empty string", ""],
    ["a level past the top", "6"],
    ["a fraction", "2.5"],
    ["a negative level", "-1"],
    ["a padded digit", " 2"],
  ])("should read %s as the default level 3", (_, held) => {
    expect(readMusicLevel(() => storeWith(held))).toBe(MUSIC_DEFAULT_LEVEL);
  });

  it("should read the default and swallow the write where storage throws, cannot be reached, or is not there", () => {
    const blocked = () => {
      throw new Error("SecurityError");
    };
    for (const store of [throwing, blocked, () => null]) {
      expect(readMusicLevel(store)).toBe(MUSIC_DEFAULT_LEVEL);
      expect(() => rememberMusicLevel(store, 0)).not.toThrow();
    }
  });
});

describe("storedMusicLevel, the level alone, for a world with no music (FS-28DDG § Change C13, C14)", () => {
  it("should read the stored level as it is made, and write each change", () => {
    const store = storeWith("off");
    const control = storedMusicLevel(() => store);

    expect(control.level()).toBe(0);
    control.setLevel(4);

    expect(control.level()).toBe(4);
    expect(store.set).toEqual(["4"]);
  });

  it("should keep a change for this visit where the store refuses the write", () => {
    const control = storedMusicLevel(throwing);

    expect(control.level()).toBe(MUSIC_DEFAULT_LEVEL);
    expect(() => control.setLevel(1)).not.toThrow();
    expect(control.level()).toBe(1);
  });

  it("should clamp a level outside 0–5 and write nothing for a level it already holds", () => {
    const store = storeWith("5");
    const control = storedMusicLevel(() => store);

    control.setLevel(9);
    expect(control.level()).toBe(5);
    control.setLevel(-2);
    expect(control.level()).toBe(0);
    expect(store.set).toEqual(["0"]);
  });
});
