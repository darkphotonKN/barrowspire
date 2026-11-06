import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FloorRegion, WallState } from "@/types/gameState";
import { FIXTURE, GOLDEN, fixtureFrom, format } from "../../../tools/fixtures/dungeon-fixture.mjs";
import { RegionGrid, dressingRooms, isDungeon, wallRule, wallRuns, type DungeonMap } from "./dungeon";
import fixture from "./dungeon.fixture.json";
import { MASONRY_WALLS, planWalls, type WallAxis } from "./walls";

/** The levelgen golden layout the fixture is cut from (game-server levelgen testdata). */
interface GoldenLayout {
  rooms: { rect: { x: number; y: number; w: number; h: number }; region: number; doorways: { x: number; y: number }[] }[];
}
const layout = JSON.parse(readFileSync(GOLDEN, "utf8")) as GoldenLayout;

describe("the dungeon fixture (FS-KE075 §F.31)", () => {
  it("is the levelgen golden's floor map, size, cells, regions and walls, and none of its roles: regenerate with node tools/fixtures/dungeon-fixture.mjs", () => {
    expect(fixture).toEqual(fixtureFrom(layout));
    expect(readFileSync(FIXTURE, "utf8")).toBe(format(fixture));
    expect(Object.keys(fixture)).not.toContain("roles");
  });
});

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

/**
 * A hand-made floor's walls as the server sends them (levelgen merge.go `mergeCells`): its shell
 * cells, each row split into runs, a run identical to one in the row above extending that rect.
 */
function serverWalls(grid: RegionGrid): WallState[] {
  const shell = (cx: number, cy: number) =>
    !grid.walkable(cx, cy) && grid.hasGround({ x: (cx + 0.5) * CELL, y: (cy + 0.5) * CELL });
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  let open: typeof rects = [];
  for (let cy = 0; cy <= grid.rows; cy++) {
    const next: typeof rects = [];
    for (let cx = 0; cy < grid.rows && cx < grid.cols; ) {
      if (!shell(cx, cy)) {
        cx++;
        continue;
      }
      const x = cx;
      while (cx < grid.cols && shell(cx, cy)) cx++;
      const same = open.find((o) => o.x === x && o.w === cx - x);
      if (same) {
        same.h++;
        next.push(same);
      } else next.push({ x, y: cy, w: cx - x, h: 1 });
    }
    rects.push(...open.filter((o) => !next.includes(o)));
    open = next;
  }
  return rects.map((r, i) => ({
    entity_id: `w-${i}`,
    position: { x: r.x * CELL, y: r.y * CELL },
    width: r.w * CELL,
    height: r.h * CELL,
  }));
}

/** The axes of the pieces drawn over each cell, keyed `cx,cy`. */
function drawnAxes(grid: RegionGrid, walls: readonly WallState[]): Map<string, Set<WallAxis>> {
  const { pieces } = planWalls(wallRuns(walls, grid), 1, MASONRY_WALLS, wallRule(grid));
  const axes = new Map<string, Set<WallAxis>>();
  for (const p of pieces) {
    const { cx, cy } = grid.cellOf(p.at);
    const key = `${cx},${cy}`;
    axes.set(key, (axes.get(key) ?? new Set()).add(p.axis));
  }
  return axes;
}

/** The cells of a floor's walls, `cx,cy`. */
const wallCells = (walls: readonly WallState[]) =>
  walls.flatMap((w) => {
    const cells: string[] = [];
    for (let cx = w.position.x / CELL; cx < (w.position.x + w.width) / CELL; cx++)
      for (let cy = w.position.y / CELL; cy < (w.position.y + w.height) / CELL; cy++) cells.push(`${cx},${cy}`);
    return cells;
  });

describe("a dungeon floor's wall runs (FS-KE075 §H.46)", () => {
  it("cuts a room's side along world y as one run from corner to corner, as its side along x is", () => {
    // a room 4×4 at (2, 2): the server merges its west and east sides into 1×4 rects that stop a
    // cell short of the corners, which its north and south rows take whole
    const grid = floor(10, 10, [room(1, 2, 2, 4, 4)]);
    const { pieces, posts } = planWalls(wallRuns(serverWalls(grid), grid), 1, MASONRY_WALLS, wallRule(grid));
    const along = (axis: WallAxis, fixed: "x" | "y", at: number, run: "x" | "y") =>
      pieces
        .filter((p) => p.axis === axis && p.at[fixed] === at)
        .map((p) => p.at[run])
        .sort((a, b) => a - b);
    const tiles = (from: number, to: number) => Array.from({ length: (to - from) / 40 }, (_, k) => from + 20 + k * 40);
    // the north side: cell 1 to cell 6, whole; the west and east sides the same, along y
    expect(along("x", "y", 1.5 * CELL, "x")).toEqual(tiles(CELL, 7 * CELL));
    expect(along("y", "x", 1.5 * CELL, "y")).toEqual(tiles(CELL, 7 * CELL));
    expect(along("y", "x", 6.5 * CELL, "y")).toEqual(tiles(CELL, 7 * CELL));
    // a post at each corner and nowhere along a side
    expect(new Set(posts.map((p) => `${p.at.x / CELL - 0.5},${p.at.y / CELL - 0.5}`))).toEqual(
      new Set(["1,1", "6,1", "1,6", "6,6"]),
    );
  });

  describe("on the levelgen golden floor", () => {
    const golden = new RegionGrid(fixture as DungeonMap);
    const walls = (fixture as { walls: WallState[] }).walls;
    const axes = drawnAxes(golden, walls);
    const faces = (cx: number, cy: number) => ({
      x: golden.walkable(cx, cy - 1) || golden.walkable(cx, cy + 1),
      y: golden.walkable(cx - 1, cy) || golden.walkable(cx + 1, cy),
    });

    const cells = wallCells(walls);
    const isWall = new Set(cells);

    it.each([
      ["west or east", "y", "x"],
      ["north or south", "x", "y"],
    ] as const)("draws every wall cell facing a region only %s with a piece along %s", (_side, axis, other) => {
      const missing = cells.filter((key) => {
        const [cx, cy] = key.split(",").map(Number);
        const f = faces(cx, cy);
        return f[axis] && !f[other] && !axes.get(key)?.has(axis);
      });
      expect(missing).toEqual([]);
    });

    it("draws a wall cell facing regions both ways along one of them at least", () => {
      // a stub with regions on three sides, or a wall's end at a corridor's mouth: drawn along the
      // run it is in, never as a one-cell slab across it
      const bare = cells.filter((key) => {
        const [cx, cy] = key.split(",").map(Number);
        const f = faces(cx, cy);
        return f.x && f.y && !axes.get(key)?.has("x") && !axes.get(key)?.has("y");
      });
      expect(bare).toEqual([]);
    });

    it.each(["x", "y"] as const)(
      "runs a piece along %s only on a cell with a wall beside it that way, or none on any side",
      (axis) => {
        const stray = cells.filter((key) => {
          const [cx, cy] = key.split(",").map(Number);
          const beside = (dx: number, dy: number) => isWall.has(`${cx + dx},${cy + dy}`);
          const along = axis === "x" ? beside(-1, 0) || beside(1, 0) : beside(0, -1) || beside(0, 1);
          const alone = !beside(-1, 0) && !beside(1, 0) && !beside(0, -1) && !beside(0, 1);
          return axes.get(key)?.has(axis) && !along && !alone;
        });
        expect(stray).toEqual([]);
      },
    );

    it("leaves no wall cell without a piece", () => {
      expect(wallCells(walls).filter((key) => !axes.has(key))).toEqual([]);
    });

    it("draws the three-cell west wall of the room east of column 35 as one run along y", () => {
      // rows 1–3 of column 35: the room's north-west corner, a lone 1×1 rect, and the end of the
      // corridor's north wall, which the server merges into three rects
      for (const cy of [1, 2, 3]) expect(axes.get(`35,${cy}`)?.has("y")).toBe(true);
      expect(axes.get("35,2")?.has("x")).toBe(false);
    });
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
    // each room's doorways, as the golden's `rooms[].doorways` lists them
    for (const { rect, doorways } of layout.rooms) {
      const got: string[] = [];
      for (let cx = rect.x; cx < rect.x + rect.w; cx++)
        for (let cy = rect.y; cy < rect.y + rect.h; cy++) if (golden.doorway(cx, cy)) got.push(`${cx},${cy}`);
      expect(new Set(got)).toEqual(new Set(doorways.map(({ x, y }) => `${x},${y}`)));
    }
  });

  it("lists every room, none of the corridors, each with its rect in world px", () => {
    const rooms = dressingRooms(golden);
    expect(rooms).toHaveLength(layout.rooms.length);
    for (const { region, rect } of layout.rooms)
      expect(rooms.find((r) => r.id === region)).toMatchObject({
        rect: { x: rect.x * CELL, y: rect.y * CELL, width: rect.w * CELL, height: rect.h * CELL },
      });
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
