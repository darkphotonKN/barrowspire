import { describe, expect, it, vi } from "vitest";
import type { Facing8 } from "@/render/iso/facing";
import type { Rect } from "@/render/iso/projection";
import type { WallState } from "@/types/gameState";
import { housesFrom, insideHouse, type House } from "./houses";
import {
  HUB_FIXED_RESIDENTS,
  HUB_FURNISHINGS,
  HUB_INDOOR_DRESSING,
  furnishingOf,
  isFurnishing,
  placeholderWarning,
  residentFacing,
  splitFurnishings,
  type IndoorSpot,
} from "./hubInteriors";
import { HUB_TOWN_GOLDEN, type TownRect } from "./hubTownGolden";

/**
 * The town's buildings and furnishings, from the golden of
 * game-server/game-service/internal/game/hub_map.go (hubBuildings): walled 20 thick as
 * addHubBuilding does, the south wall cut in two around a centred 50 px door gap, each furnishing
 * a wall carrying its building's house id (FS-B0H2D R1–R3, R9, R10, R12). In hub_map.go's order:
 * the Inn, the Quartermaster's store, the smithy.
 */
const rect4 = ({ x, y, w, h }: TownRect): [number, number, number, number] => [x, y, w, h];
const BUILDINGS = HUB_TOWN_GOLDEN.buildings.map(rect4);
const THICK = 20;
const DOOR = 50;

const wall = (id: string, house: string, [x, y, w, h]: number[]): WallState => ({
  entity_id: id,
  house_id: house,
  position: { x, y },
  width: w,
  height: h,
});
const BUILDING_WALLS: WallState[] = BUILDINGS.flatMap(([x, y, w, h], i) => {
  const side = (w - DOOR) / 2;
  return [
    [x, y, w, THICK],
    [x, y, THICK, h],
    [x + w - THICK, y, THICK, h],
    [x, y + h - THICK, side, THICK],
    [x + side + DOOR, y + h - THICK, side, THICK],
  ].map((r, k) => wall(`b${i}w${k}`, `b${i}`, r));
});
const FURNISHING_WALLS: WallState[] = HUB_TOWN_GOLDEN.buildings.flatMap((b, i) =>
  b.furnishings.map((f, k) => wall(`b${i}f${k}`, `b${i}`, rect4(f))),
);
const WALLS = [...BUILDING_WALLS, ...FURNISHING_WALLS];
const HOUSES = housesFrom(WALLS);
const houseOf = (w: WallState): House => HOUSES.find((h) => h.id === w.house_id)!;

const rectOf = (w: WallState): Rect => ({ x: w.position.x, y: w.position.y, width: w.width, height: w.height });
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const footprint = (s: IndoorSpot): Rect => ({
  x: s.at.x - s.size[0] / 2,
  y: s.at.y - s.size[1] / 2,
  width: s.size[0],
  height: s.size[1],
});

describe("isFurnishing (FS-B0H2D R19)", () => {
  it.each(BUILDING_WALLS.map((w) => [w.entity_id, w] as const))(
    "should call building wall %s a wall, the south wall's two segments included",
    (_id, w) => {
      expect(isFurnishing(w, houseOf(w))).toBe(false);
    },
  );

  it.each(FURNISHING_WALLS.map((w) => [w.entity_id, w] as const))(
    "should call %s, which touches none of its house's edges, a furnishing",
    (_id, w) => {
      expect(isFurnishing(w, houseOf(w))).toBe(true);
    },
  );

  it("should split the broadcast walls into building walls and furnishings", () => {
    const { building, furnishings } = splitFurnishings(WALLS);
    expect(building.map((w) => w.entity_id)).toEqual(BUILDING_WALLS.map((w) => w.entity_id));
    expect(furnishings.map((w) => w.entity_id)).toEqual(FURNISHING_WALLS.map((w) => w.entity_id));
  });

  it("should leave a wall with no house among the building walls", () => {
    const loose = { entity_id: "x", position: { x: 0, y: 0 }, width: 10, height: 10 };
    expect(splitFurnishings([loose]).building).toEqual([loose]);
  });
});

describe("HUB_FURNISHINGS, the client's mirror of the furnishings (FS-B0H2D R19, R23)", () => {
  it("should name a prop for every furnishing the server stands, by its rect", () => {
    for (const w of FURNISHING_WALLS) expect(furnishingOf(w), w.entity_id).toBeDefined();
    expect(HUB_FURNISHINGS).toHaveLength(FURNISHING_WALLS.length);
  });

  it("should draw the counter, three tables and the forge", () => {
    expect(FURNISHING_WALLS.map((w) => furnishingOf(w)?.kind)).toEqual([
      "counter",
      "table",
      "table",
      "table",
      "forge",
    ]);
  });

  it("should know no furnishing on a rect the mirror lacks", () => {
    expect(furnishingOf(wall("z", "b0", [600, 200, 33, 33]))).toBeUndefined();
  });

  it("should mirror hub_map.go's furnishings exactly, kind and rect, in its order", () => {
    const golden = HUB_TOWN_GOLDEN.buildings.flatMap((b) =>
      b.furnishings.map(({ kind, x, y, w, h }) => ({ kind, rect: { x, y, width: w, height: h } })),
    );
    expect(HUB_FURNISHINGS.map(({ kind, rect }) => ({ kind, rect }))).toEqual(golden);
  });
});

describe("placeholderWarning (FS-B0H2D R19)", () => {
  const unmirrored = wall("z", "b0", [600, 200, 33, 33]);

  it("should warn when a furnishing wall falls back to the placeholder, naming its rect", () => {
    const warn = vi.fn();
    placeholderWarning(warn)(unmirrored);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain("600, 200");
    expect(warn.mock.calls[0][0]).toContain("33 × 33");
  });

  it("should warn once per rect, however often the room is drawn", () => {
    const warn = vi.fn();
    const warnFor = placeholderWarning(warn);
    warnFor(unmirrored);
    warnFor({ ...unmirrored, entity_id: "z2" });
    expect(warn).toHaveBeenCalledOnce();
    warnFor(wall("y", "b0", [610, 200, 33, 33]));
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe("HUB_FIXED_RESIDENTS, the client's mirror of the fixed residents (FS-B0H2D R25)", () => {
  it("should mirror hub_map.go's fixed residents exactly, name and place, in its order", () => {
    const mirrored = HUB_FIXED_RESIDENTS.map(({ name, at }) => ({ name, x: at.x, y: at.y }));
    expect(mirrored).toEqual(HUB_TOWN_GOLDEN.fixedResidents);
  });
});

describe("indoor dressing (FS-B0H2D R15)", () => {
  const spots = HUB_INDOOR_DRESSING.map((s, i) => [`${s.sheet}#${i}`, s] as const);
  const inner = (h: House): Rect => ({
    x: h.x + THICK,
    y: h.y + THICK,
    width: h.width - 2 * THICK,
    height: h.height - 2 * THICK,
  });
  const homeOf = (s: IndoorSpot) => HOUSES.find((h) => insideHouse(s.at, h));

  it.each(spots)("should stand %s inside a house's inner area", (_n, s) => {
    const home = homeOf(s);
    expect(home).toBeDefined();
    const f = footprint(s);
    const room = inner(home!);
    expect(f.x).toBeGreaterThanOrEqual(room.x);
    expect(f.y).toBeGreaterThanOrEqual(room.y);
    expect(f.x + f.width).toBeLessThanOrEqual(room.x + room.width);
    expect(f.y + f.height).toBeLessThanOrEqual(room.y + room.height);
  });

  it.each(spots)("should keep %s off every furnishing", (_n, s) => {
    for (const w of FURNISHING_WALLS) expect(overlaps(footprint(s), rectOf(w)), w.entity_id).toBe(false);
  });

  it.each(spots)("should keep %s off its door's threshold: gap-wide, 80 px in", (_n, s) => {
    for (const [x, y, w, h] of BUILDINGS) {
      const threshold = { x: x + (w - DOOR) / 2, y: y + h - 80, width: DOOR, height: 80 };
      expect(overlaps(footprint(s), threshold)).toBe(false);
    }
  });

  it("should dress every house: the Inn's stools and hearth, the store's shelves, the smithy's anvil", () => {
    const sheetsIn = (i: number) => {
      const [x, y, width, height] = BUILDINGS[i];
      return HUB_INDOOR_DRESSING.filter((s) => insideHouse(s.at, { id: "", x, y, width, height })).map((s) => s.sheet);
    };
    expect(sheetsIn(0)).toEqual(expect.arrayContaining(["stool", "inn_hearth"]));
    expect(sheetsIn(1)).toEqual(expect.arrayContaining(["shelf", "crate", "barrel"]));
    expect(sheetsIn(2)).toEqual(expect.arrayContaining(["anvil"]));
  });

  it("should stand the hearth and the shelves against their house's north wall, the way they face", () => {
    for (const s of HUB_INDOOR_DRESSING.filter((d) => d.sheet === "inn_hearth" || d.sheet === "shelf")) {
      const room = inner(homeOf(s)!);
      expect(footprint(s).y, s.sheet).toBeLessThanOrEqual(room.y + 2);
    }
  });

  it("should give each patron a stool beside them (R26)", () => {
    for (const name of ["Drover", "Gravedigger", "Pilgrim"]) {
      const { at } = HUB_FIXED_RESIDENTS.find((r) => r.name === name)!;
      const near = HUB_INDOOR_DRESSING.filter(
        (s) => s.sheet === "stool" && Math.hypot(s.at.x - at.x, s.at.y - at.y) <= 30,
      );
      expect(near.length, name).toBeGreaterThan(0);
    }
  });
});

describe("fixed residents' facing (FS-B0H2D R25)", () => {
  /** A step of 45° in world space, as Facing8 names it. */
  const STEP: Record<Facing8, [number, number]> = {
    n: [0, -1],
    ne: [1, -1],
    e: [1, 0],
    se: [1, 1],
    s: [0, 1],
    sw: [-1, 1],
    w: [-1, 0],
    nw: [-1, -1],
  };
  /** Whether walking `facing` from `at` reaches the rect within `reach` px. */
  const looksAt = (at: { x: number; y: number }, facing: Facing8, r: Rect, reach = 60) => {
    const [dx, dy] = STEP[facing];
    for (let t = 0; t <= reach; t += 1) {
      const p = { x: at.x + dx * t, y: at.y + dy * t };
      if (p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height) return true;
    }
    return false;
  };

  it.each(HUB_FIXED_RESIDENTS.map((r) => [r.name, r] as const))(
    "should turn the %s to face their furnishing",
    (_name, r) => {
      const facing = residentFacing(r.name)!;
      expect(facing).toBeDefined();
      expect(looksAt(r.at, facing, HUB_FURNISHINGS[r.faces].rect)).toBe(true);
    },
  );

  it("should face the Alewife to the counter, the patrons to their tables and the Smith to the forge", () => {
    const kindFaced = (name: string) =>
      HUB_FURNISHINGS[HUB_FIXED_RESIDENTS.find((r) => r.name === name)!.faces].kind;
    expect(kindFaced("Alewife")).toBe("counter");
    expect(["Drover", "Gravedigger", "Pilgrim"].map(kindFaced)).toEqual(["table", "table", "table"]);
    expect(kindFaced("Smith")).toBe("forge");
  });

  it("should know no facing for a name it has none for, so the default stands", () => {
    expect(residentFacing("Cottar")).toBeUndefined();
  });
});
