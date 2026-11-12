import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FULLSCREEN_BUTTON, anchorAt, viewport } from "@/render/viewport";
import { FullscreenButtonPlace } from "@/render/viewport/fullscreenButton";
import { MINIMAP, minimapPanel, type MinimapStage } from "./minimap";
import { MINIMAP_MODE_KEY } from "./minimapMode";
import { TOP_RIGHT_HUD } from "./topRightColumn";
import { WorldMinimapController, bindMinimapKey } from "./worldMinimapController";

// FS-P0HSP §E, §F, §G (review round 1): the town's and a field's minimap on the HUD, one
// controller for both scenes: the stored mode read as the map is built, M's guards and cycle,
// the place at the column's top, the party's dots and the overlay's follow.

type Layer = { x: number; y: number; depth: number; visible: boolean; destroyed: boolean };

/** The scene as the minimap asks it: each layer it makes, recorded. */
function fakeStage() {
  const layers: Layer[] = [];
  const make = () => {
    const l: Layer = { x: 0, y: 0, depth: 0, visible: true, destroyed: false };
    layers.push(l);
    const self: Record<string, unknown> = new Proxy(l as unknown as Record<string, unknown>, {
      get: (t, key) => {
        if (key in t) return t[key as string];
        if (key === "setPosition") return (x: number, y: number) => ((l.x = x), (l.y = y), self);
        if (key === "setDepth") return (d: number) => ((l.depth = d), self);
        if (key === "setVisible") return (v: boolean) => ((l.visible = v), self);
        if (key === "destroy") return () => void (l.destroyed = true);
        return () => self;
      },
    });
    return self;
  };
  const stage = { graphics: make, canvasImage: make } as unknown as MinimapStage;
  return { stage, layers };
}

/** One browser's store for the mode. */
function modeStore(held: string | null = null) {
  const store = { held, writes: [] as [string, string][] };
  const reach = () => ({
    getItem: () => store.held,
    setItem: (key: string, value: string) => void store.writes.push([key, value]),
    removeItem: () => {},
  });
  return { store, reach };
}

const TOWN = { width: 2000, height: 1000 };

function controller(held: string | null = null) {
  const { stage, layers } = fakeStage();
  const { store, reach } = modeStore(held);
  const button = new FullscreenButtonPlace();
  const minimap = new WorldMinimapController({ stage, world: TOWN, store: reach, button });
  return { minimap, layers, store, button };
}

/** The button in the canvas's corner (FS-ZAJMH R18). */
const CORNER = { top: FULLSCREEN_BUTTON.inset, right: FULLSCREEN_BUTTON.inset };

beforeEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));
afterEach(() => {
  viewport.set({ width: 800, height: 600, renderScale: 1 });
  vi.restoreAllMocks();
});

describe("WorldMinimapController (FS-P0HSP §F, §G)", () => {
  it("should build the map in the mode this browser kept, at the column's top (§F.32, §G.35)", () => {
    const { minimap, layers } = controller("enlarged");
    expect(minimap.map.mode).toBe("enlarged");
    const corner = anchorAt(TOP_RIGHT_HUD);
    for (const l of layers) expect([l.x, l.y]).toEqual([corner.x - minimapPanel("enlarged").width, 44]);
  });

  it("should build the map normal where the browser kept nothing", () => {
    const { minimap } = controller();
    expect(minimap.map.mode).toBe("normal");
  });

  it("should step normal, enlarged, overlay and round again, writing each on the run's one key, placed anew (§F.31, §F.32)", () => {
    const { minimap, layers, store } = controller();
    minimap.cycle();
    expect(minimap.map.mode).toBe("enlarged");
    expect(layers[0].x).toBe(1070 - minimapPanel("enlarged").width);
    minimap.cycle();
    expect(minimap.map.mode).toBe("overlay");
    minimap.cycle();
    expect(minimap.map.mode).toBe("normal");
    expect(layers[0].x).toBe(1070 - MINIMAP.width);
    expect(layers[0].y).toBe(10);
    expect(store.writes).toEqual([
      [MINIMAP_MODE_KEY, "enlarged"],
      [MINIMAP_MODE_KEY, "overlay"],
      [MINIMAP_MODE_KEY, "normal"],
    ]);
  });

  it("should follow its corner when the view changes (§G.35)", () => {
    const { minimap, layers } = controller();
    viewport.set({ width: 1280, height: 720, renderScale: 1 });
    minimap.place();
    for (const l of layers) expect([l.x, l.y]).toEqual([1270 - MINIMAP.width, 10]);
  });

  // FS-56CKV §Change: Minimap at the top, fullscreen button beside it, C1–C4, C6 (owner 2026-11-12:
  // "地圖移動到最上面 全螢幕按鈕移動到地圖左側 地圖變2倍蛇才移動到右上角")
  it.each([1080, 1280])(
    "should stand the normal map at the very top, y 10, and hand the button the place at its left, at logical width %i (§Change C1, C2)",
    (width) => {
      viewport.set({ width, height: 720, renderScale: 1 });
      const { layers, button } = controller();
      for (const l of layers) expect([l.x, l.y]).toEqual([width - 10 - MINIMAP.width, 10]);
      // the button's right edge 6 px left of the map's left, its top on the map's top
      expect(button.current).toEqual({ top: 10, right: 10 + MINIMAP.width + MINIMAP.gap });
    },
  );

  it.each([1080, 1280])("should hand the button the corner on M to enlarged, keep it there for the overlay, and beside the map again back at normal, at width %i (§Change C2–C4)", (width) => {
    viewport.set({ width, height: 720, renderScale: 1 });
    const { minimap, layers, button } = controller();
    minimap.cycle();
    expect(button.current).toEqual(CORNER);
    expect(layers[0].y).toBe(44);
    minimap.cycle();
    expect(button.current).toEqual(CORNER);
    minimap.cycle();
    expect(button.current).toEqual({ top: 10, right: 232 });
  });

  it("should hand the button the corner while built in the overlay, and take its place back when it goes (§Change C4, C6)", () => {
    const { minimap, button } = controller("overlay");
    expect(button.current).toEqual(CORNER);
    minimap.cycle();
    expect(button.current).toEqual({ top: 10, right: 232 });
    minimap.destroy();
    expect(button.current).toEqual(CORNER);
  });

  it("should dot the party from the state, and follow the overlay on the self's and the members' drawn figures (§E.29, §F.31)", () => {
    const { minimap } = controller("overlay");
    const party = vi.spyOn(minimap.map, "party");
    const follow = vi.spyOn(minimap.map, "follow");
    minimap.party(
      {
        current_player: { position: { x: 1000, y: 500 } },
        other_players: [
          { id: "wren", entity_id: "e-wren", position: { x: 400, y: 300 } },
          { id: "stranger", entity_id: "e-stranger", position: { x: 1600, y: 800 } },
          { id: "brom", entity_id: "e-brom", position: { x: 200, y: 200 } },
        ],
      },
      ["self", "wren", "brom"],
    );
    expect(party).toHaveBeenCalledWith({ self: { x: 1000, y: 500 }, allies: [{ x: 400, y: 300 }, { x: 200, y: 200 }] });
    const drawn = new Map([
      ["e-wren", { x: 410, y: 300 }],
      ["e-stranger", { x: 1610, y: 800 }],
    ]);
    const self = { x: 1010, y: 505 };
    minimap.follow(self, (id) => drawn.get(id));
    // the stranger's figure is never followed; a member with no drawn figure is left out
    expect(follow).toHaveBeenCalledWith({ x: 1010, y: 505 }, { self: { x: 1010, y: 505 }, allies: [{ x: 410, y: 300 }] });
    // copies, never the scene's own eased points
    const [focus, figures] = follow.mock.calls[0];
    expect(focus).not.toBe(self);
    expect(figures!.allies[0]).not.toBe(drawn.get("e-wren"));
  });

  it("should follow nothing with no figure of the player's own drawn", () => {
    const { minimap } = controller("overlay");
    const follow = vi.spyOn(minimap.map, "follow");
    minimap.follow(undefined, () => ({ x: 0, y: 0 }));
    expect(follow).not.toHaveBeenCalled();
  });

  it("should go, every layer with it", () => {
    const { minimap, layers } = controller();
    minimap.destroy();
    expect(layers.every((l) => l.destroyed)).toBe(true);
  });
});

describe("bindMinimapKey (FS-P0HSP §F.33)", () => {
  function bound(keysOwned = false) {
    const keys: Record<string, (event?: Partial<KeyboardEvent>) => void> = {};
    const keyboard = { on: (name: string, fn: (event?: KeyboardEvent) => void) => void (keys[name] = fn as never) };
    const owned = { now: keysOwned };
    let built: WorldMinimapController | undefined;
    const { minimap, store } = controller();
    bindMinimapKey(keyboard, () => owned.now, () => built);
    const press = (event: Partial<KeyboardEvent> = {}) => keys["keydown-M"]?.(event);
    return { press, owned, minimap, store, build: () => void (built = minimap) };
  }

  it("should bind M as a keydown event, never a captured key", () => {
    const names: string[] = [];
    bindMinimapKey({ on: (name: string) => void names.push(name) }, () => false, () => undefined);
    expect(names).toEqual(["keydown-M"]);
  });

  it("should do nothing before the map is built, and throw nothing", () => {
    const { press, store } = bound();
    expect(() => press()).not.toThrow();
    expect(store.writes).toEqual([]);
  });

  it("should step the map once it is built", () => {
    const { press, build, minimap, store } = bound();
    build();
    press();
    expect(minimap.map.mode).toBe("enlarged");
    expect(store.writes).toHaveLength(1);
  });

  it.each([
    ["a held key's repeat", { repeat: true }, false],
    ["the keys owned (chat typing, a panel up)", {}, true],
  ] as const)("should change nothing on %s", (_what, event, owned) => {
    const { press, build, minimap, store } = bound(owned);
    build();
    press(event);
    expect(minimap.map.mode).toBe("normal");
    expect(store.writes).toEqual([]);
  });

  it("should ask who owns the keys at each press, not once", () => {
    const { press, build, owned, minimap } = bound(true);
    build();
    press();
    owned.now = false;
    press();
    expect(minimap.map.mode).toBe("enlarged");
  });
});
