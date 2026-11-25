import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Facing8 } from "@/render/iso/facing";
import { worldToScreen, type Rect } from "@/render/iso/projection";
import type { WallState } from "@/types/gameState";
import { housesFrom, insideHouse, type House } from "./houses";
import {
  HUB_FIXED_RESIDENTS,
  HUB_FURNISHINGS,
  HUB_INDOOR_DRESSING,
  CHAPEL_EAST_LANCETS,
  CHAPEL_NAVE_LANCETS,
  CHAPEL_WEST_BEHIND_HUNG,
  HUB_BELL_TOWER,
  HUB_CHAPEL,
  HUB_INN,
  INN_FLOOR,
  TOWN_ROOF,
  furnishingOf,
  isBellTower,
  isChapel,
  isFurnishing,
  isInn,
  townHouseLook,
  isPartition,
  partitionInside,
  placeholderWarning,
  residentFacing,
  splitBellTower,
  splitFurnishings,
  type IndoorSpot,
} from "./hubInteriors";
import { eastDoorWalls } from "./eastDoor.fixture";
import { HUB_GRAVEYARD } from "./hubGraveyard";
import { buildingAt, hidden } from "./indoors";
import { TOWN_WALL_THICK, townDoorGap, townDoorStrip, townOutline, townWalls } from "./hubTown.fixture";
import { HUB_TOWN_GOLDEN, type TownRect } from "./hubTownGolden";
import { doorGaps, doorHead } from "./buildingLooks";
import { GABLE_APEX, planGables } from "./roofs";
import { CHAPEL_WALLS, MASONRY_WALLS, TIMBER_WALLS } from "./walls";

/**
 * The town's buildings and furnishings, from the golden of
 * game-server/game-service/internal/game/hub_map.go (hubBuildings): walled 20 thick as
 * addHubBuilding does, the wall on its door face cut in two around its door gap (hubTown.fixture.ts;
 * FS-R4MYX R6), each furnishing a wall carrying its building's house id (FS-B0H2D R1–R3, R9, R10,
 * R12), and the Inn's partition as hub_map.go walls it, north edge to south edge either side of
 * its door gap. In hub_map.go's order: the Inn, the Quartermaster's store, the smithy, the chapel.
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
      ["Chapel", 0],
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
    expect(HOUSES.map(isInn)).toEqual(HUB_TOWN_GOLDEN.buildings.map((b) => b.name === "Inn"));
  });
});

describe("HUB_CHAPEL, the chapel's footprint (hub_map.go hubBuildings; FS-R4MYX R2–R4, R21)", () => {
  const chapel = HUB_TOWN_GOLDEN.buildings.find((b) => b.name === "Chapel")!;

  it("should mirror the golden's chapel", () => {
    expect(HUB_CHAPEL).toEqual({ x: chapel.x, y: chapel.y, width: chapel.w, height: chapel.h });
  });

  it("should know the chapel among the houses the walls build, and only the chapel", () => {
    expect(HOUSES.map(isChapel)).toEqual(HUB_TOWN_GOLDEN.buildings.map((b) => b.name === "Chapel"));
  });

  it("should wall the chapel by its east door face, as the server cuts an east door (FS-R4MYX R6)", () => {
    expect(chapel.doorFace).toBe("east");
    const rects = (ws: readonly WallState[]) => ws.map((w) => [w.position.x, w.position.y, w.width, w.height]);
    expect(townOutline(chapel)).toEqual(rects(eastDoorWalls(chapel.x, chapel.y, chapel.w, chapel.h, "chapel")));
  });

  it("should wall every other building by its south door face", () => {
    const others = HUB_TOWN_GOLDEN.buildings.filter((b) => b.name !== "Chapel");
    expect(others.map((b) => b.doorFace)).toEqual(others.map(() => "south"));
  });
});

describe("the chapel moved whole (FS-R4MYX §Change: the chapel moves to the far left, T1, T9)", () => {
  const from = (p: { x: number; y: number }) => [p.x - HUB_CHAPEL.x, p.y - HUB_CHAPEL.y];

  it("should stand the chapel at the golden's place, in the map's south-west", () => {
    expect(HUB_CHAPEL).toEqual({ x: 220, y: 1300, width: 620, height: 440 });
  });

  it("should keep every indoor piece at its shipped offset from the chapel's north-west corner", () => {
    const inChapel = HUB_INDOOR_DRESSING.filter((s) => insideHouse(s.at, { id: "", ...HUB_CHAPEL }));
    expect(inChapel.map((s) => [s.sheet, ...from(s.at)])).toEqual([
      ["dais", 145, 220],
      ["lectern", 230, 150],
      ["candelabra", 175, 150],
      ["candelabra", 175, 290],
      ["chapel_crucifix", 22, 220],
      ["chapel_mural", 22, 110],
      ["chapel_mural", 22, 330],
    ]);
  });

  it("should keep the window bays at their shipped offsets: six nave lancets and one each side of the door (W3–W5)", () => {
    expect(CHAPEL_NAVE_LANCETS.map((x) => x - HUB_CHAPEL.x)).toEqual([100, 180, 260, 340, 420, 500]);
    expect(CHAPEL_EAST_LANCETS.map((y) => y - HUB_CHAPEL.y)).toEqual([100, 360]);
    // mirrored about the wall's middle and about the door's centre, to within half a tile
    const [midX, midY] = [HUB_CHAPEL.x + HUB_CHAPEL.width / 2, HUB_CHAPEL.y + HUB_CHAPEL.height / 2];
    expect(Math.abs(CHAPEL_NAVE_LANCETS.reduce((sum, x) => sum + x - midX, 0) / CHAPEL_NAVE_LANCETS.length)).toBeLessThanOrEqual(20);
    expect(Math.abs((CHAPEL_EAST_LANCETS[0] + CHAPEL_EAST_LANCETS[1]) / 2 - midY)).toBeLessThanOrEqual(20);
  });
});

describe("HUB_BELL_TOWER, the bell tower's rect (hub_map.go hubBellTower; FS-R4MYX T6, T9, T10)", () => {
  const { x, y, w, h } = HUB_TOWN_GOLDEN.bellTower;
  const tower = wall("tower", "tower-own-id", [x, y, w, h]);
  const TOWN_AND_TOWER = [...BUILDING_WALLS, tower];

  it("should mirror the golden's bell tower", () => {
    expect(HUB_BELL_TOWER).toEqual({ x, y, width: w, height: h });
  });

  it("should stand it wholly west of the chapel's west wall's outer face, against it, on the ridge's line (T6, T14)", () => {
    expect(HUB_BELL_TOWER.x + HUB_BELL_TOWER.width).toBe(HUB_CHAPEL.x);
    expect(HUB_BELL_TOWER.y + HUB_BELL_TOWER.height / 2).toBe(HUB_CHAPEL.y + HUB_CHAPEL.height / 2);
    expect(HUB_BELL_TOWER.width).toBe(HUB_BELL_TOWER.height);
  });

  it("should tell the tower's wall by its rect, and no other wall of the town", () => {
    expect(isBellTower(tower)).toBe(true);
    expect(BUILDING_WALLS.filter(isBellTower)).toEqual([]);
    expect(isBellTower(wall("near", "x", [x + 1, y, w, h]))).toBe(false);
    expect(isBellTower(wall("smaller", "x", [x, y, w - 10, h]))).toBe(false);
    expect(townWalls().filter(isBellTower)).toHaveLength(1);
  });

  it("should take the tower's wall out of the walls houses are built from, so it makes no house", () => {
    const { tower: found, rest } = splitBellTower(TOWN_AND_TOWER);
    expect(found).toBe(tower);
    expect(rest).toEqual(BUILDING_WALLS);
    expect(housesFrom(rest).map((house) => house.id)).toEqual(HOUSES.map((house) => house.id));
    // left in, its lone house id would build a fifth house
    expect(housesFrom(TOWN_AND_TOWER)).toHaveLength(HOUSES.length + 1);
  });

  it("should find no tower in a state without one, and leave its walls as they came", () => {
    expect(splitBellTower(BUILDING_WALLS)).toEqual({ tower: undefined, rest: BUILDING_WALLS });
  });

  it("should leave a lone-id wall on any other rect a house as before: the tower is told by its rect, not by standing alone", () => {
    const shed = wall("shed", "shed-own-id", [1700, 1500, 140, 140]);
    const { tower: found, rest } = splitBellTower([...BUILDING_WALLS, shed]);
    expect(found).toBeUndefined();
    expect(housesFrom(rest).map((house) => house.id)).toContain("shed-own-id");
  });
});

describe("townHouseLook, how each town building is built", () => {
  it("should build the Inn in timber with no lit kind, on planks, under the town's roof", () => {
    const { sheets, floor, roof } = townHouseLook(HOUSES[0]);
    expect(roof).toBe(TOWN_ROOF);
    expect(sheets.lit).toEqual([]);
    expect(sheets.back.map(([, kind]) => kind)).not.toContain("torch");
    expect(sheets.front.map(([, kind]) => kind)).not.toContain("window");
    expect(sheets.outward).toEqual(TIMBER_WALLS.outward);
    expect(floor).toBe(INN_FLOOR);
  });

  it("should build every other house but the chapel in plain timber on the town's flagstone, under the town's roof with its chimney", () => {
    const others = HOUSES.filter((h) => !isInn(h) && !isChapel(h));
    expect(others).toHaveLength(2);
    for (const house of others) expect(townHouseLook(house)).toEqual({ sheets: TIMBER_WALLS, roof: TOWN_ROOF });
  });

  describe("the chapel (FS-R4MYX R23, R42)", () => {
    const chapel = () => HOUSES.find(isChapel)!;

    it("should build the chapel in its own material, CHAPEL_WALLS: chapel_, masonry thick, unlit, capless", () => {
      const { sheets } = townHouseLook(chapel());
      expect(sheets).toBe(CHAPEL_WALLS);
      expect(sheets.prefix).toBe("chapel_");
      expect(sheets.thickness).toBe(MASONRY_WALLS.thickness);
      expect(sheets.lit ?? []).toEqual([]);
      expect(sheets.cap).toBeUndefined();
      expect(sheets.outward.map(([, kind]) => kind)).toEqual(["plain", "lancet", "buttress"]);
    });

    it("should roof it in the chapel_roof_ set, with no chimney: a church has no hearth to vent", () => {
      expect(townHouseLook(chapel()).roof).toMatchObject({ prefix: "chapel_", chimney: false });
    });

    it("should leave its west gable plain, where the bell tower stands, and crown its east gable; no other house names a plain end (§Change: the bell tower, T16)", () => {
      const { roof } = townHouseLook(chapel());
      expect(roof.plainGables).toEqual(["w"]);
      // the tower stands against that end: west of the west wall, on the ridge's line
      expect(HUB_BELL_TOWER.x + HUB_BELL_TOWER.width).toBe(HUB_CHAPEL.x);
      const gables = planGables(chapel(), 20, roof.prefix, roof.plainGables);
      const [west, east] = [HUB_CHAPEL.x + 10, HUB_CHAPEL.x + HUB_CHAPEL.width - 10];
      expect(gables.filter((g) => g.at.x === west).every((g) => g.index === 0)).toBe(true);
      expect(gables.filter((g) => g.at.x === east && g.index === GABLE_APEX)).toHaveLength(2);
      for (const house of HOUSES.filter((h) => !isChapel(h))) {
        const look = townHouseLook(house);
        expect(look.roof.plainGables ?? []).toEqual([]);
        expect(planGables(house, 20, look.roof.prefix, look.roof.plainGables)).toEqual(planGables(house, 20, look.roof.prefix));
      }
    });

    it("should stand it on the town's flagstone, drawn as baked: no tint over any part (owner feedback F6)", () => {
      const { fixed, ...look } = townHouseLook(chapel());
      expect(look).toEqual({ sheets: CHAPEL_WALLS, roof: { prefix: "chapel_", chimney: false, plainGables: ["w"] } });
      expect(fixed).toBeDefined();
    });

    it("should fix kinds on the chapel's walls, and on no other house's (FS-R4MYX §Change: windows match, W1, W7)", () => {
      const { fixed } = townHouseLook(chapel());
      expect(Object.keys(fixed!).sort()).toEqual(["back", "outward"]);
      expect(Object.keys(fixed!.outward!).sort()).toEqual(["east", "south"]);
      expect(Object.keys(fixed!.back!).sort()).toEqual(["north", "west"]);
      // the cut-away fronts keep their plain-or-pillar table: no lancet indoors on the south or east wall
      expect(fixed!.front).toBeUndefined();
      for (const house of HOUSES.filter((h) => !isChapel(h))) expect(townHouseLook(house).fixed, house.id).toBeUndefined();
    });

    it("should derive the west wall's plain pieces from the hung dressing: every piece behind the crucifix and the murals (W6)", () => {
      expect(CHAPEL_WEST_BEHIND_HUNG).toEqual([1360, 1400, 1440, 1520, 1600, 1640, 1680]);
      expect(Object.keys(townHouseLook(chapel()).fixed!.back!.west!.at).map(Number)).toEqual([...CHAPEL_WEST_BEHIND_HUNG]);
    });

    it("should close its east door with the chapel's own pointed-arch head, chapel_door_head_y", () => {
      const own = BUILDING_WALLS.filter((w) => w.house_id === chapel().id);
      const gaps = doorGaps(own);
      expect(gaps).toHaveLength(1);
      expect(doorHead(gaps[0], townHouseLook(chapel()).sheets).sheet).toBe("chapel_door_head_y");
    });

    it("should give every chapel the same sheets, so its walls are built in one go", () => {
      expect(townHouseLook(chapel()).sheets).toBe(townHouseLook({ ...chapel(), id: "again" }).sheets);
    });
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

  it("should draw the long table, the great hearth, the counter, two tables, the forge, six pews and the altar", () => {
    expect(FURNISHING_WALLS.map((w) => furnishingOf(w)?.kind)).toEqual([
      "long_table",
      "hall_hearth",
      "counter",
      "table",
      "table",
      "forge",
      ...Array<string>(6).fill("pew"),
      "altar",
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
      ...Array(6).fill(["pew", "pew", undefined]),
      // the chapel's altar, not the run's Altar of Consecration (`altar`, dormant and burned)
      ["altar", "chapel_altar", undefined],
    ]);
  });

  it("should stand the chapel's pews and altar inside the chapel, none of them tall (FS-R4MYX R12, R21)", () => {
    const inChapel = HUB_FURNISHINGS.filter((f) => f.kind === "pew" || f.kind === "altar");
    expect(inChapel).toHaveLength(7);
    for (const f of inChapel) {
      expect(insideHouse({ x: f.rect.x, y: f.rect.y }, { id: "", ...HUB_CHAPEL })).toBe(true);
      expect(f.tall).toBe(false);
    }
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

describe("the chapel's people under its roof (FS-R4MYX R19, R20, R25)", () => {
  const chapel = HOUSES.find((h) => h.x === HUB_CHAPEL.x && h.y === HUB_CHAPEL.y)!;
  const INSIDE = ["Confessor", "Penitent", "Chandler", "Goodwife", "Ploughman"];
  const MOURNERS = ["Keener", "Widower", "Veteran"];
  const at = (name: string) => HUB_FIXED_RESIDENTS.find((r) => r.name === name)!.at;

  it("should stand exactly the three mourners outdoors, every other fixed resident in a building", () => {
    const outdoors = HUB_FIXED_RESIDENTS.filter((r) => !buildingAt(r.at, HOUSES)).map((r) => r.name);
    expect(outdoors).toEqual(MOURNERS);
  });

  it.each(INSIDE)("should hide the %s with the chapel's roof on, and show them with the player inside", (name) => {
    expect(buildingAt(at(name), HOUSES)).toBe(chapel);
    expect(hidden(at(name), HOUSES, undefined)).toBe(true);
    expect(hidden(at(name), HOUSES, chapel)).toBe(false);
  });

  it.each(MOURNERS)("should never hide the %s under a roof: shown from the street", (name) => {
    expect(hidden(at(name), HOUSES, undefined)).toBe(false);
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

  it.each(spots)("should keep %s off the partition, and off every furnishing unless it lies flat (FS-R4MYX R14)", (_n, s) => {
    for (const w of [...(s.flat ? [] : FURNISHING_WALLS), ...PARTITION_WALLS])
      expect(overlaps(footprint(s), rectOf(w)), w.entity_id).toBe(false);
  });

  it("should dress the chapel with its dais, lectern, two candelabra, the crucifix and two murals, nothing else (FS-R4MYX R14, amended by W12)", () => {
    const inChapel = HUB_INDOOR_DRESSING.filter((s) => insideHouse(s.at, { id: "", ...HUB_CHAPEL }));
    expect(inChapel.map((s) => [s.sheet, s.at, s.size])).toEqual([
      ["dais", { x: 365, y: 1520 }, [130, 200]],
      ["lectern", { x: 450, y: 1450 }, [20, 20]],
      ["candelabra", { x: 395, y: 1450 }, [30, 30]],
      ["candelabra", { x: 395, y: 1590 }, [30, 30]],
      ["chapel_crucifix", { x: 242, y: 1520 }, [4, 40]],
      ["chapel_mural", { x: 242, y: 1410 }, [4, 64]],
      ["chapel_mural", { x: 242, y: 1630 }, [4, 64]],
    ]);
  });

  describe("the crucifix and the murals behind the Confessor (FS-R4MYX §Change: windows match, W12)", () => {
    const chapel = HOUSES.find((h) => h.x === HUB_CHAPEL.x && h.y === HUB_CHAPEL.y)!;
    const [crucifix] = HUB_INDOOR_DRESSING.filter((s) => s.sheet === "chapel_crucifix");
    const murals = HUB_INDOOR_DRESSING.filter((s) => s.sheet === "chapel_mural");
    const hung = [crucifix, ...murals];
    /** The dais's centre: the aisle's line, where the Confessor stands before it. */
    const DAIS_Y = HUB_INDOOR_DRESSING.find((s) => s.sheet === "dais")!.at.y;

    it("should hang one crucifix facing east within 10 px of the dais's line, y 1520", () => {
      expect(DAIS_Y).toBe(1520);
      expect(crucifix).toBeDefined();
      expect(crucifix.animation).toBe("e");
      expect(Math.abs(crucifix.at.y - DAIS_Y)).toBeLessThanOrEqual(10);
    });

    it("should hang the saint north of it and the dead rising south, each 90–130 px from it along the wall", () => {
      expect(murals.map((m) => m.index)).toEqual([0, 1]);
      const [saint, rising] = murals;
      expect(saint.at.y).toBeLessThan(crucifix.at.y);
      expect(rising.at.y).toBeGreaterThan(crucifix.at.y);
      for (const m of murals) {
        expect(m.animation).toBe("e");
        const apart = Math.abs(m.at.y - crucifix.at.y);
        expect(apart, `mural ${m.index}`).toBeGreaterThanOrEqual(90);
        expect(apart, `mural ${m.index}`).toBeLessThanOrEqual(130);
      }
    });

    it("should hang all three on the west wall's inner face, inside y 1320–1720, none overlapping another", () => {
      for (const s of hung) {
        expect(homeOf(s)).toBe(chapel);
        // 2 px off the face, as the Inn's west-wall paintings hang
        expect(s.at.x - inner(chapel).x, s.sheet).toBe(2);
        const f = footprint(s);
        expect(f.y).toBeGreaterThanOrEqual(1320);
        expect(f.y + f.height).toBeLessThanOrEqual(1720);
      }
      for (const [i, a] of hung.entries())
        for (const b of hung.slice(i + 1)) expect(overlaps(footprint(a), footprint(b)), `${a.sheet} ${b.sheet}`).toBe(false);
    });

    it("should keep every frame of the three clear of the candelabra's and the lectern's on screen, as drawn", () => {
      const manifest = JSON.parse(readFileSync(new URL("../../../public/art/manifest.json", import.meta.url), "utf8")) as {
        sheets: Record<string, { frameWidth: number; frameHeight: number; anchor: { x: number; y: number } }>;
      };
      /** A sheet's frame on screen, drawn at its point by its anchor, as addProp draws it. */
      const frame = (s: IndoorSpot): Rect => {
        const sheet = manifest.sheets[s.sheet];
        expect(sheet, s.sheet).toBeDefined();
        const at = worldToScreen(s.at.x, s.at.y);
        return {
          x: at.x - sheet.anchor.x * sheet.frameWidth,
          y: at.y - sheet.anchor.y * sheet.frameHeight,
          width: sheet.frameWidth,
          height: sheet.frameHeight,
        };
      };
      const standing = HUB_INDOOR_DRESSING.filter((s) => (s.sheet === "candelabra" || s.sheet === "lectern") && homeOf(s) === chapel);
      expect(standing).toHaveLength(3);
      for (const a of hung)
        for (const b of standing) expect(overlaps(frame(a), frame(b)), `${a.sheet}#${a.index ?? 0} over ${b.sheet} at ${b.at.x}, ${b.at.y}`).toBe(false);
    });
  });

  it("should lay the chapel's dais flat on the floor, under the altar, and stand everything else upright", () => {
    const inChapel = HUB_INDOOR_DRESSING.filter((s) => insideHouse(s.at, { id: "", ...HUB_CHAPEL }));
    const dais = inChapel.find((s) => s.sheet === "dais")!;
    expect(dais.flat).toBe(true);
    const altar = HUB_FURNISHINGS.find((f) => f.kind === "altar")!;
    expect(overlaps(footprint(dais), altar.rect)).toBe(true);
    // the standing pieces keep off it all: the altar, the pews
    for (const s of inChapel.filter((d) => d !== dais)) {
      expect(s.flat, s.sheet).toBeFalsy();
      for (const f of HUB_FURNISHINGS) expect(overlaps(footprint(s), f.rect), `${s.sheet} on ${f.kind}`).toBe(false);
    }
  });


  it.each(spots)("should keep %s off its door's threshold: gap-wide, 80 px in from the sill on its face (FS-R4MYX R10)", (_n, s) => {
    for (const gap of HUB_TOWN_GOLDEN.buildings.map(townDoorGap)) {
      const [x, y, width, height] = townDoorStrip(gap, 80, "inside");
      expect(overlaps(footprint(s), { x, y, width, height })).toBe(false);
    }
  });

  it("should lay the chapel's indoor threshold west of its east door's sill (FS-R4MYX R10)", () => {
    const chapel = HUB_TOWN_GOLDEN.buildings.find((b) => b.name === "Chapel")!;
    expect(townDoorStrip(townDoorGap(chapel), 80, "inside")).toEqual([760, 1480, 80, 80]);
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

  /** Hung on a wall, its bracket or frame well above a low wall's top: paintings, the chapel's crucifix and murals, and wall lanterns. */
  const HUNG_SHEETS = ["painting", "chapel_crucifix", "chapel_mural"];
  const wallHung = (d: IndoorSpot) => HUNG_SHEETS.includes(d.sheet) || d.animation === "wall_s" || d.animation === "wall_e";

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

  it("should light the chapel by its two candelabra only, its furnishings and other dressing unlit (FS-R4MYX R15)", () => {
    const manifest = JSON.parse(readFileSync(new URL("../../../public/art/manifest.json", import.meta.url), "utf8")) as {
      sheets: Record<string, { light?: unknown }>;
    };
    const chapel = { id: "", ...HUB_CHAPEL };
    const chapelSheets = [
      ...HUB_INDOOR_DRESSING.filter((s) => insideHouse(s.at, chapel)).map((s) => s.sheet),
      ...HUB_FURNISHINGS.filter((f) => insideHouse({ x: f.rect.x, y: f.rect.y }, chapel)).map((f) => f.sheet),
    ];
    // the candelabra carry the manifest's light; nothing else in the room may
    expect(manifest.sheets.candelabra?.light).toBeDefined();
    for (const sheet of chapelSheets.filter((x) => !!manifest.sheets[x]?.light)) expect(sheet).toBe("candelabra");
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

describe("fixed residents' facing (FS-B0H2D R25; FS-R4MYX R17, R26)", () => {
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
  /** The angle, in degrees, between `facing` and the bearing from `at` to the rect's nearest point. */
  const offBearing = (at: { x: number; y: number }, facing: Facing8, r: Rect) => {
    const near = {
      x: Math.min(Math.max(at.x, r.x), r.x + r.width),
      y: Math.min(Math.max(at.y, r.y), r.y + r.height),
    };
    const [dx, dy] = STEP[facing];
    const bearing = Math.atan2(near.y - at.y, near.x - at.x);
    const turned = Math.abs(bearing - Math.atan2(dy, dx)) * (180 / Math.PI);
    return Math.min(turned, 360 - turned);
  };
  /** A grave's head as the graveyard lays it (hubGraveyard.ts): a headstone, or a fresh mound. */
  const GRAVES: Rect[] = HUB_GRAVEYARD.filter((s) => s.sheet === "headstone" || s.sheet === "grave_mound").map((s) => ({
    x: s.at.x - s.r,
    y: s.at.y - s.r,
    width: 2 * s.r,
    height: 2 * s.r,
  }));
  /** A town building's street door: the gap its door face is cut round (the golden's). */
  const DOORS: Rect[] = HUB_TOWN_GOLDEN.buildings.map(({ doorGap: { x, y, w, h } }) => ({ x, y, width: w, height: h }));
  /** What a fixed resident may face: the furnishings of its kind, the graveyard's graves, or a door. */
  const facedBy = (r: (typeof HUB_FIXED_RESIDENTS)[number]): Rect[] =>
    r.faces === "grave"
      ? GRAVES
      : r.faces === "door"
        ? DOORS
        : HUB_FURNISHINGS.filter((f) => f.kind === r.faces).map((f) => f.rect);
  const WORSHIPPERS = ["Penitent", "Chandler", "Goodwife", "Ploughman"];
  const MOURNERS = ["Keener", "Widower", "Veteran"];
  const named = (name: string) => HUB_FIXED_RESIDENTS.find((r) => r.name === name)!;

  it.each(HUB_FIXED_RESIDENTS.filter((r) => ![...WORSHIPPERS, "Confessor"].includes(r.name)).map((r) => [r.name, r] as const))(
    "should turn the %s to face what they stand at, within arm's reach",
    (_name, r) => {
      const facing = residentFacing(r.name)!;
      expect(facing).toBe(r.facing);
      expect(facedBy(r).some((rect) => looksAt(r.at, facing, rect))).toBe(true);
    },
  );

  it.each(WORSHIPPERS)("should turn the %s west across the nave to the altar (FS-R4MYX R17)", (name) => {
    const r = named(name);
    expect(residentFacing(name)).toBe("w");
    expect(r.faces).toBe("altar");
    const [altar] = facedBy(r);
    // the altar is ahead of them, not off to the side: within one step of eight of where they face
    expect(offBearing(r.at, "w", altar)).toBeLessThanOrEqual(45);
    expect(altar.x + altar.width).toBeLessThan(r.at.x);
  });

  it("should turn the Confessor east down the aisle to the chapel's door, nothing standing between (FS-R4MYX R17)", () => {
    const r = named("Confessor");
    expect(residentFacing("Confessor")).toBe("e");
    expect(r.faces).toBe("door");
    const chapel = HUB_TOWN_GOLDEN.buildings.find((b) => b.name === "Chapel")!;
    const door = DOORS[HUB_TOWN_GOLDEN.buildings.indexOf(chapel)];
    expect(looksAt(r.at, "e", door, chapel.w)).toBe(true);
    for (const f of HUB_FURNISHINGS.filter((f) => f.rect.x > r.at.x && f.rect.x < door.x))
      expect(r.at.y > f.rect.y && r.at.y < f.rect.y + f.rect.height, `${f.kind} at (${f.rect.x}, ${f.rect.y})`).toBe(false);
  });

  it("should stand the Confessor in front of the dais, not on it or behind the altar (FS-R4MYX R17, owner feedback F2)", () => {
    const r = named("Confessor");
    const dais = HUB_INDOOR_DRESSING.find((s) => s.sheet === "dais")!;
    const daisEast = dais.at.x + dais.size[0] / 2;
    const altar = HUB_FURNISHINGS.find((f) => f.kind === "altar")!;
    expect(r.at.x).toBeGreaterThan(daisEast);
    expect(r.at.x).toBeGreaterThan(altar.rect.x + altar.rect.width);
    expect(Math.abs(r.at.y - dais.at.y)).toBeLessThan(dais.size[1] / 2);
  });

  it("should name each furnishing faced by a kind that is one of its kind in town", () => {
    const kinds = new Set(HUB_FIXED_RESIDENTS.map((r) => r.faces).filter((k) => k !== "grave" && k !== "door"));
    for (const kind of kinds) expect(HUB_FURNISHINGS.filter((f) => f.kind === kind), kind).toHaveLength(1);
  });

  it("should face the Alewife to the counter, the patrons to the long table and the Smith to the forge", () => {
    const kindFaced = (name: string) => named(name).faces;
    expect(kindFaced("Alewife")).toBe("counter");
    expect(["Drover", "Gravedigger", "Pilgrim"].map(kindFaced)).toEqual(["long_table", "long_table", "long_table"]);
    expect(kindFaced("Smith")).toBe("forge");
  });

  it("should face the Confessor east to the door, the worshippers to the altar and the mourners to their graves (FS-R4MYX R17, R26)", () => {
    expect(named("Confessor")).toMatchObject({ facing: "e", faces: "door" });
    for (const name of WORSHIPPERS) expect(named(name), name).toMatchObject({ facing: "w", faces: "altar" });
    for (const name of MOURNERS) expect(named(name), name).toMatchObject({ facing: "w", faces: "grave" });
  });

  it("should know no facing for a name it has none for, so the default stands", () => {
    expect(residentFacing("Cottar")).toBeUndefined();
  });
});
