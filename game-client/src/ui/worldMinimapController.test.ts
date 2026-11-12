import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { anchorAt, viewport } from "@/render/viewport";
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
  const minimap = new WorldMinimapController({ stage, world: TOWN, store: reach });
  return { minimap, layers, store };
}

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
    for (const l of layers) expect([l.x, l.y]).toEqual([1270 - MINIMAP.width, 44]);
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
