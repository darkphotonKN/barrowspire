import { describe, expect, it, vi } from "vitest";
import type { KeyValueStore } from "@/characters/roster";
import { MUSIC_SETTING_KEY, readMusicSetting, rememberMusicSetting } from "./musicSetting";

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

describe("the music setting (FS-28DDG R17)", () => {
  it("should keep on or off in this browser under barrowspire_music", () => {
    expect(MUSIC_SETTING_KEY).toBe("barrowspire_music");
    expect(readMusicSetting(() => storeWith("on"))).toBe("on");
    expect(readMusicSetting(() => storeWith("off"))).toBe("off");
    const store = storeWith(null);
    rememberMusicSetting(() => store, "off");
    rememberMusicSetting(() => store, "on");
    expect(store.set).toEqual(["off", "on"]);
  });

  it.each([
    ["nothing stored", null],
    ["an unknown value", "loud"],
    ["a cased value", "OFF"],
    ["an empty string", ""],
  ])("should read %s as on", (_, held) => {
    expect(readMusicSetting(() => storeWith(held))).toBe("on");
  });

  it("should read on and swallow the write where storage throws, cannot be reached, or is not there (Edge States: Storage refused)", () => {
    const blocked = () => {
      throw new Error("SecurityError");
    };
    for (const store of [throwing, blocked, () => null]) {
      expect(readMusicSetting(store)).toBe("on");
      expect(() => rememberMusicSetting(store, "off")).not.toThrow();
    }
  });
});
