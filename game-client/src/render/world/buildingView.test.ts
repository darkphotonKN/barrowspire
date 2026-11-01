import { describe, expect, it, vi } from "vitest";
import { BLACKOUT } from "./blackout";
import { BuildingView, type BuildingViewStage, type Figure, type Scenery } from "./buildingView";
import type { House } from "./houses";
import type { BuildingPart, BuiltBuilding, Cover } from "./scene";

/** A drawn part: whether it shows, and whether it is gone. */
interface FakePart {
  visible: boolean;
  destroyed: boolean;
  x: number;
  y: number;
  setVisible(visible: boolean): FakePart;
  destroy(): void;
}

const part = (): FakePart => {
  const p: FakePart = {
    visible: true,
    destroyed: false,
    x: 0,
    y: 0,
    setVisible: (v) => ((p.visible = v), p),
    destroy: () => void (p.destroyed = true),
  };
  return p;
};

/** One building drawn in both looks, a part each, its exterior piece covering at `depth`. */
function built(house: House, depth = 10) {
  const shared = part();
  const interior = part();
  const exterior = part();
  const cover: Cover = {
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    depth,
    part: exterior as unknown as BuildingPart,
  };
  const b = {
    house,
    shared: [shared],
    interior: [interior],
    exterior: [exterior],
    cover: [cover],
    lights: [],
  } as unknown as BuiltBuilding;
  return { b, shared: [shared], interior: [interior], exterior: [exterior] };
}

/** The scene as the view draws on it: the blackout's Graphics and the silhouette's image. */
function stage() {
  const dark = {
    depth: 0,
    visible: true,
    destroyed: false,
    fills: 0,
  };
  const g: Record<string, unknown> = {
    setDepth: (d: number) => ((dark.depth = d), g),
    setVisible: (v: boolean) => ((dark.visible = v), g),
    clear: () => g,
    fillStyle: () => g,
    fillPoints: () => (dark.fills++, g),
    destroy: () => void (dark.destroyed = true),
  };
  const image = { visible: false, made: 0 };
  const img: Record<string, unknown> = {};
  for (const m of ["setTexture", "setPosition", "setOrigin", "setScale", "setFlipX", "setDepth", "setAlpha", "setTintFill", "setMask", "destroy"])
    img[m] = () => img;
  img.setVisible = (v: boolean) => ((image.visible = v), img);
  const masked: unknown[] = [];
  const rt: Record<string, unknown> = {};
  for (const m of ["setOrigin", "setPosition", "setVisible", "clear", "destroy"]) rt[m] = () => rt;
  rt.draw = (piece: unknown) => (masked.push(piece), rt);
  rt.createBitmapMask = () => ({});
  const add = {
    graphics: () => g,
    image: () => (image.made++, img),
    renderTexture: () => rt,
  };
  return { stage: { add } as unknown as BuildingViewStage, dark, image, masked };
}

const INN: House = { id: "inn", x: 100, y: 100, width: 200, height: 100 };
const STORE: House = { id: "store", x: 500, y: 100, width: 200, height: 100 };
// a rect sharing the Inn's east edge: a point on that line is in both
const ANNEX: House = { id: "annex", x: 300, y: 100, width: 100, height: 100 };
const IN_INN = { x: 200, y: 150 };
const IN_STORE = { x: 600, y: 150 };
const ON_STREET = { x: 400, y: 400 };

function view(options: Partial<ConstructorParameters<typeof BuildingView>[1]> = {}) {
  const s = stage();
  const v = new BuildingView(s.stage, { blackout: { wallTop: () => 40, reach: 5000 }, ...options });
  const inn = built(INN);
  const store = built(STORE);
  v.set(inn.b);
  v.set(store.b);
  return { ...s, v, inn, store };
}

/** The player's body, drawn bounds over every piece; only depth decides what covers. */
const figure = (depth: number): Figure => ({
  body: {
    texture: { key: "art" },
    frame: { name: "idle" },
    x: 0,
    y: 0,
    originX: 0.5,
    originY: 0.9,
    scaleX: 1,
    scaleY: 1,
    flipX: false,
    parentContainer: null,
  },
  bounds: { x: 10, y: 10, width: 20, height: 20 },
  depth,
});

describe("BuildingView: where the player is (FS-9PN7X §A)", () => {
  it.each([
    ["in the Inn", IN_INN, "inn"],
    ["in the store", IN_STORE, "store"],
    ["on the street", ON_STREET, undefined],
    ["nowhere (no player to stand anywhere)", undefined, undefined],
  ] as const)("should take the building the player stands in: %s", (_where, eye, id) => {
    const { v } = view();
    v.update(eye);
    expect(v.building?.id).toBe(id);
  });

  it("should pick the first building set when two rects hold the position (§A.2)", () => {
    const { v } = view();
    v.set(built(ANNEX).b);
    v.update({ x: 300, y: 150 });
    expect(v.building?.id).toBe("inn");
  });

  it("should keep a replaced building's place in that order, its old parts destroyed", () => {
    const { v, inn } = view();
    v.set(built(ANNEX).b);
    const again = built(INN);
    v.set(again.b);
    expect(inn.shared[0].destroyed).toBe(true);
    expect(v.drawn.map((b) => b.house.id)).toEqual(["inn", "store", "annex"]);
    v.update({ x: 300, y: 150 });
    expect(v.building?.id).toBe("inn");
  });

  it("should destroy a removed building's parts and forget it", () => {
    const { v, store } = view();
    v.remove("store");
    expect(store.exterior[0].destroyed).toBe(true);
    v.update(IN_STORE);
    expect(v.building).toBeUndefined();
  });
});

describe("BuildingView: looks and scenery (FS-9PN7X §B.2, §B.6, §C.1)", () => {
  it("should close every building from the street, and snap the player's to its interior look the frame they step in", () => {
    const { v, inn, store } = view();
    v.update(ON_STREET);
    expect([inn.shared, inn.exterior, inn.interior].map(([p]) => p.visible)).toEqual([true, true, false]);

    v.update(IN_INN);
    expect([inn.shared, inn.exterior, inn.interior].map(([p]) => p.visible)).toEqual([true, false, true]);
    // every other building stands outside it: hidden whole
    expect([store.shared, store.exterior, store.interior].map(([p]) => p.visible)).toEqual([false, false, false]);

    v.update(ON_STREET);
    expect([store.shared, store.exterior, store.interior].map(([p]) => p.visible)).toEqual([true, true, false]);
    expect(inn.interior[0].visible).toBe(false);
  });

  it("should hide scenery by its footprint, and scenery standing nowhere unless the player is in no building", () => {
    const lamp = part();
    const shelf = part();
    const roof = part();
    const scenery: Scenery[] = [
      { parts: [lamp], at: ON_STREET },
      { parts: [shelf], at: { x: 150, y: 120 } },
      { parts: [roof] },
    ];
    const { v } = view({ scenery: () => scenery });
    v.update(ON_STREET);
    expect([lamp.visible, shelf.visible, roof.visible]).toEqual([true, false, true]);
    v.update(IN_INN);
    expect([lamp.visible, shelf.visible, roof.visible]).toEqual([false, true, false]);
  });

  it("should show the looks again only on a change, or once invalidated, telling the scene each time", () => {
    const onShow = vi.fn();
    const late = part();
    const scenery: Scenery[] = [];
    const { v } = view({ onShow, scenery: () => scenery });
    v.update(IN_INN);
    v.update(IN_INN);
    expect(onShow).toHaveBeenCalledTimes(1);
    expect(onShow).toHaveBeenLastCalledWith(expect.objectContaining({ id: "inn" }));

    // scenery drawn while the player is indoors takes the rule on the next frame
    scenery.push({ parts: [late], at: ON_STREET });
    v.invalidate();
    v.update(IN_INN);
    expect(late.visible).toBe(false);
    expect(onShow).toHaveBeenCalledTimes(2);
  });

  it("should apply the one hide rule and the marker rule for the player's building", () => {
    const { v } = view();
    v.update(ON_STREET);
    expect(v.hidden(IN_INN)).toBe(true);
    expect(v.hidden(ON_STREET)).toBe(false);
    expect(v.markerShown(IN_STORE)).toBe(true);
    v.update(IN_INN);
    expect(v.hidden(IN_INN)).toBe(false);
    expect(v.hidden(ON_STREET)).toBe(true);
    expect(v.markerShown(IN_STORE)).toBe(false);
  });
});

describe("BuildingView: the blackout (FS-9PN7X §D)", () => {
  it("should darken everything but the player's building at the blackout's depth, and go out on the street", () => {
    const { v, dark } = view();
    expect(dark.depth).toBe(BLACKOUT.depth);
    v.update(ON_STREET);
    expect(dark.visible).toBe(false);
    v.update(IN_INN);
    expect(dark.visible).toBe(true);
    expect(dark.fills).toBeGreaterThan(0);
    v.update(ON_STREET);
    expect(dark.visible).toBe(false);
  });

  it("should take everything down for a floor's teardown: buildings destroyed, no blackout, no building", () => {
    const { v, dark, inn } = view();
    v.update(IN_INN);
    v.clear();
    expect(inn.shared[0].destroyed).toBe(true);
    expect(dark.visible).toBe(false);
    expect(v.building).toBeUndefined();
    expect(v.drawn).toHaveLength(0);
  });

  it("should let go of its Graphics with the scene", () => {
    const { v, dark } = view();
    v.destroy();
    expect(dark.destroyed).toBe(true);
  });
});

describe("BuildingView: the silhouette (FS-9PN7X §E)", () => {
  it("should show the player through the pieces covering them from outside, and never inside", () => {
    const { v, image, masked, inn } = view();
    v.update(ON_STREET, figure(5));
    expect(image.visible).toBe(true);
    expect(masked).toContain(inn.exterior[0]);

    v.update(ON_STREET, figure(50));
    expect(image.visible).toBe(false);

    v.update(IN_INN, figure(5));
    expect(image.visible).toBe(false);
  });

  it("should make none without a player to copy, or with no building to stand behind", () => {
    const s = stage();
    const empty = new BuildingView(s.stage, { blackout: { wallTop: () => 40, reach: 5000 } });
    empty.update(ON_STREET, figure(5));
    expect(s.image.made).toBe(0);

    const { v, image } = view();
    v.update(ON_STREET);
    expect(image.made).toBe(0);
    v.update(ON_STREET, figure(5));
    v.update(ON_STREET);
    expect(image.visible).toBe(false);
  });

  it("should count the scene's own cover, read again once invalidated", () => {
    const roof = part();
    const extra: Cover[] = [];
    const { v, masked } = view({ cover: () => extra });
    v.update(ON_STREET, figure(5));
    extra.push({ bounds: { x: 0, y: 0, width: 50, height: 50 }, depth: 20, part: roof as unknown as BuildingPart });
    masked.length = 0;
    v.update(ON_STREET, figure(5));
    expect(masked).not.toContain(roof);

    v.invalidate();
    masked.length = 0;
    v.update(ON_STREET, figure(5));
    expect(masked).toContain(roof);
  });
});
