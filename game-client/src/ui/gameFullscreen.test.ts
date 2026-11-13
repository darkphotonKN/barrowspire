import { describe, expect, it, vi } from "vitest";
import { lendFullscreen, lentFullscreen } from "./gameFullscreen";
import type { FullscreenControl } from "./optionsPanel";

/** A game's registry, as Phaser's DataManager answers `get` and `set`. */
function registry() {
  const held = new Map<string, unknown>();
  return {
    get: (key: string) => held.get(key),
    set: (key: string, value: unknown) => void held.set(key, value),
  };
}

const control = (): FullscreenControl => ({ active: () => false, toggle: vi.fn(), watch: () => () => {} });

// FS-T3DWX R12: the page that owns the game frame lends its fullscreen to the game; a scene reads
// it from its own game's registry as it opens the OPTIONS panel
describe("the game's fullscreen, lent through its registry", () => {
  it("should give a scene the control the page lent its game", () => {
    const games = registry();
    const lent = control();
    lendFullscreen(games, lent);
    expect(lentFullscreen(games)).toBe(lent);
  });

  it("should give none where the page lent none (no Fullscreen API), lent nothing yet, or the scene has no registry", () => {
    const none = registry();
    lendFullscreen(none, null);
    expect(lentFullscreen(none)).toBeNull();
    expect(lentFullscreen(registry())).toBeNull();
    expect(lentFullscreen(undefined)).toBeNull();
  });

  it("should keep one game's control to that game", () => {
    const first = registry();
    const second = registry();
    const lent = control();
    lendFullscreen(first, lent);
    expect(lentFullscreen(second)).toBeNull();
  });
});
