import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FULLSCREEN_BUTTON, anchorAt, viewport } from "@/render/viewport";
import { FullscreenButtonPlace } from "@/render/viewport/fullscreenButton";
import { MINIMAP, minimapPanel, type MinimapStage } from "./minimap";
import { MINIMAP_MODE_KEY } from "./minimapMode";
import { TOP_RIGHT_HUD } from "./topRightColumn";
import type { ModeIconStage } from "./minimapModeIcon";
import { WorldMinimapController, bindMinimapKey, bindMinimapPointer } from "./worldMinimapController";

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

/** The icon's own stage: its glyph, its hint's ground and its hint, recorded apart from the map's layers. */
function iconStage() {
  const made: { destroyed: boolean; words?: string; x?: number; y?: number; visible?: boolean }[] = [];
  const make = (extra: object = {}) => {
    const d = { destroyed: false, width: 74, height: 15, ...extra };
    made.push(d);
    const self: Record<string, unknown> = new Proxy(d as unknown as Record<string, unknown>, {
      get: (t, key) => {
        if (key in t) return t[key as string];
        if (key === "destroy") return () => void (d.destroyed = true);
        if (key === "setPosition") return (x: number, y: number) => (Object.assign(d, { x, y }), self);
        if (key === "setVisible") return (v: boolean) => (Object.assign(d, { visible: v }), self);
        return () => self;
      },
    });
    return self;
  };
  return { stage: { graphics: () => make(), text: (words: string) => make({ words }) } as unknown as ModeIconStage, made };
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
  // the enlarged map at the very top, y 10 (FS-56CKV §Change C3 as amended 2026-11-12)
  it("should build the map in the mode this browser kept, at the column's top (§F.32, §G.35; FS-56CKV §Change C3)", () => {
    const { minimap, layers } = controller("enlarged");
    expect(minimap.map.mode).toBe("enlarged");
    const corner = anchorAt(TOP_RIGHT_HUD);
    for (const l of layers) expect([l.x, l.y]).toEqual([corner.x - minimapPanel("enlarged").width, 10]);
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

  // §Change C3 as amended 2026-11-12 (owner: "1.5倍地圖時全螢幕按鈕一樣要在地圖左側")
  it.each([1080, 1280])("should hand the button the enlarged map's left on M, the corner for the overlay, and the normal map's left again back at normal, at width %i (§Change C2–C4)", (width) => {
    viewport.set({ width, height: 720, renderScale: 1 });
    const { minimap, layers, button } = controller();
    minimap.cycle();
    for (const l of layers) expect([l.x, l.y]).toEqual([width - 10 - 324, 10]);
    expect(button.current).toEqual({ top: 10, right: 10 + 324 + MINIMAP.gap });
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

// FS-56CKV §Change: Map mode icon (owner 2026-11-12: "右上角地圖左下角多加小icon hover顯示可以切換大小或是
// 模式(M)"): the town's and a field's icon, built with the map, a press doing what M does
describe("WorldMinimapController's map mode icon (FS-56CKV §Change: Map mode icon)", () => {
  function withIcon(held: string | null = null, owned = { now: false }) {
    const { stage, layers } = fakeStage();
    const icon = iconStage();
    const { store, reach } = modeStore(held);
    const button = new FullscreenButtonPlace();
    const minimap = new WorldMinimapController({ stage, world: TOWN, store: reach, button, icon: { stage: icon.stage, blocked: () => owned.now } });
    return { minimap, layers, store, owned, icon };
  }

  it("should build the icon with the map on its own stage, leaving the map's layers as they were", () => {
    const { layers, icon } = withIcon();
    // one minimap: map, two vignettes, marks, dots
    expect(layers).toHaveLength(5);
    expect(icon.made.length).toBeGreaterThan(0);
  });

  it.each([
    [1080, null, { x: 858, y: 105 }],
    [1280, null, { x: 1058, y: 105 }],
    [1080, "enlarged", { x: 750, y: 159 }],
    [1280, "enlarged", { x: 950, y: 159 }],
    [1080, "overlay", { x: 1039, y: 12 }],
    [1280, "overlay", { x: 1239, y: 12 }],
  ])("should stand the icon at width %i, kept mode %s: the map's bottom-left, or beside the button in the overlay (D2, D3)", (width, held, at) => {
    viewport.set({ width, height: 720, renderScale: 1 });
    const { minimap } = withIcon(held);
    expect(minimap.modeIcon?.shownAt?.box).toEqual({ ...at, width: 9, height: 9 });
  });

  it("should step the mode on a press on the icon as M does, written on the run's one key, and re-lay the corner (D6)", () => {
    const { minimap, store } = withIcon();
    expect(minimap.pointerDown(862, 109)).toBe(true);
    expect(minimap.map.mode).toBe("enlarged");
    expect(store.writes).toEqual([[MINIMAP_MODE_KEY, "enlarged"]]);
    expect(minimap.modeIcon?.shownAt?.box).toMatchObject({ x: 750, y: 159 });
    expect(minimap.pointerDown(754, 163)).toBe(true);
    expect(minimap.map.mode).toBe("overlay");
  });

  it("should take a press while the keys are owned and do nothing with it, M's guards (D6)", () => {
    const owned = { now: true };
    const { minimap, store } = withIcon(null, owned);
    expect(minimap.pointerDown(862, 109)).toBe(true);
    expect(minimap.map.mode).toBe("normal");
    expect(store.writes).toEqual([]);
  });

  it("should leave a press outside the icon to the world, and cover nothing there (D5)", () => {
    const { minimap } = withIcon();
    expect(minimap.covers(862, 109)).toBe(true);
    expect(minimap.covers(900, 60)).toBe(false);
    expect(minimap.pointerDown(900, 60)).toBe(false);
    expect(minimap.map.mode).toBe("normal");
  });

  it("should light the icon under the pointer, and dim it as the pointer leaves (D7)", () => {
    const { minimap } = withIcon();
    minimap.pointerMove(862, 109);
    expect(minimap.modeIcon?.hovered).toBe(true);
    minimap.pointerOut();
    expect(minimap.modeIcon?.hovered).toBe(false);
  });

  it("should take the icon with it when it goes (D4)", () => {
    const { minimap, icon } = withIcon();
    minimap.destroy();
    expect(icon.made.every((m) => m.destroyed)).toBe(true);
    expect(minimap.covers(862, 109)).toBe(false);
  });

  it("should take no press and build no icon with no icon stage, as before", () => {
    const { minimap } = controller();
    expect(minimap.modeIcon).toBeUndefined();
    expect(minimap.pointerDown(862, 109)).toBe(false);
  });
});

describe("bindMinimapPointer (FS-56CKV §Change: Map mode icon, D5–D7)", () => {
  function bound(covered = { now: false }) {
    const on: Record<string, (pointer?: { x: number; y: number; button?: number }) => void> = {};
    const input = { on: (name: string, fn: (pointer?: { x: number; y: number; button?: number }) => void) => void (on[name] = fn) };
    let built: WorldMinimapController | undefined;
    const { stage } = fakeStage();
    const icon = iconStage();
    const { store, reach } = modeStore();
    const minimap = new WorldMinimapController({ stage, world: TOWN, store: reach, button: new FullscreenButtonPlace(), icon: { stage: icon.stage, blocked: () => false } });
    bindMinimapPointer(input, () => built, (x, y) => covered.now && x > 0 && y > 0);
    return { on, minimap, store, covered, build: () => void (built = minimap) };
  }

  it("should hear the pointer's moves, presses and leaving the canvas", () => {
    const { on } = bound();
    expect(Object.keys(on).sort()).toEqual(["gameout", "pointerdown", "pointermove"]);
  });

  it("should do nothing before the map is built, and throw nothing", () => {
    const { on, store } = bound();
    expect(() => on.pointerdown!({ x: 862, y: 109, button: 0 })).not.toThrow();
    expect(store.writes).toEqual([]);
  });

  it("should step the map on a primary press on the icon, in logical units, and not on another button", () => {
    viewport.set({ width: 1080, height: 720, renderScale: 2 });
    const { on, build, minimap } = bound();
    build();
    on.pointerdown!({ x: 862 * 2, y: 109 * 2, button: 2 });
    expect(minimap.map.mode).toBe("normal");
    on.pointerdown!({ x: 862 * 2, y: 109 * 2, button: 0 });
    expect(minimap.map.mode).toBe("enlarged");
  });

  it("should leave a press and a hover to a panel that covers the icon (the open gear overlay)", () => {
    const covered = { now: true };
    const { on, build, minimap } = bound(covered);
    build();
    on.pointermove!({ x: 862, y: 109 });
    expect(minimap.modeIcon?.hovered).toBe(false);
    on.pointerdown!({ x: 862, y: 109, button: 0 });
    expect(minimap.map.mode).toBe("normal");
    covered.now = false;
    on.pointermove!({ x: 862, y: 109 });
    expect(minimap.modeIcon?.hovered).toBe(true);
    on.gameout!();
    expect(minimap.modeIcon?.hovered).toBe(false);
  });
});

// FS-56CKV §Change: Map name (owner 2026-11-12: "小地圖右上角顯示目前地圖的名字", then
// "兩倍地圖時地圖名稱顯示在全螢幕icon的左邊"): the town's and a field's name, built with the map
describe("WorldMinimapController's map name (FS-56CKV §Change: Map name)", () => {
  function withName(held: string | null = null) {
    const { stage } = fakeStage();
    const icon = iconStage();
    const { reach } = modeStore(held);
    const minimap = new WorldMinimapController({
      stage,
      world: TOWN,
      store: reach,
      button: new FullscreenButtonPlace(),
      icon: { stage: icon.stage, blocked: () => false },
      name: "Gentle Meadows",
    });
    const text = () => icon.made.find((m) => m.words === "Gentle Meadows");
    return { minimap, icon, text };
  }

  it("should make the name's text with the map, on the icon's stage, in the words it was handed (E1, E6)", () => {
    const { minimap, text } = withName();
    expect(text()).toBeDefined();
    expect(minimap.mapName?.words).toBe("Gentle Meadows");
  });

  it.each([
    [1080, null, { x: 1066 - 74, y: 14 }],
    [1280, null, { x: 1266 - 74, y: 14 }],
    [1080, "enlarged", { x: 714 - 74, y: 13 }],
    [1280, "enlarged", { x: 914 - 74, y: 13 }],
    [1080, "overlay", { x: 1033 - 74, y: 9 }],
    [1280, "overlay", { x: 1233 - 74, y: 9 }],
  ])("should stand it at width %i, kept mode %s: inside the map's top-right, left of the button enlarged, left of the icon in the overlay (E3–E5)", (width, held, at) => {
    viewport.set({ width, height: 720, renderScale: 1 });
    // the stand-in text is 74 × 15
    const { text } = withName(held);
    expect(text()).toMatchObject({ ...at, visible: true });
  });

  it("should move it with the mode on M (E3–E5)", () => {
    const { minimap, text } = withName();
    minimap.cycle();
    expect(text()).toMatchObject({ x: 714 - 74, y: 13 });
    minimap.cycle();
    expect(text()).toMatchObject({ x: 1033 - 74, y: 9 });
  });

  it("should give way where its plate meets what the scene hands it, and show again once that goes (E7)", () => {
    const { minimap, text } = withName("enlarged");
    minimap.giveWay([{ x: 600, y: 20, width: 120, height: 17 }]);
    expect(text()!.visible).toBe(false);
    minimap.giveWay([]);
    expect(text()!.visible).toBe(true);
  });

  it("should take the name with it when it goes", () => {
    const { minimap, text } = withName();
    minimap.destroy();
    expect(text()!.destroyed).toBe(true);
  });

  it("should build no name without words or without an icon stage", () => {
    const icon = iconStage();
    const parts = { stage: fakeStage().stage, world: TOWN, store: modeStore().reach, button: new FullscreenButtonPlace() };
    expect(new WorldMinimapController({ ...parts, icon: { stage: icon.stage, blocked: () => false } }).mapName).toBeUndefined();
    expect(new WorldMinimapController({ ...parts, name: "Gentle Meadows" }).mapName).toBeUndefined();
  });
});
