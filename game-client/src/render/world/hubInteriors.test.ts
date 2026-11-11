import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Facing8 } from "@/render/iso/facing";
import type { Rect } from "@/render/iso/projection";
import type { WallState } from "@/types/gameState";
import { housesFrom, insideHouse, type House } from "./houses";
import {
  HUB_FIXED_RESIDENTS,
  HUB_FURNISHINGS,
  HUB_INDOOR_DRESSING,
  HUB_INN,
  INN_FLOOR,
  furnishingOf,
  isFurnishing,
  isInn,
  townHouseLook,
  isPartition,
  partitionInside,
  placeholderWarning,
  residentFacing,
  splitFurnishings,
  type IndoorSpot,
} from "./hubInteriors";
import { TOWN_WALL_THICK, townDoorGap, townOutline } from "./hubTown.fixture";
import { HUB_TOWN_GOLDEN, type TownRect } from "./hubTownGolden";
import { TIMBER_WALLS } from "./walls";

/**
 * The town's buildings and furnishings, from the golden of
 * game-server/game-service/internal/game/hub_map.go (hubBuildings): walled 20 thick as
 * addHubBuilding does, the south wall cut in two around its door gap (hubTown.fixture.ts), each furnishing
 * a wall carrying its building's house id (FS-B0H2D R1–R3, R9, R10, R12), and the Inn's partition
 * as hub_map.go walls it, north edge to south edge either side of its door gap. In hub_map.go's
 * order: the Inn, the Quartermaster's store, the smithy.
 */
const rect4 = ({ x, y, w, h }: TownRect): [number, number, number, number] => [x, y, w, h];
const BUILDINGS = HUB_TOWN_GOLDEN.buildings.map(rect4);
const THICK = TOWN_WALL_THICK;

const wall = (id: string, house: string, [x, y, w, h]: number[]): WallState => ({
  entity_id: id,
  house_id: house,
  position: { x, y },
  width: w,
  height: h,
});
const BUILDING_WALLS: WallState[] = HUB_TOWN_GOLDEN.buildings.flatMap((b, i) =>
  townOutline(b).map((r, k) => wall(`b${i}w${k}`, `b${i}`, r)),
);
const PARTITION_WALLS: WallState[] = HUB_TOWN_GOLDEN.buildings.flatMap((b, i) =>
  b.partitions.map((p, k) => wall(`b${i}p${k}`, `b${i}`, rect4(p))),
);
const FURNISHING_WALLS: WallState[] = HUB_TOWN_GOLDEN.buildings.flatMap((b, i) =>
  b.furnishings.map((f, k) => wall(`b${i}f${k}`, `b${i}`, rect4(f))),
);
const WALLS = [...BUILDING_WALLS, ...PARTITION_WALLS, ...FURNISHING_WALLS];
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

  it.each(PARTITION_WALLS.map((w) => [w.entity_id, w] as const))(
    "should never call partition segment %s, which reaches its house's edges, a furnishing",
    (_id, w) => {
      expect(isFurnishing(w, houseOf(w))).toBe(false);
    },
  );

  it("should split the broadcast walls into building walls, partitions and furnishings", () => {
    const { building, partitions, furnishings } = splitFurnishings(WALLS);
    expect(building.map((w) => w.entity_id)).toEqual(BUILDING_WALLS.map((w) => w.entity_id));
    expect(partitions.map((w) => w.entity_id)).toEqual(PARTITION_WALLS.map((w) => w.entity_id));
    expect(furnishings.map((w) => w.entity_id)).toEqual(FURNISHING_WALLS.map((w) => w.entity_id));
  });

  it("should leave a wall with no house among the building walls", () => {
    const loose = { entity_id: "x", position: { x: 0, y: 0 }, width: 10, height: 10 };
    expect(splitFurnishings([loose]).building).toEqual([loose]);
  });
});

describe("the Inn's partition (hub_map.go hubPartition)", () => {
  it("should be in the golden: the Inn's alone, two segments either side of its door gap", () => {
    expect(HUB_TOWN_GOLDEN.buildings.map((b) => [b.name, b.partitions.length])).toEqual([
      ["Inn", 2],
      ["Quartermaster's store", 0],
      ["Smithy", 0],
    ]);
  });

  it.each(PARTITION_WALLS.map((w) => [w.entity_id, w] as const))(
    "should call %s, which reaches its house's edges end on, a partition",
    (_id, w) => {
      expect(isPartition(w, houseOf(w))).toBe(true);
    },
  );

  it.each([...BUILDING_WALLS, ...FURNISHING_WALLS].map((w) => [w.entity_id, w] as const))(
    "should call %s no partition: it stands on the outline, or clear of every edge",
    (_id, w) => {
      expect(isPartition(w, houseOf(w))).toBe(false);
    },
  );

  it("should tell a partition across the room along x from the walls round it", () => {
    const house: House = { id: "h", x: 0, y: 0, width: 300, height: 240 };
    expect(isPartition(wall("p", "h", [0, 100, 125, 20]), house)).toBe(true);
    expect(isPartition(wall("s", "h", [0, 220, 125, 20]), house)).toBe(false);
  });

  it("should draw each segment inside the room only, trimmed to the inner faces of the walls it meets", () => {
    const inn = houseOf(PARTITION_WALLS[0]);
    const inside = PARTITION_WALLS.map((w) => partitionInside(w, inn));
    expect(inside.map(rectOf)).toEqual([
      { x: 505, y: 70, width: 20, height: 160 },
      { x: 505, y: 310, width: 20, height: 160 },
    ]);
    // the door gap between them is the server's: as wide as the Inn's street gap, centred on the
    // Inn's depth (y 230–310, ADR-0073 Decision 3)
    expect(inside[1].position.y - (inside[0].position.y + inside[0].height)).toBe(
      HUB_TOWN_GOLDEN.buildings[0].doorGap.w,
    );
    // trimming keeps the wall it came from
    expect(inside.map((w) => w.entity_id)).toEqual(PARTITION_WALLS.map((w) => w.entity_id));
  });

  it("should trim a partition along x at its west and east ends alike", () => {
    const house: House = { id: "h", x: 0, y: 0, width: 300, height: 240 };
    expect(rectOf(partitionInside(wall("p", "h", [0, 100, 125, 20]), house))).toEqual({ x: 20, y: 100, width: 105, height: 20 });
    expect(rectOf(partitionInside(wall("q", "h", [175, 100, 125, 20]), house))).toEqual({ x: 175, y: 100, width: 105, height: 20 });
  });
});

describe("HUB_INN, the Inn's footprint (hub_map.go hubBuildings)", () => {
  it("should mirror the golden's Inn", () => {
    const inn = HUB_TOWN_GOLDEN.buildings.find((b) => b.name === "Inn")!;
    expect(HUB_INN).toEqual({ x: inn.x, y: inn.y, width: inn.w, height: inn.h });
  });

  it("should know the Inn among the houses the walls build, and only the Inn", () => {
    expect(HOUSES.map(isInn)).toEqual([true, false, false]);
  });
});

describe("townHouseLook, how each town building is built", () => {
  it("should build the Inn in timber with no lit kind, on planks", () => {
    const { sheets, floor } = townHouseLook(HOUSES[0]);
    expect(sheets.lit).toEqual([]);
    expect(sheets.back.map(([, kind]) => kind)).not.toContain("torch");
    expect(sheets.front.map(([, kind]) => kind)).not.toContain("window");
    expect(sheets.outward).toEqual(TIMBER_WALLS.outward);
    expect(floor).toBe(INN_FLOOR);
  });

  it("should build every other house in plain timber on the town's flagstone", () => {
    for (const house of HOUSES.slice(1)) expect(townHouseLook(house)).toEqual({ sheets: TIMBER_WALLS });
  });

  it("should give every Inn the same sheets, so its walls are built in one go", () => {
    expect(townHouseLook(HOUSES[0]).sheets).toBe(townHouseLook({ ...HOUSES[0], id: "again" }).sheets);
  });
});

describe("HUB_FURNISHINGS, the client's mirror of the furnishings (FS-B0H2D R19, R23)", () => {
  it("should name a prop for every furnishing the server stands, by its rect", () => {
    for (const w of FURNISHING_WALLS) expect(furnishingOf(w), w.entity_id).toBeDefined();
    expect(HUB_FURNISHINGS).toHaveLength(FURNISHING_WALLS.length);
  });

  it("should draw the long table, the great hearth, the counter, two tables and the forge", () => {
    expect(FURNISHING_WALLS.map((w) => furnishingOf(w)?.kind)).toEqual([
      "long_table",
      "hall_hearth",
      "counter",
      "table",
      "table",
      "forge",
    ]);
  });

  it("should draw each furnishing with its own sheet, the existing ones reused", () => {
    expect(HUB_FURNISHINGS.map((f) => [f.kind, f.sheet, f.animation])).toEqual([
      ["long_table", "long_table", "y"],
      ["hall_hearth", "hall_hearth", undefined],
      ["counter", "counter", "y"],
      ["table", "inn_table", "narrow"],
      ["table", "inn_table", "wide"],
      ["forge", "forge", undefined],
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
  const INN = HOUSES[0];
  /** The partition's west face: the great hall is west of it, the taproom east of its east face. */
  const PARTITION_X = PARTITION_WALLS[0].position.x;
  const inGreatHall = (s: IndoorSpot) => insideHouse(s.at, INN) && s.at.x < PARTITION_X;
  const inTaproom = (s: IndoorSpot) => insideHouse(s.at, INN) && s.at.x > PARTITION_X + THICK;

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

  it.each(spots)("should keep %s off every furnishing and off the partition", (_n, s) => {
    for (const w of [...FURNISHING_WALLS, ...PARTITION_WALLS])
      expect(overlaps(footprint(s), rectOf(w)), w.entity_id).toBe(false);
  });

  it.each(spots)("should keep %s off its door's threshold: gap-wide, 80 px in", (_n, s) => {
    for (const { x0, x1, sill } of HUB_TOWN_GOLDEN.buildings.map(townDoorGap)) {
      const threshold = { x: x0, y: sill - 80, width: x1 - x0, height: 80 };
      expect(overlaps(footprint(s), threshold)).toBe(false);
    }
  });

  it("should dress every house: the Inn's two rooms, the store's shelves, the smithy's anvil", () => {
    const sheetsIn = (i: number) => {
      const [x, y, width, height] = BUILDINGS[i];
      return HUB_INDOOR_DRESSING.filter((s) => insideHouse(s.at, { id: "", x, y, width, height })).map((s) => s.sheet);
    };
    expect(sheetsIn(1)).toEqual(expect.arrayContaining(["shelf", "crate", "barrel"]));
    expect(sheetsIn(2)).toEqual(expect.arrayContaining(["anvil"]));
    // the old Inn's lone hearth is the great hall's furnishing now
    expect(sheetsIn(0)).not.toContain("inn_hearth");
  });

  it("should furnish the great hall: ten chairs at the long table, candelabra, paintings, plants and a rug", () => {
    const hall = HUB_INDOOR_DRESSING.filter(inGreatHall).map((s) => s.sheet);
    expect(hall.filter((s) => s === "hall_chair")).toHaveLength(10);
    expect(hall).toEqual(expect.arrayContaining(["candelabra", "painting", "potted_plant", "rug"]));
    expect(hall).not.toEqual(expect.arrayContaining(["stool"]));
  });

  it("should furnish the taproom: stools at its tables and bar, kegs, chests and lanterns", () => {
    const taproom = HUB_INDOOR_DRESSING.filter(inTaproom).map((s) => s.sheet);
    expect(taproom).toEqual(expect.arrayContaining(["stool", "keg", "hall_chest", "lantern"]));
    expect(taproom).not.toContain("hall_chair");
    // every Inn piece stands in one room or the other
    const inn = HUB_INDOOR_DRESSING.filter((s) => insideHouse(s.at, INN));
    expect(inn.every((s) => inGreatHall(s) || inTaproom(s))).toBe(true);
  });

  it("should lay every rug flat on the floor layer, in an aisle clear of the chairs", () => {
    const rugs = HUB_INDOOR_DRESSING.filter((s) => s.sheet === "rug");
    expect(rugs.length).toBeGreaterThan(0);
    const chairs = HUB_INDOOR_DRESSING.filter((s) => s.sheet === "hall_chair");
    for (const rug of rugs) {
      expect(rug.flat).toBe(true);
      for (const c of chairs) expect(overlaps(footprint(rug), footprint(c))).toBe(false);
    }
  });

  it("should seat the long table five a side, each chair facing it", () => {
    const table = HUB_FURNISHINGS.find((f) => f.kind === "long_table")!.rect;
    const chairs = HUB_INDOOR_DRESSING.filter((s) => s.sheet === "hall_chair");
    const west = chairs.filter((c) => c.at.x < table.x);
    const east = chairs.filter((c) => c.at.x > table.x + table.width);
    expect([west.length, east.length]).toEqual([5, 5]);
    expect(west.every((c) => c.animation === "e")).toBe(true);
    expect(east.every((c) => c.animation === "w")).toBe(true);
    for (const c of chairs) {
      expect(c.at.y, `chair at ${c.at.x}, ${c.at.y}`).toBeGreaterThan(table.y);
      expect(c.at.y).toBeLessThan(table.y + table.height);
    }
  });

  it("should stand the shelves and every north-wall piece against the north wall, the way they face", () => {
    const north = HUB_INDOOR_DRESSING.filter(
      (d) => d.sheet === "shelf" || (["painting", "hall_chest"].includes(d.sheet) && d.animation === "s") || d.animation === "wall_s",
    );
    expect(north.length).toBeGreaterThan(0);
    for (const s of north) {
      const room = inner(homeOf(s)!);
      // a lantern's glass hangs 13 px off the face it is bracketed to
      const reach = s.sheet === "lantern" ? 13 : 2;
      expect(s.sheet === "lantern" ? s.at.y - room.y : footprint(s).y - room.y, `${s.sheet} at ${s.at.x}`).toBeLessThanOrEqual(reach);
    }
  });

  /** Hung on a wall, its bracket or frame well above a low wall's top: paintings and wall lanterns. */
  const wallHung = (d: IndoorSpot) => d.sheet === "painting" || d.animation === "wall_s" || d.animation === "wall_e";

  it("should hang every west-facing wall piece on its house's full-height west wall, never on the low partition (ADR-0036)", () => {
    const west = HUB_INDOOR_DRESSING.filter((d) => wallHung(d) && (d.animation === "e" || d.animation === "wall_e"));
    expect(west.length).toBeGreaterThan(0);
    for (const s of west) {
      const face = inner(homeOf(s)!).x;
      const reach = s.sheet === "lantern" ? 13 : 2;
      expect(s.sheet === "lantern" ? s.at.x - face : footprint(s).x - face, `${s.sheet} at ${s.at.x}, ${s.at.y}`).toBeLessThanOrEqual(reach);
      expect(footprint(s).x).toBeGreaterThanOrEqual(face);
    }
  });

  it("should hang nothing on the partition, which is drawn low: a bracket or frame there would float", () => {
    const nearPartition = (s: IndoorSpot) => {
      const f = footprint(s);
      return f.x <= PARTITION_X + THICK + 13 && f.x + f.width >= PARTITION_X - 13;
    };
    expect(HUB_INDOOR_DRESSING.filter(wallHung).filter(nearPartition)).toEqual([]);
  });

  it("should back a west-facing chest onto a wall face it stands on the floor against: a west wall, or the partition from the taproom", () => {
    const chests = HUB_INDOOR_DRESSING.filter((d) => d.sheet === "hall_chest" && d.animation === "e");
    for (const s of chests) {
      const face = inTaproom(s) ? PARTITION_X + THICK : inner(homeOf(s)!).x;
      expect(footprint(s).x - face, `chest at ${s.at.x}, ${s.at.y}`).toBeLessThanOrEqual(2);
      expect(footprint(s).x).toBeGreaterThanOrEqual(face);
    }
  });

  it("should give each patron a seat beside them, standing at the long table (R26)", () => {
    for (const name of ["Drover", "Gravedigger", "Pilgrim"]) {
      const { at } = HUB_FIXED_RESIDENTS.find((r) => r.name === name)!;
      const near = HUB_INDOOR_DRESSING.filter(
        (s) => (s.sheet === "hall_chair" || s.sheet === "stool") && Math.hypot(s.at.x - at.x, s.at.y - at.y) <= 30,
      );
      expect(near.length, name).toBeGreaterThan(0);
    }
  });

  it("should light the Inn by its hearth, candelabra and lanterns only (as the manifest declares lights)", () => {
    const manifest = JSON.parse(readFileSync(new URL("../../../public/art/manifest.json", import.meta.url), "utf8")) as {
      sheets: Record<string, { light?: unknown }>;
    };
    const lit = (sheet: string) => !!manifest.sheets[sheet]?.light;
    const innSheets = [
      ...HUB_INDOOR_DRESSING.filter((s) => insideHouse(s.at, INN)).map((s) => s.sheet),
      ...HUB_FURNISHINGS.filter((f) => insideHouse({ x: f.rect.x, y: f.rect.y }, INN)).map((f) => f.sheet),
    ];
    for (const sheet of innSheets.filter(lit)) expect(["hall_hearth", "candelabra", "lantern"]).toContain(sheet);
    // the lights themselves are placed, whether or not their sheets are baked yet
    expect(innSheets).toEqual(expect.arrayContaining(["hall_hearth", "candelabra", "lantern"]));
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
      const faced = HUB_FURNISHINGS.filter((f) => f.kind === r.faces);
      // one of its kind in town, so the kind names the furnishing
      expect(faced).toHaveLength(1);
      expect(looksAt(r.at, facing, faced[0].rect)).toBe(true);
    },
  );

  it("should face the Alewife to the counter, the patrons to the long table and the Smith to the forge", () => {
    const kindFaced = (name: string) => HUB_FIXED_RESIDENTS.find((r) => r.name === name)!.faces;
    expect(kindFaced("Alewife")).toBe("counter");
    expect(["Drover", "Gravedigger", "Pilgrim"].map(kindFaced)).toEqual(["long_table", "long_table", "long_table"]);
    expect(kindFaced("Smith")).toBe("forge");
  });

  it("should know no facing for a name it has none for, so the default stands", () => {
    expect(residentFacing("Cottar")).toBeUndefined();
  });
});
