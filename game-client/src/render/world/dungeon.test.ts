import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FloorRegion, WallState } from "@/types/gameState";
import { FIXTURE, GOLDEN, fixtureFrom, format } from "../../../tools/fixtures/dungeon-fixture.mjs";
import {
  RegionGrid,
  dressingRooms,
  edgeHeight,
  edgeLit,
  isDungeon,
  wallPlan,
  wallRule,
  wallRuns,
  type DungeonMap,
  type EdgeRun,
  type EdgeSide,
  type WallEdge,
  type WallPlan,
} from "./dungeon";
import fixture from "./dungeon.fixture.json";
import { MASONRY_WALLS, TIMBER_WALLS, planWalls, thicknessPx, type WallAxis } from "./walls";

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

/** Whether a cell is a shell cell: not walkable, and 8-adjacent to a walkable one (FS-KE075 R7). */
const isShell = (grid: RegionGrid, cx: number, cy: number) =>
  !grid.walkable(cx, cy) &&
  [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => grid.walkable(cx + dx, cy + dy)));

/**
 * A hand-made floor's walls as the server sends them (levelgen merge.go `mergeCells`): its shell
 * cells, each row split into runs, a run identical to one in the row above extending that rect.
 */
function serverWalls(grid: RegionGrid): WallState[] {
  const shell = (cx: number, cy: number) => isShell(grid, cx, cy);
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
    // the north side: from the corner post in cell 1 to the one in cell 6, and no further, so
    // nothing sticks out past a corner; the west and east sides the same, along y
    expect(along("x", "y", 1.5 * CELL, "x")).toEqual(tiles(1.5 * CELL, 6.5 * CELL));
    expect(along("y", "x", 1.5 * CELL, "y")).toEqual(tiles(1.5 * CELL, 6.5 * CELL));
    expect(along("y", "x", 6.5 * CELL, "y")).toEqual(tiles(1.5 * CELL, 6.5 * CELL));
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

    it("stands every piece of a run between the run's two end posts, none sticking out past one", () => {
      const stubs = wallRuns(walls, golden)
        .filter((run) => run.width !== run.height)
        .flatMap((run) => {
          const axis = run.width > run.height ? "x" : "y";
          const from = run.position[axis] + CELL / 2;
          const to = run.position[axis] + (axis === "x" ? run.width : run.height) - CELL / 2;
          return planWalls([run], 1, MASONRY_WALLS, wallRule(golden))
            .pieces.filter((p) => p.at[axis] < from || p.at[axis] > to)
            .map((p) => `${p.axis}@${p.at.x},${p.at.y}`);
        });
      expect(stubs).toEqual([]);
    });

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

describe("a wall material's thickness (FS-XK2B6 §A.2)", () => {
  /** The number a bake model declares, read from its source: the client's is a mirror of it. */
  const baked = (model: string, name: string) => {
    const source = readFileSync(new URL(`../../../tools/bake/page/models/${model}.js`, import.meta.url), "utf8");
    return Number(new RegExp(`^const ${name} = ([\\d.]+);`, "m").exec(source)?.[1]);
  };

  it.each([
    ["the tower's masonry", MASONRY_WALLS, 0.24, 9.6, "tower", "P_THICK"],
    ["the timber wall", TIMBER_WALLS, 0.18, 7.2, "architecture", "THICK"],
  ] as const)("%s is %s tile thick, %s world px, as its bake model is", (_name, sheets, tiles, px, model, constant) => {
    expect(sheets.thickness).toBe(tiles);
    expect(thicknessPx(sheets)).toBeCloseTo(px, 9);
    expect(baked(model, constant)).toBe(tiles);
  });
});

/** Half the masonry's thickness, world px: how far a post stands from its cell corner on each axis. */
const THICK = thicknessPx(MASONRY_WALLS);
const HALF = THICK / 2;

/** A hand-made floor's plan, from its walls as the server would send them. */
const planOf = (grid: RegionGrid) => wallPlan(serverWalls(grid), grid, THICK);

/** A run without the wall it is named after: what must not depend on how the server merged. */
const shape = ({ axis, from, to, wallSide, height, thickness }: EdgeRun) => ({ axis, from, to, wallSide, height, thickness });

/** The run of a plan on one cell line, with its wall cells on one side, that covers a place along it. */
const runOn = (plan: WallPlan, wallSide: EdgeSide, line: number, along: number) => {
  const [axis, across] = wallSide === "north" || wallSide === "south" ? (["x", "y"] as const) : (["y", "x"] as const);
  return plan.runs.find(
    (r) => r.wallSide === wallSide && r.from[across] === line && r.from[axis] <= along && along < r.to[axis],
  );
};

/** The wall edges a run is made of, `cx,cy,wallSide`. */
function edgesOf(run: EdgeRun): string[] {
  const keys: string[] = [];
  for (let at = run.from[run.axis]; at < run.to[run.axis]; at += CELL) {
    const k = at / CELL;
    // the wall cell: on the line's far side when its cells lie south or east, the near side otherwise
    const lane = (run.axis === "x" ? run.from.y : run.from.x) / CELL - (run.wallSide === "north" || run.wallSide === "west" ? 1 : 0);
    keys.push(run.axis === "x" ? `${k},${lane},${run.wallSide}` : `${lane},${k},${run.wallSide}`);
  }
  return keys;
}

const edgeKey = (e: WallEdge) => `${e.cx},${e.cy},${e.wallSide}`;
const at = (x: number, y: number) => ({ x, y });

describe("a wall edge's height (FS-XK2B6 §B.8)", () => {
  // a room over rows 1–2 and a corridor under rows 4–5, the wall row 3 between them
  const grid = floor(10, 8, [room(1, 1, 1, 6, 2), corridor(2, 1, 4, 6, 2)]);

  it.each([
    ["south of the cell it faces", "south", "front"],
    ["east of the cell it faces", "east", "front"],
    ["north of the cell it faces", "north", "back"],
    ["west of the cell it faces", "west", "back"],
  ] as const)("an edge whose wall cell lies %s is %s", (_name, wallSide, height) => {
    expect(edgeHeight({ cx: 3, cy: 3, wallSide }, grid)).toBe(height);
  });

  it("gives a wall cell with walkable cells north and south a front edge north and a back edge south", () => {
    // the cell lies south of the room it faces across its north edge, north of the corridor
    expect(edgeHeight({ cx: 3, cy: 3, wallSide: "south" }, grid)).toBe("front");
    expect(edgeHeight({ cx: 3, cy: 3, wallSide: "north" }, grid)).toBe("back");
  });
});

describe("whether a wall edge may carry a light (FS-XK2B6 §D.13)", () => {
  // a room 4×4 at (2, 2), a corridor 2 wide leaving its east side at rows 3–4
  const grid = floor(14, 10, [room(1, 2, 2, 4, 4), corridor(2, 6, 3, 6, 2)]);

  it.each([
    ["a room's north edge (back)", true, { cx: 4, cy: 1, wallSide: "north" }],
    ["a room's west edge (back)", true, { cx: 1, cy: 4, wallSide: "west" }],
    ["a room's south edge (front)", false, { cx: 4, cy: 6, wallSide: "south" }],
    ["a room's east edge (front)", false, { cx: 6, cy: 5, wallSide: "east" }],
    ["a corridor's north edge (back)", false, { cx: 9, cy: 2, wallSide: "north" }],
    ["a corridor's south edge (front)", false, { cx: 9, cy: 5, wallSide: "south" }],
  ] as const)("%s: %s", (_name, lit, edge) => {
    expect(edgeLit(edge, grid)).toBe(lit);
  });
});

describe("a dungeon floor's wall plan (FS-XK2B6 §A, §B, §I)", () => {
  describe("a 3 × 3 room in a 5 × 5 grid", () => {
    const plan = planOf(floor(5, 5, [room(1, 1, 1, 3, 3)]));

    it("is four runs of three cells from room corner to room corner: north and west back, south and east front", () => {
      expect(plan.runs.map(shape)).toEqual([
        { axis: "x", from: at(80, 80), to: at(320, 80), wallSide: "north", height: "back", thickness: THICK },
        { axis: "x", from: at(80, 320), to: at(320, 320), wallSide: "south", height: "front", thickness: THICK },
        { axis: "y", from: at(80, 80), to: at(80, 320), wallSide: "west", height: "back", thickness: THICK },
        { axis: "y", from: at(320, 80), to: at(320, 320), wallSide: "east", height: "front", thickness: THICK },
      ]);
    });

    it("holds the twelve wall edges the room's sides are, and none on a corner's cell", () => {
      expect(plan.edges).toHaveLength(12);
      expect(new Set(plan.edges.map(edgeKey))).toEqual(new Set(plan.runs.flatMap(edgesOf)));
      for (const corner of ["0,0", "4,0", "0,4", "4,4"])
        expect(plan.edges.filter((e) => `${e.cx},${e.cy}` === corner)).toEqual([]);
    });

    it("stands four posts, each half a thickness outside its room corner; only the south-east one is front", () => {
      const posts = plan.posts.map(({ corner, at: place, height }) => ({ corner, at: place, height }));
      expect(posts).toHaveLength(4);
      expect(posts).toEqual(
        expect.arrayContaining([
          { corner: at(80, 80), at: at(80 - HALF, 80 - HALF), height: "back" },
          { corner: at(320, 80), at: at(320 + HALF, 80 - HALF), height: "back" },
          { corner: at(80, 320), at: at(80 - HALF, 320 + HALF), height: "back" },
          { corner: at(320, 320), at: at(320 + HALF, 320 + HALF), height: "front" },
        ]),
      );
    });

    it("names each run and post after a wall of the map", () => {
      const ids = new Set(serverWalls(floor(5, 5, [room(1, 1, 1, 3, 3)])).map((w) => w.entity_id));
      for (const { wallId } of [...plan.runs, ...plan.posts]) expect(ids).toContain(wallId);
    });
  });

  it("ends the walls either side of a one-cell doorway 80 px apart, each under a post", () => {
    // a room 4×4 at (1, 1), a corridor one cell wide leaving its east side at row 2
    const plan = planOf(floor(12, 6, [room(1, 1, 1, 4, 4), corridor(2, 5, 2, 5, 1)]));
    const above = runOn(plan, "east", 5 * CELL, 1 * CELL)!;
    const below = runOn(plan, "east", 5 * CELL, 3 * CELL)!;
    expect(above.to).toEqual(at(5 * CELL, 2 * CELL));
    expect(below.from).toEqual(at(5 * CELL, 3 * CELL));
    expect(below.from.y - above.to.y).toBe(80);
    // the jambs: the room's east wall meets the corridor's north wall, and its south wall
    expect(plan.posts.find((p) => p.corner.x === 5 * CELL && p.corner.y === 2 * CELL)).toMatchObject({
      at: at(5 * CELL + HALF, 2 * CELL - HALF),
      height: "back",
    });
    expect(plan.posts.find((p) => p.corner.x === 5 * CELL && p.corner.y === 3 * CELL)).toMatchObject({
      at: at(5 * CELL + HALF, 3 * CELL + HALF),
      height: "front",
    });
  });

  it("gives a wall cell between a room and a corridor a wall on each of its two edges, each its own height", () => {
    // a room over rows 1–2 and a corridor under rows 4–5: every cell of row 3 has a walkable cell north and south
    const plan = planOf(floor(10, 8, [room(1, 1, 1, 6, 2), corridor(2, 1, 4, 6, 2)]));
    expect(shape(runOn(plan, "south", 3 * CELL, 3 * CELL)!)).toMatchObject({
      from: at(1 * CELL, 3 * CELL),
      to: at(7 * CELL, 3 * CELL),
      height: "front",
    });
    expect(shape(runOn(plan, "north", 4 * CELL, 3 * CELL)!)).toMatchObject({
      from: at(1 * CELL, 4 * CELL),
      to: at(7 * CELL, 4 * CELL),
      height: "back",
    });
  });

  it("makes a run of one cell a run like any other, between two posts", () => {
    // a room one cell wide and three tall: its north and south sides are one cell
    const plan = planOf(floor(3, 5, [room(1, 1, 1, 1, 3)]));
    const north = runOn(plan, "north", CELL, CELL)!;
    expect(shape(north)).toMatchObject({ from: at(CELL, CELL), to: at(2 * CELL, CELL), height: "back" });
    for (const end of [north.from, north.to])
      expect(plan.posts.filter((p) => p.corner.x === end.x && p.corner.y === end.y)).toHaveLength(1);
  });

  it("stands one post under the four runs that end where two walkable cells touch only by a corner", () => {
    // two rooms of one cell, (1, 1) and (2, 2), touching at the corner (160, 160)
    const plan = planOf(floor(4, 4, [room(1, 1, 1, 1, 1), room(2, 2, 2, 1, 1)]));
    const here = at(2 * CELL, 2 * CELL);
    const ending = plan.runs.filter((r) => [r.from, r.to].some((end) => end.x === here.x && end.y === here.y));
    expect(ending).toHaveLength(4);
    // walls lie on both sides of the corner along each axis, so the post stands on it
    expect(plan.posts.filter((p) => p.corner.x === here.x && p.corner.y === here.y)).toEqual([
      expect.objectContaining({ at: here, height: "back" }),
    ]);
  });

  it("draws no edge between a walkable cell and a cell the map's walls do not cover", () => {
    const grid = floor(5, 5, [room(1, 1, 1, 3, 3)]);
    // the map without the wall over the room's north side
    const walls = serverWalls(grid).filter((w) => w.position.y !== 0);
    const plan = wallPlan(walls, grid, THICK);
    expect(plan.edges.filter((e) => e.wallSide === "north")).toEqual([]);
    expect(plan.edges).toHaveLength(9);
  });

  describe("on the levelgen golden floor", () => {
    const grid = new RegionGrid(fixture as DungeonMap);
    const walls = (fixture as { walls: WallState[] }).walls;
    const plan = wallPlan(walls, grid, THICK);
    const cells = wallCells(walls);
    const isWall = new Set(cells);

    /** The sides a wall cell has a walkable cell directly on, as the side the wall cell lies on of each edge. */
    const sidesOf = (key: string): EdgeSide[] => {
      const [cx, cy] = key.split(",").map(Number);
      return [
        grid.walkable(cx, cy - 1) && "south",
        grid.walkable(cx, cy + 1) && "north",
        grid.walkable(cx - 1, cy) && "east",
        grid.walkable(cx + 1, cy) && "west",
      ].filter((s): s is EdgeSide => !!s);
    };
    const count = (wallSide: EdgeSide) => plan.edges.filter((e) => e.wallSide === wallSide).length;

    it("holds exactly the 766 wall edges: one for every wall cell and walkable cell that share a side", () => {
      expect(new Set(cells).size).toBe(745);
      const want = cells.flatMap((key) => sidesOf(key).map((side) => `${key},${side}`));
      expect(plan.edges).toHaveLength(766);
      expect(new Set(plan.edges.map(edgeKey))).toEqual(new Set(want));
      // by the side of its wall cell the edge is on: a cell lying south of its edge shows it on its north side
      expect({ north: count("south"), south: count("north"), west: count("east"), east: count("west") }).toEqual({
        north: 195,
        south: 195,
        west: 188,
        east: 188,
      });
    });

    it("gives 650 wall cells an edge, 113 of them more than one, and the other 95 none", () => {
      const perCell = new Map<string, number>();
      for (const e of plan.edges) perCell.set(`${e.cx},${e.cy}`, (perCell.get(`${e.cx},${e.cy}`) ?? 0) + 1);
      expect(perCell.size).toBe(650);
      expect([...perCell.values()].filter((n) => n > 1)).toHaveLength(113);
      const bare = cells.filter((key) => sidesOf(key).length === 0);
      expect(bare).toHaveLength(95);
      expect(bare.filter((key) => perCell.has(key))).toEqual([]);
    });

    it("puts every edge in exactly one run, each a whole number of cells on one cell line", () => {
      const inRuns = plan.runs.flatMap(edgesOf);
      expect(inRuns).toHaveLength(766);
      expect(new Set(inRuns)).toEqual(new Set(plan.edges.map(edgeKey)));
      for (const run of plan.runs) {
        const across = run.axis === "x" ? "y" : "x";
        expect(run.from[across]).toBe(run.to[across]);
        expect(run.to[run.axis]).toBeGreaterThan(run.from[run.axis]);
        for (const end of [run.from, run.to]) expect([end.x % CELL, end.y % CELL]).toEqual([0, 0]);
        expect(run.axis).toBe(run.wallSide === "north" || run.wallSide === "south" ? "x" : "y");
        expect(run.thickness).toBe(THICK);
      }
    });

    it("ends a run only where the next cell along shows no such edge", () => {
      const edges = new Set(plan.edges.map(edgeKey));
      for (const run of plan.runs) {
        const own = edgesOf(run);
        const [cx, cy] = own[0].split(",").map(Number);
        const [ex, ey] = own[own.length - 1].split(",").map(Number);
        const [dx, dy] = run.axis === "x" ? [1, 0] : [0, 1];
        expect(edges.has(`${cx - dx},${cy - dy},${run.wallSide}`)).toBe(false);
        expect(edges.has(`${ex + dx},${ey + dy},${run.wallSide}`)).toBe(false);
      }
    });

    it("makes a run front when its wall cells lie south or east of the cells it faces, back otherwise", () => {
      for (const run of plan.runs) expect(run.height).toBe(run.wallSide === "south" || run.wallSide === "east" ? "front" : "back");
      for (const edge of plan.edges) {
        const run = plan.runs.find((r) => edgesOf(r).includes(edgeKey(edge)))!;
        expect(run.height).toBe(edgeHeight(edge, grid));
      }
    });

    it("has 7 wall cells with walkable cells on opposite sides, all north and south: front on the north edge, back on the south", () => {
      const twoSided = cells.filter((key) => {
        const sides = sidesOf(key);
        return (sides.includes("north") && sides.includes("south")) || (sides.includes("west") && sides.includes("east"));
      });
      expect(twoSided).toHaveLength(7);
      for (const key of twoSided) {
        const [cx, cy] = key.split(",").map(Number);
        expect(sidesOf(key)).toEqual(expect.arrayContaining(["north", "south"]));
        // its north edge is on the line over it, its south edge on the line under it
        expect(runOn(plan, "south", cy * CELL, cx * CELL)?.height).toBe("front");
        expect(runOn(plan, "north", (cy + 1) * CELL, cx * CELL)?.height).toBe("back");
      }
    });

    it("has 58 wall cells carrying a front edge and a back edge at once", () => {
      const heights = new Map<string, Set<string>>();
      for (const run of plan.runs)
        for (const key of edgesOf(run)) {
          const cell = key.split(",").slice(0, 2).join(",");
          heights.set(cell, (heights.get(cell) ?? new Set()).add(run.height));
        }
      expect([...heights.values()].filter((h) => h.size === 2)).toHaveLength(58);
    });

    it("stands one post at every run end and nowhere else: the corners where the walkable outline turns", () => {
      const ends = new Set(plan.runs.flatMap((r) => [r.from, r.to]).map((p) => `${p.x},${p.y}`));
      const corners = plan.posts.map((p) => `${p.corner.x},${p.corner.y}`);
      expect(new Set(corners).size).toBe(corners.length);
      expect(new Set(corners)).toEqual(ends);
      // a grid corner where the outline turns: of the four cells round it, one or three are walkable
      const turns = new Set<string>();
      for (let vx = 0; vx <= grid.cols; vx++)
        for (let vy = 0; vy <= grid.rows; vy++) {
          const round = [grid.walkable(vx - 1, vy - 1), grid.walkable(vx, vy - 1), grid.walkable(vx - 1, vy), grid.walkable(vx, vy)];
          const n = round.filter(Boolean).length;
          if (n === 1 || n === 3) turns.add(`${vx * CELL},${vy * CELL}`);
        }
      expect(ends).toEqual(turns);
    });

    it("sets each post half a thickness to the wall side of its corner on each axis, where the two walls' thicknesses cross", () => {
      for (const post of plan.posts) {
        const vx = post.corner.x / CELL;
        const vy = post.corner.y / CELL;
        const round = [
          [vx - 1, vy - 1],
          [vx, vy - 1],
          [vx - 1, vy],
          [vx, vy],
        ].map(([cx, cy]) => ({ cx, cy, open: grid.walkable(cx, cy) }));
        const open = round.filter((c) => c.open);
        // an outer corner of the walkable area: the wall cell diagonal to its one walkable cell;
        // an inner corner: the one wall cell
        const into =
          open.length === 1 ? round.find((c) => c.cx !== open[0].cx && c.cy !== open[0].cy)! : round.find((c) => !c.open)!;
        expect(isWall.has(`${into.cx},${into.cy}`)).toBe(true);
        expect(post.at.x).toBeCloseTo(post.corner.x + (into.cx === vx ? HALF : -HALF), 9);
        expect(post.at.y).toBeCloseTo(post.corner.y + (into.cy === vy ? HALF : -HALF), 9);
      }
    });

    it("makes a post back when any run ending at it is back, front otherwise", () => {
      for (const post of plan.posts) {
        const ending = plan.runs.filter((r) => [r.from, r.to].some((end) => end.x === post.corner.x && end.y === post.corner.y));
        expect(ending.length).toBeGreaterThanOrEqual(2);
        expect(post.height).toBe(ending.some((r) => r.height === "back") ? "back" : "front");
      }
      expect(plan.posts.some((p) => p.height === "front")).toBe(true);
    });

    it("ends the room's wall at each jamb of every doorway, the two jambs the opening's walkable width apart", () => {
      // an opening: the cells of one room side, one after another, where another region meets it
      const sides: [EdgeSide, number, number][] = [
        ["north", 0, -1],
        ["south", 0, 1],
        ["west", -1, 0],
        ["east", 1, 0],
      ];
      let openings = 0;
      for (const region of grid.regions.filter((r) => r.kind === "room"))
        for (const r of region.cells)
          for (let cx = r.x; cx < r.x + r.w; cx++)
            for (let cy = r.y; cy < r.y + r.h; cy++)
              for (const [wallSide, dx, dy] of sides) {
                const [sx, sy] = dx ? [0, 1] : [1, 0];
                const mine = (i: number) => grid.region(cx + i * sx, cy + i * sy) === region.id;
                const beyond = (i: number) => grid.region(cx + i * sx + dx, cy + i * sy + dy);
                const open = (i: number) => mine(i) && beyond(i) !== 0 && beyond(i) !== region.id;
                const shut = (i: number) => mine(i) && beyond(i) === 0;
                if (!open(0) || open(-1)) continue;
                let n = 1;
                while (open(n)) n++;
                openings++;
                // the room side's line, and the opening's two ends along it
                const line = (dx ? cx + (dx > 0 ? 1 : 0) : cy + (dy > 0 ? 1 : 0)) * CELL;
                const from = (dx ? cy : cx) * CELL;
                const to = from + n * CELL;
                expect(runOn(plan, wallSide, line, from)).toBeUndefined();
                // where the room's side goes on past the opening, its wall ends exactly at the jamb
                const axis = dx ? "y" : "x";
                if (shut(-1)) expect(runOn(plan, wallSide, line, from - CELL)?.to[axis]).toBe(from);
                if (shut(n)) expect(runOn(plan, wallSide, line, to)?.from[axis]).toBe(to);
              }
      expect(openings).toBeGreaterThan(0);
    });

    it("faces a corridor cell's two walls across exactly the walkable width between them", () => {
      for (const region of grid.regions.filter((r) => r.kind === "corridor"))
        for (const r of region.cells)
          for (let cx = r.x; cx < r.x + r.w; cx++)
            for (let cy = r.y; cy < r.y + r.h; cy++) {
              let north = cy;
              while (grid.walkable(cx, north - 1)) north--;
              let south = cy;
              while (grid.walkable(cx, south + 1)) south++;
              let west = cx;
              while (grid.walkable(west - 1, cy)) west--;
              let east = cx;
              while (grid.walkable(east + 1, cy)) east++;
              const over = runOn(plan, "north", north * CELL, cx * CELL)!;
              const under = runOn(plan, "south", (south + 1) * CELL, cx * CELL)!;
              expect(under.from.y - over.from.y).toBe((south - north + 1) * CELL);
              const left = runOn(plan, "west", west * CELL, cy * CELL)!;
              const right = runOn(plan, "east", (east + 1) * CELL, cy * CELL)!;
              expect(right.from.x - left.from.x).toBe((east - west + 1) * CELL);
            }
    });

    it("is the same plan however the map's walls are merged", () => {
      // one wall per cell, and the cells merged column by column, against the server's rows
      const each = cells.map((key, i) => {
        const [cx, cy] = key.split(",").map(Number);
        return { entity_id: `c-${i}`, position: { x: cx * CELL, y: cy * CELL }, width: CELL, height: CELL };
      });
      const columns: WallState[] = [];
      for (let cx = 0; cx < grid.cols; cx++)
        for (let cy = 0; cy < grid.rows; cy++) {
          if (!isWall.has(`${cx},${cy}`)) continue;
          const from = cy;
          while (isWall.has(`${cx},${cy + 1}`)) cy++;
          columns.push({
            entity_id: `k-${columns.length}`,
            position: { x: cx * CELL, y: from * CELL },
            width: CELL,
            height: (cy - from + 1) * CELL,
          });
        }
      for (const merged of [each, columns]) {
        const other = wallPlan(merged, grid, THICK);
        expect(other.edges).toEqual(plan.edges);
        expect(other.runs.map(shape)).toEqual(plan.runs.map(shape));
        expect(other.posts.map(({ corner, at: place, height }) => ({ corner, at: place, height }))).toEqual(
          plan.posts.map(({ corner, at: place, height }) => ({ corner, at: place, height })),
        );
      }
    });
  });
});

describe("where a dungeon floor has ground (FS-XK2B6 §E)", () => {
  // a room 2×2 at (3, 3): its shell is the ring around it, diagonals included
  const grid = floor(8, 8, [room(1, 3, 3, 2, 2)]);

  it.each([
    ["a walkable cell", true, mid(3, 3)],
    ["a walkable cell, just inside its edge", true, { x: 3 * CELL + 1, y: 5 * CELL - 1 }],
    ["a wall cell beside it", false, mid(2, 3)],
    ["a wall cell beside it, just past the edge", false, { x: 3 * CELL - 1, y: 3 * CELL + 1 }],
    ["a wall cell on its diagonal", false, mid(5, 5)],
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
