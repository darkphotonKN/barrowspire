import { describe, expect, it, vi } from "vitest";
import { FULLSCREEN_BUTTON, FULLSCREEN_CORNER, FullscreenButtonPlace, fullscreenHintSide } from "./fullscreenButton";

// FS-56CKV §Change: Minimap at the top, fullscreen button beside it, C6: the place the scene hands
// the button with the column's layout, in logical units from the canvas's top and right edges.
describe("FullscreenButtonPlace (FS-56CKV §Change C6)", () => {
  const beside = { top: 10, right: 232 };

  it("should start in the canvas's corner, FS-ZAJMH R18's 6 px in from the top and the right", () => {
    expect(FULLSCREEN_CORNER).toEqual({ top: FULLSCREEN_BUTTON.inset, right: FULLSCREEN_BUTTON.inset });
    expect(new FullscreenButtonPlace().current).toEqual(FULLSCREEN_CORNER);
  });

  it("should take a handed place and tell its watchers, once per change", () => {
    const place = new FullscreenButtonPlace();
    const heard = vi.fn();
    place.watch(heard);
    const scene = {};
    place.hand(scene, beside);
    expect(place.current).toEqual(beside);
    place.hand(scene, { ...beside });
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("should keep the same object while the place is unchanged, so a reader of it sees no change", () => {
    const place = new FullscreenButtonPlace();
    const scene = {};
    place.hand(scene, beside);
    const first = place.current;
    place.hand(scene, { ...beside });
    expect(place.current).toBe(first);
  });

  it("should go back to the corner when the scene that handed it takes it back", () => {
    const place = new FullscreenButtonPlace();
    const scene = {};
    place.hand(scene, beside);
    place.takeBack(scene);
    expect(place.current).toEqual(FULLSCREEN_CORNER);
  });

  it("should never undo a later scene's place on an earlier scene's end", () => {
    const place = new FullscreenButtonPlace();
    const run = {};
    const town = {};
    place.hand(run, { top: 10, right: 240 });
    place.hand(town, beside);
    place.takeBack(run);
    expect(place.current).toEqual(beside);
  });

  it("should stop telling a watcher that stopped", () => {
    const place = new FullscreenButtonPlace();
    const heard = vi.fn();
    const stop = place.watch(heard);
    stop();
    place.hand({}, beside);
    expect(heard).not.toHaveBeenCalled();
  });
});

// FS-56CKV §Change C9 (owner 2026-11-12: "hover時也有要提示文字"): the hint stands on screen beside
// the button and never under the map: below it in the corner, to its left beside the map
describe("fullscreenHintSide (FS-56CKV §Change C9)", () => {
  it.each([
    ["the corner", FULLSCREEN_CORNER, "below"],
    ["beside the normal map", { top: 10, right: 232 }, "left"],
    ["beside the enlarged map", { top: 10, right: 340 }, "left"],
  ] as const)("should stand the hint %s: %o -> %s", (_where, spot, side) => {
    expect(fullscreenHintSide(spot)).toBe(side);
  });
});
