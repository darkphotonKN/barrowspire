import { describe, expect, it } from "vitest";
import { WORLD_PX_PER_TILE, worldToScreen, type Point } from "@/render/iso";
import { BAKE } from "./bake";
import type { FloorRegion, WallState } from "@/types/gameState";
import { RegionGrid, wallRule, wallRuns } from "./dungeon";
import { MASONRY_WALLS, TIMBER_WALLS, planWalls, type WallHeight, type WallPiece } from "./walls";
import { castOffset, castShadow, planWallShadows, wallFeet, type WallFoot } from "./wallShadows";

const T = WORLD_PX_PER_TILE;

/** A polygon's corners in a fixed order, rounded, so two outlines of one shape compare equal. */
const corners = (shape: readonly Point[]) =>
  shape
    .map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`)
    .sort()
    .join(" ");

/** Twice a polygon's signed area (shoelace). */
const area2 = (shape: readonly Point[]) =>
  shape.reduce((sum, p, i) => {
    const q = shape[(i + 1) % shape.length];
    return sum + p.x * q.y - q.x * p.y;
  }, 0);

describe("a wall's cast offset (FS-V8FT3 §C R11)", () => {
  it.each([
    ["a full-height (back) wall", BAKE.WALL_BACK, 50.9, 81.4],
    ["a cut-away (front) wall", BAKE.WALL_FRONT, 15.5, 24.9],
  ] as const)("%s casts h / 2.83 tiles along world +x and world -y", (_name, h, worldPx, screenPx) => {
    const off = castOffset(h);
    expect(off.x).toBeCloseTo(worldPx, 1);
    expect(off.y).toBeCloseTo(-worldPx, 1);
    // due screen-right: the way every baked prop's shadow falls
    const origin = worldToScreen(0, 0);
    const tip = worldToScreen(off.x, off.y);
    expect(tip.x - origin.x).toBeCloseTo(screenPx, 1);
    expect(tip.y - origin.y).toBeCloseTo(0, 6);
  });

  it("should follow the bake's light: the ground offset of a point h up, by BAKE.KEY_LIGHT", () => {
    const [lx, ly, lz] = BAKE.KEY_LIGHT;
    expect(castOffset(2)).toEqual({ x: ((2 * -lx) / ly) * T, y: ((2 * -lz) / ly) * T });
  });
});

describe("the shadow a foot casts (FS-V8FT3 §D R15)", () => {
  // a wall along world x, three tiles long and 8 px thick, full height
  const foot: WallFoot = { min: { x: 100, y: 196 }, max: { x: 220, y: 204 }, height: BAKE.WALL_BACK };

  it("should be the convex hull of the foot and the foot moved by the offset for its height", () => {
    const d = castOffset(BAKE.WALL_BACK);
    // the light throws toward +x and -y: the foot's north-east corner and its moved south-west
    // corner fall inside, the other six are the outline
    expect(corners(castShadow(foot))).toBe(
      corners([
        { x: 100, y: 204 },
        { x: 220, y: 204 },
        { x: 220 + d.x, y: 204 + d.y },
        { x: 220 + d.x, y: 196 + d.y },
        { x: 100 + d.x, y: 196 + d.y },
        { x: 100, y: 196 },
      ]),
    );
  });

  it("should be one closed outline, covering the foot and the ground the foot is swept over", () => {
    const d = castOffset(BAKE.WALL_BACK);
    const shape = castShadow(foot);
    // a rect w × t swept by (dx, dy) covers w·t + w·|dy| + t·|dx|
    expect(Math.abs(area2(shape)) / 2).toBeCloseTo(120 * 8 + 120 * Math.abs(d.y) + 8 * Math.abs(d.x), 6);
  });

  it("should be the foot itself for a wall of no height", () => {
    expect(corners(castShadow({ ...foot, height: 0 }))).toBe(
      corners([
        { x: 100, y: 196 },
        { x: 220, y: 196 },
        { x: 220, y: 204 },
        { x: 100, y: 204 },
      ]),
    );
  });
});

const wall = (x: number, y: number, width: number, height: number, house_id?: string): WallState => ({
  entity_id: `${house_id}:${x},${y},${width},${height}`,
  house_id,
  position: { x, y },
  width,
  height,
});

/** Only a plan's wall feet: those longer than a post's square. */
const runsOf = (feet: readonly WallFoot[]) =>
  feet.filter((f) => Math.max(f.max.x - f.min.x, f.max.y - f.min.y) > BAKE.POST_FOOT * T + 1e-6);

describe("the feet of a wall's pieces (FS-V8FT3 §C R13, §D R15, R17)", () => {
  it.each([1, 3, 12])("should give a run of %i pieces of one height one foot", (n) => {
    // a wall of no house along world x, 20 thick: its pieces stand on y = 110
    const { pieces } = planWalls([wall(40, 100, n * T, 20)], 1);
    expect(pieces).toHaveLength(n);
    const feet = wallFeet({ pieces, posts: [] }, "timber");
    const half = (BAKE.WALL_FOOT.timber * T) / 2;
    expect(feet).toEqual([
      { min: { x: 40, y: 110 - half }, max: { x: 40 + n * T, y: 110 + half }, height: BAKE.WALL_BACK },
    ]);
  });

  it("should stand a run along world y on its drawn line, as thick as its material", () => {
    const { pieces } = planWalls([wall(100, 40, 20, 4 * T)], 1, MASONRY_WALLS);
    const half = (BAKE.WALL_FOOT.masonry * T) / 2;
    expect(wallFeet({ pieces, posts: [] }, "masonry")).toEqual([
      { min: { x: 110 - half, y: 40 }, max: { x: 110 + half, y: 40 + 4 * T }, height: BAKE.WALL_BACK },
    ]);
  });

  it("should cast a wall 2.75 tiles long from a foot 2.75 tiles long", () => {
    const { pieces } = planWalls([wall(0, 0, 2.75 * T, 20)], 1);
    const [foot] = wallFeet({ pieces, posts: [] }, "timber");
    expect(foot.min.x).toBe(0);
    expect(foot.max.x).toBeCloseTo(2.75 * T, 9);
  });

  it("should give a run of two heights one foot per stretch of equal height", () => {
    const { pieces } = planWalls([wall(0, 0, 6 * T, 20)], 1);
    // tiles 0-1 full height, 2-4 cut away, 5 full height again
    const heights: WallHeight[] = ["back", "back", "front", "front", "front", "back"];
    const mixed: WallPiece[] = pieces.map((p, k) => ({ ...p, height: heights[k] }));
    const feet = wallFeet({ pieces: mixed, posts: [] }, "timber");
    expect(feet.map((f) => [f.min.x, f.max.x, f.height])).toEqual([
      [0, 2 * T, BAKE.WALL_BACK],
      [2 * T, 5 * T, BAKE.WALL_FRONT],
      [5 * T, 6 * T, BAKE.WALL_BACK],
    ]);
  });

  it("should not join pieces across a gap, nor pieces of two lines", () => {
    // a south wall with a door gap, and a second wall one tile south of it
    const { pieces } = planWalls([wall(0, 0, 2 * T, 20), wall(4 * T, 0, 2 * T, 20), wall(0, T, 6 * T, 20)], 1);
    const feet = wallFeet({ pieces, posts: [] }, "timber");
    expect(feet.map((f) => [f.min.x, f.max.x, (f.min.y + f.max.y) / 2])).toEqual([
      [0, 2 * T, 10],
      [4 * T, 6 * T, 10],
      [0, 6 * T, T + 10],
    ]);
  });

  it("should follow the pieces wherever they are drawn, not the wall rect they were cut from", () => {
    const { pieces } = planWalls([wall(40, 100, 3 * T, 20)], 1);
    // the same run drawn 17 px south and 9 px east of the rect's centreline
    const moved = pieces.map((p) => ({ ...p, at: { x: p.at.x + 9, y: p.at.y + 17 } }));
    const [was] = wallFeet({ pieces, posts: [] }, "timber");
    const [now] = wallFeet({ pieces: moved, posts: [] }, "timber");
    expect(now.min).toEqual({ x: was.min.x + 9, y: was.min.y + 17 });
    expect(now.max).toEqual({ x: was.max.x + 9, y: was.max.y + 17 });
  });
});

describe("the feet of a wall's posts (FS-V8FT3 §D R16)", () => {
  it("should give every post of planWalls one square foot of its own height", () => {
    // a house: north and west full height, south and east cut away
    const plan = planWalls(
      [wall(0, 0, 200, 20, "h"), wall(0, 0, 20, 200, "h"), wall(180, 0, 20, 200, "h"), wall(0, 180, 200, 20, "h")],
      1,
    );
    expect(plan.posts).toHaveLength(4);
    const feet = wallFeet({ pieces: [], posts: plan.posts }, "timber");
    const half = (BAKE.POST_FOOT * T) / 2;
    expect(feet).toEqual(
      plan.posts.map((p) => ({
        min: { x: p.at.x - half, y: p.at.y - half },
        max: { x: p.at.x + half, y: p.at.y + half },
        height: p.height === "back" ? BAKE.WALL_BACK : BAKE.WALL_FRONT,
      })),
    );
    expect(new Set(feet.map((f) => f.height))).toEqual(new Set([BAKE.WALL_BACK, BAKE.WALL_FRONT]));
  });
});

describe("a plan's wall shadows (FS-V8FT3 §D)", () => {
  it("should cast one hull per run of a three-piece back wall, 50.9 px along +x and -y, and one per post", () => {
    const plan = planWalls([wall(40, 100, 3 * T, 20)], 1, TIMBER_WALLS);
    const shapes = planWallShadows(plan, "timber");
    expect(shapes).toHaveLength(1 + plan.posts.length);
    expect(shapes.map(corners)).toEqual(wallFeet(plan, "timber").map((f) => corners(castShadow(f))));
    const run = shapes[0];
    const half = (BAKE.WALL_FOOT.timber * T) / 2;
    expect(Math.max(...run.map((p) => p.x)) - (40 + 3 * T)).toBeCloseTo(50.9, 1);
    expect(110 - half - Math.min(...run.map((p) => p.y))).toBeCloseTo(50.9, 1);
  });

  describe("on a dungeon floor (wallRuns, wallRule)", () => {
    const CELL = 80;
    const room: FloorRegion = { id: 1, kind: "room", cells: [{ x: 2, y: 2, w: 4, h: 4 }] };
    const grid = new RegionGrid({ width: 10 * CELL, height: 10 * CELL, cell_size: CELL, regions: [room] });
    // the room's shell as the server merges it: its north and south rows whole, its sides between
    const walls = [
      wall(1 * CELL, 1 * CELL, 6 * CELL, CELL),
      wall(1 * CELL, 2 * CELL, CELL, 4 * CELL),
      wall(6 * CELL, 2 * CELL, CELL, 4 * CELL),
      wall(1 * CELL, 6 * CELL, 6 * CELL, CELL),
    ];
    const plan = planWalls(wallRuns(walls, grid), 1, MASONRY_WALLS, wallRule(grid));
    const feet = wallFeet(plan, "masonry");

    const half = (BAKE.WALL_FOOT.masonry * T) / 2;
    /** The wall feet standing on one line (`axis` is the line's fixed coordinate), in order along it. */
    const onLine = (axis: "x" | "y", line: number) => {
      const along = axis === "x" ? "y" : "x";
      return runsOf(feet)
        .filter((f) => Math.abs(f.min[axis] + half - line) < 1e-6 && Math.abs(f.max[axis] - half - line) < 1e-6)
        .map((f) => [f.min[along], f.max[along], f.height])
        .sort((a, b) => a[0] - b[0]);
    };
    // the corner posts stand at the centres of cells 1 and 6
    const [lo, hi] = [1.5 * CELL, 6.5 * CELL];

    it("should cast one shape per post and per stretch of a side, whatever the pieces", () => {
      expect(plan.posts).toHaveLength(4);
      expect(plan.pieces.length).toBeGreaterThan(30);
      // four sides; the south and the east side each change height once
      expect(runsOf(feet)).toHaveLength(6);
      expect(planWallShadows(plan, "masonry")).toHaveLength(10);
    });

    it("should cast a full-height side as one foot from corner post to corner post, and no further", () => {
      expect(onLine("y", lo)).toEqual([[lo, hi, BAKE.WALL_BACK]]);
      expect(onLine("x", lo)).toEqual([[lo, hi, BAKE.WALL_BACK]]);
    });

    it("should cast a cut-away side by its pieces' own heights, between its posts", () => {
      // the part of the run in the south-west (north-east) corner's cell stands full height (wallRule)
      const stretches = [
        [lo, 2 * CELL, BAKE.WALL_BACK],
        [2 * CELL, hi, BAKE.WALL_FRONT],
      ];
      expect(onLine("y", hi)).toEqual(stretches);
      expect(onLine("x", hi)).toEqual(stretches);
    });

    it("should cast nothing from a piece outside its run's end posts", () => {
      for (const f of runsOf(feet)) {
        expect(Math.min(f.min.x, f.min.y)).toBeGreaterThanOrEqual(lo - half - 1e-6);
        expect(Math.max(f.max.x, f.max.y)).toBeLessThanOrEqual(hi + half + 1e-6);
      }
    });
  });
});
