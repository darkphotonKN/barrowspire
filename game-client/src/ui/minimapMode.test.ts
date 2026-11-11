import { describe, expect, it, vi } from "vitest";
import type { KeyValueStore } from "@/characters/roster";
import { MINIMAP_MODE_KEY, nextMinimapMode, readMinimapMode, rememberMinimapMode } from "./minimapMode";

/** A browser store holding `held` under the mode's key. */
function storeWith(held: string | null): KeyValueStore & { set: string[] } {
  const set: string[] = [];
  return {
    set,
    getItem: (key) => (key === MINIMAP_MODE_KEY ? held : null),
    setItem: (key, value) => {
      if (key === MINIMAP_MODE_KEY) set.push(value);
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

describe("the minimap's modes (FS-1SEF0 §A)", () => {
  it("should cycle normal → enlarged → overlay → normal, with no off step (§A.2)", () => {
    expect(nextMinimapMode("normal")).toBe("enlarged");
    expect(nextMinimapMode("enlarged")).toBe("overlay");
    expect(nextMinimapMode("overlay")).toBe("normal");
  });

  it("should keep the mode in this browser under barrowspire_minimap_mode (§A.4)", () => {
    expect(MINIMAP_MODE_KEY).toBe("barrowspire_minimap_mode");
    for (const mode of ["normal", "enlarged", "overlay"] as const) expect(readMinimapMode(() => storeWith(mode))).toBe(mode);
    const store = storeWith(null);
    rememberMinimapMode(() => store, "overlay");
    expect(store.set).toEqual(["overlay"]);
  });

  it.each([
    ["nothing stored", null],
    ["an old off", "off"],
    ["an unknown value", "huge"],
    ["a cased value", "Overlay"],
    ["an empty string", ""],
  ])("should read %s as normal (§A.5)", (_, held) => {
    expect(readMinimapMode(() => storeWith(held))).toBe("normal");
  });

  it("should start at normal and swallow the write where storage throws or is not there (§A.5)", () => {
    expect(readMinimapMode(throwing)).toBe("normal");
    expect(() => rememberMinimapMode(throwing, "enlarged")).not.toThrow();
    // reaching the store itself may throw (a blocked window.localStorage), or there may be none
    const blocked = () => {
      throw new Error("SecurityError");
    };
    expect(readMinimapMode(blocked)).toBe("normal");
    expect(() => rememberMinimapMode(blocked, "overlay")).not.toThrow();
    expect(readMinimapMode(() => null)).toBe("normal");
    expect(() => rememberMinimapMode(() => null, "overlay")).not.toThrow();
  });
});
