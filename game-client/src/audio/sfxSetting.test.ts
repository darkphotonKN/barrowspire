import { describe, expect, it, vi } from "vitest";
import type { KeyValueStore } from "@/characters/roster";
import { MUSIC_SETTING_KEY } from "./musicSetting";
import {
  SFX_DEFAULT_LEVEL,
  SFX_MAX_GAIN,
  SFX_SETTING_KEY,
  SFX_TOP_LEVEL,
  clampSfxLevel,
  heldForVisit,
  readSfxLevel,
  rememberSfxLevel,
  sfxGain,
  storedSfxLevel,
} from "./sfxSetting";

/** A browser store holding `held` under the effects' key, recording every key it is asked for. */
function storeWith(held: string | null): KeyValueStore & { set: string[]; keys: string[] } {
  const set: string[] = [];
  const keys: string[] = [];
  return {
    set,
    keys,
    getItem: (key) => {
      keys.push(key);
      return key === SFX_SETTING_KEY ? held : null;
    },
    setItem: (key, value) => {
      keys.push(key);
      if (key === SFX_SETTING_KEY) {
        set.push(value);
        held = value;
      }
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

describe("the effects level's tunables (FS-WDM0X S14)", () => {
  it("should cap the top level at the file's own loudness and default to level 3", () => {
    expect(SFX_MAX_GAIN).toBe(1.0);
    expect(SFX_DEFAULT_LEVEL).toBe(3);
    expect(SFX_TOP_LEVEL).toBe(5);
  });

  it("should map levels 0–5 onto 0, 0.2, 0.4, 0.6, 0.8 and 1.0", () => {
    [0, 0.2, 0.4, 0.6, 0.8, 1].forEach((gain, level) => expect(sfxGain(level)).toBeCloseTo(gain, 12));
  });

  it("should derive every level's gain from the cap, so another cap changes them all", () => {
    expect([0, 1, 2, 3, 4, 5].map((level) => sfxGain(level, 0.5))).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
  });

  it("should keep a level to the whole levels 0 to 5", () => {
    expect([-2, 0, 2.4, 2.6, 5, 9].map(clampSfxLevel)).toEqual([0, 0, 2, 3, 5, 5]);
  });
});

describe("the effects level in this browser (FS-WDM0X S15)", () => {
  it("should keep the level as its digit under barrowspire_sfx, never under the music's key", () => {
    expect(SFX_SETTING_KEY).toBe("barrowspire_sfx");
    const store = storeWith(null);
    for (const level of [0, 1, 2, 3, 4, 5]) rememberSfxLevel(() => store, level);
    readSfxLevel(() => store);

    expect(store.set).toEqual(["0", "1", "2", "3", "4", "5"]);
    expect(store.keys).not.toContain(MUSIC_SETTING_KEY);
  });

  it.each(["0", "1", "2", "3", "4", "5"])("should read %s as that level", (held) => {
    expect(readSfxLevel(() => storeWith(held))).toBe(Number(held));
  });

  it.each([
    ["nothing stored", null],
    ["the music's old off", "off"],
    ["an unknown value", "loud"],
    ["an empty string", ""],
    ["a level past the top", "6"],
    ["a fraction", "2.5"],
    ["a negative level", "-1"],
    ["a padded digit", " 2"],
  ])("should read %s as the default level 3", (_, held) => {
    expect(readSfxLevel(() => storeWith(held))).toBe(SFX_DEFAULT_LEVEL);
  });

  it("should read the default and swallow the write where storage throws, cannot be reached, or is not there", () => {
    const blocked = () => {
      throw new Error("SecurityError");
    };
    for (const store of [throwing, blocked, () => null]) {
      expect(readSfxLevel(store)).toBe(SFX_DEFAULT_LEVEL);
      expect(() => rememberSfxLevel(store, 0)).not.toThrow();
    }
  });
});

describe("heldForVisit, a refused change still holds for this visit (FS-WDM0X S15, Edge States: Storage blocked)", () => {
  it.each([
    ["a store that throws", throwing],
    [
      "a store that cannot be reached",
      () => {
        throw new Error("SecurityError");
      },
    ],
    ["no store", () => null],
  ])("should read back a level the browser refused from %s, and throw nothing", (_, store) => {
    const visit = heldForVisit(store);

    expect(readSfxLevel(visit)).toBe(SFX_DEFAULT_LEVEL);
    expect(() => rememberSfxLevel(visit, 1)).not.toThrow();
    expect(readSfxLevel(visit)).toBe(1);
  });

  it("should read through to the browser while it keeps the level, so another tab's change is heard", () => {
    const store = storeWith("2");
    const visit = heldForVisit(() => store);

    rememberSfxLevel(visit, 4);
    expect(store.set).toEqual(["4"]);
    store.setItem(SFX_SETTING_KEY, "1"); // another tab
    expect(readSfxLevel(visit)).toBe(1);
  });

  it("should read through again once a later write is kept", () => {
    let refuse = true;
    const store = storeWith("2");
    const visit = heldForVisit(() => ({
      ...store,
      setItem: (key, value) => {
        if (refuse) throw new Error("QuotaExceededError");
        store.setItem(key, value);
      },
    }));

    rememberSfxLevel(visit, 0);
    expect(readSfxLevel(visit)).toBe(0);
    refuse = false;
    rememberSfxLevel(visit, 4);
    store.setItem(SFX_SETTING_KEY, "5"); // another tab
    expect(readSfxLevel(visit)).toBe(5);
  });
});

describe("storedSfxLevel, the level alone, for the OPTIONS row (FS-WDM0X S19)", () => {
  it("should read the stored level as it is made, and write each change", () => {
    const store = storeWith("1");
    const control = storedSfxLevel(() => store);

    expect(control.level()).toBe(1);
    control.setLevel(4);

    expect(control.level()).toBe(4);
    expect(store.set).toEqual(["4"]);
  });

  it("should keep a change for this visit where the store refuses the write", () => {
    const control = storedSfxLevel(throwing);

    expect(control.level()).toBe(SFX_DEFAULT_LEVEL);
    expect(() => control.setLevel(1)).not.toThrow();
    expect(control.level()).toBe(1);
  });

  it("should clamp a level outside 0–5 and write nothing for a level it already holds", () => {
    const store = storeWith("5");
    const control = storedSfxLevel(() => store);

    control.setLevel(9);
    control.setLevel(-3);

    expect(store.set).toEqual(["0"]);
    expect(control.level()).toBe(0);
  });
});
