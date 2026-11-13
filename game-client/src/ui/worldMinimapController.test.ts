import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { anchorAt, viewport } from "@/render/viewport";
import { MINIMAP, minimapPanel, type MinimapStage } from "./minimap";
import { MINIMAP_MODE_KEY } from "./minimapMode";
import { TOP_RIGHT_EDGE } from "./topRightColumn";
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
  const minimap = new WorldMinimapController({ stage, world: TOWN, store: reach });
  return { minimap, layers, store };
}

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
    const corner = anchorAt(TOP_RIGHT_EDGE);
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

  // FS-T3DWX §Change: The top-right HUD fills the button's spot, G1–G3: the map in the very corner,
  // in either size, and no place handed to a button
  it.each([1080, 1280])(
    "should stand the normal and the enlarged map in the very corner, y 10, at logical width %i (G2, G3)",
    (width) => {
      viewport.set({ width, height: 720, renderScale: 1 });
      const { minimap, layers } = controller();
      for (const l of layers) expect([l.x, l.y]).toEqual([width - 10 - MINIMAP.width, 10]);
      minimap.cycle();
      for (const l of layers) expect([l.x, l.y]).toEqual([width - 10 - 324, 10]);
    },
  );

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

// FS-WDM0X S7: every step the player makes plays the mode switch; the controller says when it
// stepped, and only cycle() steps it, so building it in the kept mode says nothing
describe("WorldMinimapController's step, heard (FS-WDM0X S7)", () => {
  function heard(held: string | null = null, owned = { now: false }) {
    const { stage } = fakeStage();
    const icon = iconStage();
    const { reach } = modeStore(held);
    const stepped = vi.fn();
    const minimap = new WorldMinimapController({
      stage,
      world: TOWN,
      store: reach,
      icon: { stage: icon.stage, blocked: () => owned.now },
      stepped,
    });
    return { minimap, stepped, owned };
  }

  it("should say nothing as it is built in the kept mode, and once on each step, after the mode is set", () => {
    const { minimap, stepped } = heard("overlay");
    expect(stepped).not.toHaveBeenCalled();
    stepped.mockImplementation(() => expect(minimap.map.mode).toBe("normal"));
    minimap.cycle();
    expect(stepped).toHaveBeenCalledTimes(1);
  });

  it("should say so on a press on the map mode icon, and not on one refused or beside it", () => {
    const { minimap, stepped, owned } = heard();
    minimap.pointerDown(862, 109);
    expect(stepped).toHaveBeenCalledTimes(1);
    owned.now = true;
    minimap.pointerDown(754, 163);
    owned.now = false;
    minimap.pointerDown(10, 10);
    expect(stepped).toHaveBeenCalledTimes(1);
  });

  it("should step as before with no one to tell", () => {
    const { minimap } = controller();
    expect(() => minimap.cycle()).not.toThrow();
    expect(minimap.map.mode).toBe("enlarged");
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
    const minimap = new WorldMinimapController({ stage, world: TOWN, store: reach, icon: { stage: icon.stage, blocked: () => owned.now } });
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
    [1080, "overlay", { x: 1061, y: 10 }],
    [1280, "overlay", { x: 1261, y: 10 }],
  ])("should stand the icon at width %i, kept mode %s: the map's bottom-left, or the very corner in the overlay (D2, D3; FS-T3DWX G4)", (width, held, at) => {
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
    const minimap = new WorldMinimapController({ stage, world: TOWN, store: reach, icon: { stage: icon.stage, blocked: () => false } });
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
    [1080, "enlarged", { x: 1066 - 74, y: 14 }],
    [1280, "enlarged", { x: 1266 - 74, y: 14 }],
    [1080, "overlay", { x: 1055 - 74, y: 7 }],
    [1280, "overlay", { x: 1255 - 74, y: 7 }],
  ])("should stand it at width %i, kept mode %s: inside the map's top-right, normal or enlarged, left of the icon in the overlay (E3, E5; §Change: The enlarged map keeps its labels inside, F1; FS-T3DWX G4)", (width, held, at) => {
    viewport.set({ width, height: 720, renderScale: 1 });
    // the stand-in text is 74 × 15
    const { text } = withName(held);
    expect(text()).toMatchObject({ ...at, visible: true });
  });

  it("should move it with the mode on M (E3, E5, F1)", () => {
    const { minimap, text } = withName();
    minimap.cycle();
    expect(text()).toMatchObject({ x: 1066 - 74, y: 14 });
    minimap.cycle();
    expect(text()).toMatchObject({ x: 1055 - 74, y: 7 });
  });

  it("should give way where its plate meets what the scene hands it, and show again once that goes (E7)", () => {
    const { minimap, text } = withName("enlarged");
    // laid over the name inside the enlarged map's top-right (F4)
    minimap.giveWay([{ x: 1000, y: 20, width: 120, height: 17 }]);
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
    const parts = { stage: fakeStage().stage, world: TOWN, store: modeStore().reach };
    expect(new WorldMinimapController({ ...parts, icon: { stage: icon.stage, blocked: () => false } }).mapName).toBeUndefined();
    expect(new WorldMinimapController({ ...parts, name: "Gentle Meadows" }).mapName).toBeUndefined();
  });
});
