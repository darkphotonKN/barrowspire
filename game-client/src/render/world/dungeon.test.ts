import { describe, expect, it } from "vitest";
import type { FloorRegion } from "@/types/gameState";
import { RegionGrid, dressingRooms, isDungeon, stripWalls, wallRule, type DungeonMap } from "./dungeon";
import fixture from "./dungeon.fixture.json";

const CELL = 80;

/** A hand-made dungeon floor: `cols` × `rows` cells of 80 px, these regions walkable. */
const floor = (cols: number, rows: number, regions: FloorRegion[]) =>
  new RegionGrid({ width: cols * CELL, height: rows * CELL, cell_size: CELL, regions });

const room = (id: number, x: number, y: number, w: number, h: number): FloorRegion => ({
  id,
  kind: "room",
  cells: [{ x, y, w, h }],
});
const corridor = (id: number, x: number, y: number, w: number, h: number): FloorRegion => ({
  id,
  kind: "corridor",
  cells: [{ x, y, w, h }],
});

/** The world point at the middle of cell (cx, cy): where a wall piece over that cell stands. */
const mid = (cx: number, cy: number) => ({ x: (cx + 0.5) * CELL, y: (cy + 0.5) * CELL });

describe("the dungeon wall-height rule (FS-KE075 §H.46)", () => {
  it("is front for a wall with walkable cells both north and south of it", () => {
    // a room over row 1–2, a corridor under row 4–5, the shell row 3 between them
    const grid = floor(10, 8, [room(1, 1, 1, 6, 2), corridor(2, 1, 4, 6, 2)]);
    expect(wallRule(grid).height(mid(3, 3))).toBe("front");
  });

  it("is front for a wall with walkable cells both west and east of it", () => {
    const grid = floor(10, 10, [room(1, 1, 1, 2, 6), corridor(2, 4, 1, 2, 6)]);
    expect(wallRule(grid).height(mid(3, 3))).toBe("front");
  });

  // the corridor rule: an east–west corridor has a low south wall and a full north wall, a
  // north–south corridor a low east wall and a full west wall
  it.each([
    ["east–west corridor, south wall", "front", corridor(1, 2, 3, 6, 2), mid(4, 5)],
    ["east–west corridor, north wall", "back", corridor(1, 2, 3, 6, 2), mid(4, 2)],
    ["north–south corridor, east wall", "front", corridor(1, 3, 2, 2, 6), mid(5, 4)],
    ["north–south corridor, west wall", "back", corridor(1, 3, 2, 2, 6), mid(2, 4)],
  ] as const)("%s is %s", (_name, height, region, at) => {
    expect(wallRule(floor(10, 10, [region])).height(at)).toBe(height);
  });

  // a room 4×4 at (2, 2): its shell is columns 1 and 6, rows 1 and 6
  it.each([
    ["north side", "back", mid(4, 1)],
    ["west side", "back", mid(1, 4)],
    ["south side", "front", mid(4, 6)],
    ["east side", "front", mid(6, 4)],
    ["north-west corner", "back", mid(1, 1)],
    ["north-east corner", "back", mid(6, 1)],
    ["south-west corner", "back", mid(1, 6)],
    // where two low sides meet: low too, as a house's south-east corner is (walls.ts heightOf)
    ["south-east corner", "front", mid(6, 6)],
  ] as const)("a room's %s is %s", (_name, height, at) => {
    expect(wallRule(floor(10, 10, [room(1, 2, 2, 4, 4)])).height(at)).toBe(height);
  });
});

describe("wall lights on a dungeon floor (FS-KE075 §H.47)", () => {
  // a room 4×4 at (2, 2), a corridor 2 wide leaving its east side east–west at rows 3–4
  const grid = floor(14, 10, [room(1, 2, 2, 4, 4), corridor(2, 6, 3, 6, 2)]);

  it.each([
    ["a room's north wall", true, mid(4, 1)],
    ["a room's west wall", true, mid(1, 4)],
    ["a room's south wall (front)", false, mid(4, 6)],
    ["a room's east wall (front)", false, mid(6, 5)],
    ["a corridor's north wall", false, mid(9, 2)],
    ["a corridor's south wall (front)", false, mid(9, 5)],
  ] as const)("%s may carry a light: %s", (_name, lit, at) => {
    expect(wallRule(grid).lit(at)).toBe(lit);
  });
});

describe("a dungeon floor's thick walls (FS-KE075 §H.46)", () => {
  const rect = (x: number, y: number, width: number, height: number) => ({
    entity_id: "w",
    position: { x, y },
    width,
    height,
  });
  const shape = (walls: ReturnType<typeof stripWalls>) =>
    walls.map((w) => [w.entity_id, w.position.x, w.position.y, w.width, w.height]);

  it("leaves a wall one cell thick as it is", () => {
    expect(shape(stripWalls([rect(80, 160, 640, 80)], CELL))).toEqual([["w", 80, 160, 640, 80]]);
  });

  it("cuts a block thicker than a cell into one-cell strips along its run, each the same wall", () => {
    // runs along x (wider than tall): strips one row deep
    expect(shape(stripWalls([rect(5120, 1920, 240, 160)], CELL))).toEqual([
      ["w", 5120, 1920, 240, 80],
      ["w", 5120, 2000, 240, 80],
    ]);
    // runs along y: strips one column wide
    expect(shape(stripWalls([rect(4400, 1600, 160, 320)], CELL))).toEqual([
      ["w", 4400, 1600, 80, 320],
      ["w", 4480, 1600, 80, 320],
    ]);
  });
});

describe("where a dungeon floor has ground (FS-KE075 §H.44)", () => {
  // a room 2×2 at (3, 3): its shell is the ring around it, diagonals included
  const grid = floor(8, 8, [room(1, 3, 3, 2, 2)]);

  it.each([
    ["a walkable cell", true, mid(3, 3)],
    ["a shell cell beside it", true, mid(2, 3)],
    ["a shell cell on its diagonal", true, mid(5, 5)],
    ["a void cell", false, mid(1, 1)],
    ["off the floor", false, { x: -40, y: 200 }],
  ] as const)("%s: %s", (_name, ground, at) => {
    expect(grid.hasGround(at)).toBe(ground);
  });
});

describe("a dungeon floor's rooms, for its dressing (FS-KE075 §H.47)", () => {
  /** The levelgen golden (dungeon_seed_20261106) as a floor map: its size, cells, regions, walls. */
  const golden = new RegionGrid(fixture as DungeonMap);

  it("finds a room's doorways where a corridor meets it, as the generator placed them", () => {
    // region 1's doorways, as the golden's `rooms[0].doorways` lists them
    const want = [[32, 35], [33, 35], [35, 37], [28, 38], [35, 38], [28, 39], [35, 39]];
    const got: number[][] = [];
    for (let cx = 28; cx < 36; cx++)
      for (let cy = 35; cy < 42; cy++) if (golden.doorway(cx, cy)) got.push([cx, cy]);
    expect(new Set(got.map(String))).toEqual(new Set(want.map(String)));
  });

  it("lists every room, none of the corridors, each with its rect in world px", () => {
    const rooms = dressingRooms(golden);
    expect(rooms).toHaveLength(22);
    expect(rooms[0]).toMatchObject({ id: 1, rect: { x: 28 * CELL, y: 35 * CELL, width: 8 * CELL, height: 7 * CELL } });
  });

  describe("where a room's dressing may stand", () => {
    // a room 6×6 at (2, 2) with a corridor leaving its east side at rows 4–5: doorways (7, 4), (7, 5)
    const grid = floor(16, 10, [room(1, 2, 2, 6, 6), corridor(2, 8, 4, 6, 2)]);
    const [inRoom] = dressingRooms(grid);
    const square = (cx: number, cy: number, side = 20) => ({
      x: (cx + 0.5) * CELL - side / 2,
      y: (cy + 0.5) * CELL - side / 2,
      width: side,
      height: side,
    });

    it.each([
      ["wholly in the room, clear of its doorways", true, square(3, 3)],
      ["in a corridor", false, square(10, 4)],
      ["half out of the room, over its shell", false, { ...square(2, 3), x: 2 * CELL - 10 }],
      ["on a doorway", false, square(7, 4)],
      ["one cell from a doorway", false, square(6, 5)],
      ["diagonally one cell from a doorway", false, square(6, 3)],
      ["two cells from a doorway", true, square(5, 4)],
    ] as const)("%s: %s", (_name, clear, sq) => {
      expect(inRoom.clear(sq)).toBe(clear);
    });
  });
});

describe("isDungeon (FS-KE075 §F.31, §H)", () => {
  it.each([
    ["a map with a cell size and regions", true, { cell_size: 80, regions: [room(1, 1, 1, 2, 2)] }],
    ["a floor of buildings: no cell size, no regions", false, {}],
    ["a cell size but no region", false, { cell_size: 80, regions: [] }],
  ] as const)("%s: %s", (_name, dungeon, map) => {
    expect(isDungeon(map)).toBe(dungeon);
  });
});
