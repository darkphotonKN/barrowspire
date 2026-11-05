import { describe, expect, it, vi } from "vitest";
import { anchorAt, relayoutOn, type Anchor } from "./anchor";
import { Viewport } from "./viewport";

describe("anchorAt (FS-ZAJMH R12: HUD placed by an anchor to an edge of the logical view)", () => {
  it.each<
    [Anchor, number, number, { x: number; y: number }, { x: number; y: number }]
  >([
    ["top-left", 10, 12, { x: 10, y: 12 }, { x: 10, y: 12 }],
    ["top-right", -10, 10, { x: 1070, y: 10 }, { x: 1270, y: 10 }],
    ["bottom-left", 10, -16, { x: 10, y: 704 }, { x: 10, y: 704 }],
    ["bottom-right", -16, -16, { x: 1064, y: 704 }, { x: 1264, y: 704 }],
    ["bottom-centre", 0, -40, { x: 540, y: 680 }, { x: 640, y: 680 }],
    ["centre", -20, 30, { x: 520, y: 390 }, { x: 620, y: 390 }],
  ])(
    "should put %s (%s, %s) at %o at width 1080 and keep that offset at 1280, %o",
    (anchor, dx, dy, at1080, at1280) => {
      expect(
        anchorAt({ anchor, dx, dy }, { width: 1080, height: 720 }),
      ).toEqual(at1080);
      expect(
        anchorAt({ anchor, dx, dy }, { width: 1280, height: 720 }),
      ).toEqual(at1280);
    },
  );
});

/** A scene's event bus, as far as a re-layout listens to it. */
function fakeScene() {
  const handlers = new Map<string, Set<() => void>>();
  const on = (event: string) => {
    if (!handlers.has(event)) handlers.set(event, new Set());
    return handlers.get(event)!;
  };
  const emit = (event: string) => {
    for (const fn of [...on(event)]) {
      on(event).delete(fn);
      fn();
    }
  };
  return {
    events: {
      once: (event: string, fn: () => void) => void on(event).add(fn),
      off: (event: string, fn: () => void) => void on(event).delete(fn),
    },
    shutdown: () => emit("shutdown"),
    /** `game.destroy(true)`: DESTROY alone, then every listener dropped, no SHUTDOWN. */
    destroy: () => {
      emit("destroy");
      handlers.clear();
    },
    listening: () => [...handlers.values()].reduce((n, h) => n + h.size, 0),
  };
}

describe("relayoutOn (FS-ZAJMH R13: every anchored widget re-lays out when the logical view changes)", () => {
  it("should re-lay out on a change of logical width, and not on a render-scale change alone", () => {
    const v = new Viewport();
    const scene = fakeScene();
    const layout = vi.fn();
    relayoutOn(scene, layout, v);
    v.set({ width: 1080, height: 720, renderScale: 2, cssScale: 1 });
    expect(layout).not.toHaveBeenCalled();
    v.set({ width: 1280, height: 720, renderScale: 2, cssScale: 1 });
    expect(layout).toHaveBeenCalledTimes(1);
  });

  it("should stop once the scene shuts down", () => {
    const v = new Viewport();
    const scene = fakeScene();
    const layout = vi.fn();
    relayoutOn(scene, layout, v);
    scene.shutdown();
    v.set({ width: 1280, height: 720, renderScale: 1 });
    expect(layout).not.toHaveBeenCalled();
    expect(scene.listening()).toBe(0);
  });

  it("should stop once the scene is destroyed without a shutdown, as leaving /game destroys the game (R10, R11)", () => {
    const v = new Viewport();
    const scene = fakeScene();
    const layout = vi.fn();
    relayoutOn(scene, layout, v);
    scene.destroy();
    v.set({ width: 1280, height: 720, renderScale: 1 });
    expect(layout).not.toHaveBeenCalled();
  });

  it("should leave a remounted game's scenes re-laying out after the old game was destroyed", () => {
    const v = new Viewport();
    const old = fakeScene();
    relayoutOn(
      old,
      () => {
        throw new TypeError(
          "Cannot read properties of null (reading 'drawImage')",
        );
      },
      v,
    );
    old.destroy();
    const fresh = fakeScene();
    const layout = vi.fn();
    relayoutOn(fresh, layout, v);
    expect(() =>
      v.set({ width: 1280, height: 720, renderScale: 1 }),
    ).not.toThrow();
    expect(layout).toHaveBeenCalledTimes(1);
  });
});
