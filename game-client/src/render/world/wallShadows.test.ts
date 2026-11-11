import { describe, expect, it } from "vitest";
import { WORLD_PX_PER_TILE, worldToScreen, type Point } from "@/render/iso";
import { BAKE } from "./bake";
import type { FloorRegion, WallState } from "@/types/gameState";
import { RegionGrid, dungeonWalls, wallPlan, type DungeonMap, type EdgeRun } from "./dungeon";
import fixture from "./dungeon.fixture.json";
import { MASONRY_WALLS, TIMBER_WALLS, planWalls, thicknessPx, wallward, type WallHeight, type WallPiece } from "./walls";
import { castOffset, castShadow, dungeonShadows, planWallShadows, wallFeet, type WallFoot } from "./wallShadows";

const T = WORLD_PX_PER_TILE;
/** How thick each material's wall stands, world px: as its sheets say. */
const TIMBER = thicknessPx(TIMBER_WALLS);
const MASONRY = thicknessPx(MASONRY_WALLS);

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
    const feet = wallFeet({ pieces, posts: [] }, TIMBER);
    const half = TIMBER / 2;
    expect(feet).toEqual([
      { min: { x: 40, y: 110 - half }, max: { x: 40 + n * T, y: 110 + half }, height: BAKE.WALL_BACK },
    ]);
  });

  it("should stand a run along world y on its drawn line, as thick as its material", () => {
    const { pieces } = planWalls([wall(100, 40, 20, 4 * T)], 1, MASONRY_WALLS);
    const half = MASONRY / 2;
    expect(wallFeet({ pieces, posts: [] }, MASONRY)).toEqual([
      { min: { x: 110 - half, y: 40 }, max: { x: 110 + half, y: 40 + 4 * T }, height: BAKE.WALL_BACK },
    ]);
  });

  it("should cast a wall 2.75 tiles long from a foot 2.75 tiles long", () => {
    const { pieces } = planWalls([wall(0, 0, 2.75 * T, 20)], 1);
    const [foot] = wallFeet({ pieces, posts: [] }, TIMBER);
    expect(foot.min.x).toBe(0);
    expect(foot.max.x).toBeCloseTo(2.75 * T, 9);
  });

  it("should give a run of two heights one foot per stretch of equal height", () => {
    const { pieces } = planWalls([wall(0, 0, 6 * T, 20)], 1);
    // tiles 0-1 full height, 2-4 cut away, 5 full height again
    const heights: WallHeight[] = ["back", "back", "front", "front", "front", "back"];
    const mixed: WallPiece[] = pieces.map((p, k) => ({ ...p, height: heights[k] }));
    const feet = wallFeet({ pieces: mixed, posts: [] }, TIMBER);
    expect(feet.map((f) => [f.min.x, f.max.x, f.height])).toEqual([
      [0, 2 * T, BAKE.WALL_BACK],
      [2 * T, 5 * T, BAKE.WALL_FRONT],
      [5 * T, 6 * T, BAKE.WALL_BACK],
    ]);
  });

  it("should not join pieces across a gap, nor pieces of two lines", () => {
    // a south wall with a door gap, and a second wall one tile south of it
    const { pieces } = planWalls([wall(0, 0, 2 * T, 20), wall(4 * T, 0, 2 * T, 20), wall(0, T, 6 * T, 20)], 1);
    const feet = wallFeet({ pieces, posts: [] }, TIMBER);
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
    const [was] = wallFeet({ pieces, posts: [] }, TIMBER);
    const [now] = wallFeet({ pieces: moved, posts: [] }, TIMBER);
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
    const feet = wallFeet({ pieces: [], posts: plan.posts }, TIMBER);
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
    const shapes = planWallShadows(plan, TIMBER);
    expect(shapes).toHaveLength(1 + plan.posts.length);
    expect(shapes.map(corners)).toEqual(wallFeet(plan, TIMBER).map((f) => corners(castShadow(f))));
    const run = shapes[0];
    const half = TIMBER / 2;
    expect(Math.max(...run.map((p) => p.x)) - (40 + 3 * T)).toBeCloseTo(50.9, 1);
    expect(110 - half - Math.min(...run.map((p) => p.y))).toBeCloseTo(50.9, 1);
  });

  describe("on a dungeon floor (wallPlan, dungeonWalls: FS-XK2B6)", () => {
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
    const THICK = MASONRY;
    const plan = wallPlan(walls, grid, THICK);
    const drawn = dungeonWalls(plan, grid, 1, MASONRY_WALLS);
    const feet = wallFeet(drawn, MASONRY);

    /**
     * A run's foot (FS-XK2B6 §I.27): the strip from its edge line to one thickness on its wall
     * cells' side, between its two ends, as tall as the run is drawn.
     */
    const stripOf = (run: EdgeRun): WallFoot => {
      const across = run.axis === "x" ? "y" : "x";
      const line = run.from[across];
      const [a, b] = wallward(run.wallSide) > 0 ? [line, line + run.thickness] : [line - run.thickness, line];
      const height = run.height === "back" ? BAKE.WALL_BACK : BAKE.WALL_FRONT;
      return run.axis === "x"
        ? { min: { x: run.from.x, y: a }, max: { x: run.to.x, y: b }, height }
        : { min: { x: a, y: run.from.y }, max: { x: b, y: run.to.y }, height };
    };
    /** A foot, rounded, so two feet of one rect compare equal. */
    const key = (f: WallFoot) => [f.min.x, f.min.y, f.max.x, f.max.y].map((v) => v.toFixed(6)).join(",") + `@${f.height}`;

    it("should cast one shape per edge run and one per post, whatever the pieces", () => {
      // the room's four sides, each one run of one height, and a post at each corner
      expect(plan.runs).toHaveLength(4);
      expect(plan.posts).toHaveLength(4);
      expect(drawn.pieces).toHaveLength(4 * 4 * 2);
      expect(runsOf(feet)).toHaveLength(4);
      expect(planWallShadows(drawn, MASONRY)).toHaveLength(8);
    });

    it("should stand each run's foot on its edge, one thickness into its wall cells, from end to end", () => {
      const [lo, hi] = [2 * CELL, 6 * CELL];
      expect(runsOf(feet).map(key).sort()).toEqual(
        [
          // the north side, full height: its masonry north of the room's north edge
          { min: { x: lo, y: lo - THICK }, max: { x: hi, y: lo }, height: BAKE.WALL_BACK },
          // the west side, full height
          { min: { x: lo - THICK, y: lo }, max: { x: lo, y: hi }, height: BAKE.WALL_BACK },
          // the south and east sides, cut away: their masonry south and east of the room's edges
          { min: { x: lo, y: hi }, max: { x: hi, y: hi + THICK }, height: BAKE.WALL_FRONT },
          { min: { x: hi, y: lo }, max: { x: hi + THICK, y: hi }, height: BAKE.WALL_FRONT },
        ]
          .map(key)
          .sort(),
      );
    });

    it("should cast each post from the square where its walls' thicknesses cross, by its own height", () => {
      const half = (BAKE.POST_FOOT * T) / 2;
      const posts = feet.filter((f) => !runsOf(feet).includes(f));
      expect(posts.map(key).sort()).toEqual(
        plan.posts
          .map((p) => ({
            min: { x: p.at.x - half, y: p.at.y - half },
            max: { x: p.at.x + half, y: p.at.y + half },
            height: p.height === "back" ? BAKE.WALL_BACK : BAKE.WALL_FRONT,
          }))
          .map(key)
          .sort(),
      );
      // the masonry post's foot is exactly where its two walls' feet cross
      expect(BAKE.POST_FOOT * T).toBeCloseTo(MASONRY, 9);
    });

    describe("the sample floor (dungeon.fixture.json)", () => {
      const sample = fixture as unknown as DungeonMap & { walls: WallState[] };
      const floor = new RegionGrid(sample);
      const samplePlan = wallPlan(sample.walls, floor, THICK);
      const sampleDrawn = dungeonWalls(samplePlan, floor, 7, MASONRY_WALLS);
      const sampleFeet = wallFeet(sampleDrawn, MASONRY);

      it("should give every edge run exactly one foot, its strip, and every post one", () => {
        expect(runsOf(sampleFeet).map(key).sort()).toEqual(samplePlan.runs.map(stripOf).map(key).sort());
        expect(sampleFeet).toHaveLength(samplePlan.runs.length + samplePlan.posts.length);
      });
    });
  });
});

describe("a dungeon floor's wall shadows, cut to its ground (FS-V8FT3 §E R23)", () => {
  const CELL = 80;
  const sample = fixture as unknown as DungeonMap & { walls: WallState[] };
  const floor = new RegionGrid(sample);
  const plan = wallPlan(sample.walls, floor, MASONRY);
  const drawn = dungeonWalls(plan, floor, 7, MASONRY_WALLS);
  const shadows = dungeonShadows(drawn, MASONRY, floor);

  /** Whether a point lies inside a convex polygon (on its outline counts). */
  const inside = (shape: readonly Point[], p: Point) => {
    let sign = 0;
    for (let i = 0; i < shape.length; i++) {
      const a = shape[i];
      const b = shape[(i + 1) % shape.length];
      const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      if (Math.abs(cross) < 1e-9) continue;
      if (sign === 0) sign = Math.sign(cross);
      else if (Math.sign(cross) !== sign) return false;
    }
    return true;
  };
  /** Whether a point lies strictly inside a rect. */
  const within = (r: { x: number; y: number; width: number; height: number }, p: Point) =>
    p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height;
  /** Points every 4 px over a shape's bounds that lie in it, off the cell lines. */
  const samples = (shape: readonly Point[]) => {
    const xs = shape.map((p) => p.x);
    const ys = shape.map((p) => p.y);
    const out: Point[] = [];
    for (let x = Math.floor(Math.min(...xs)) + 0.5; x < Math.max(...xs); x += 4)
      for (let y = Math.floor(Math.min(...ys)) + 0.5; y < Math.max(...ys); y += 4) if (inside(shape, { x, y })) out.push({ x, y });
    return out;
  };

  it("should cast every run and post of the plan, one shape each", () => {
    expect(shadows.shapes).toEqual(planWallShadows(drawn, MASONRY));
    expect(shadows.shapes).toHaveLength(plan.runs.length + plan.posts.length);
  });

  it("should cut every point a shadow covers on a wall cell or the void, so a shadow shows only on walkable cells", () => {
    const uncut: string[] = [];
    let covered = 0;
    for (const shape of shadows.shapes)
      for (const p of samples(shape)) {
        const { cx, cy } = floor.cellOf(p);
        if (floor.walkable(cx, cy)) covered++;
        else if (!shadows.cuts.some((r) => within(r, p))) uncut.push(`${cx},${cy}`);
      }
    expect(uncut).toEqual([]);
    // and the floor keeps shadow to show: the west and south walls' fall on it
    expect(covered).toBeGreaterThan(1000);
  });

  it("should leave every walkable cell whole: no cut reaches into one", () => {
    const into: string[] = [];
    for (const r of shadows.cuts) {
      // a cut is whole cells: each cell it covers is a wall cell or the void
      expect(r.x % CELL).toBe(0);
      expect(r.y % CELL).toBe(0);
      for (let x = r.x; x < r.x + r.width; x += CELL)
        for (let y = r.y; y < r.y + r.height; y += CELL) {
          const { cx, cy } = floor.cellOf({ x: x + 1, y: y + 1 });
          if (floor.walkable(cx, cy)) into.push(`${cx},${cy}`);
        }
    }
    expect(into).toEqual([]);
  });

  it("should leave a room's north and east walls nothing to show in front of them: their shadows fall on their own wall cells", () => {
    // the hand-made room of 4 × 4 cells: its north wall's shape lies wholly north of the room's edge
    const room: FloorRegion = { id: 1, kind: "room", cells: [{ x: 2, y: 2, w: 4, h: 4 }] };
    const grid = new RegionGrid({ width: 10 * CELL, height: 10 * CELL, cell_size: CELL, regions: [room] });
    const walls = [
      wall(1 * CELL, 1 * CELL, 6 * CELL, CELL),
      wall(1 * CELL, 2 * CELL, CELL, 4 * CELL),
      wall(6 * CELL, 2 * CELL, CELL, 4 * CELL),
      wall(1 * CELL, 6 * CELL, 6 * CELL, CELL),
    ];
    const one = dungeonWalls(wallPlan(walls, grid, MASONRY), grid, 1, MASONRY_WALLS);
    const { shapes, cuts } = dungeonShadows(one, MASONRY, grid);
    const shown = (shape: readonly Point[]) =>
      samples(shape).filter((p) => !cuts.some((r) => within(r, p)));
    const [north, east] = [
      wallFeet({ pieces: one.pieces.filter((p) => p.axis === "x" && p.at.y < 2 * CELL), posts: [] }, MASONRY),
      wallFeet({ pieces: one.pieces.filter((p) => p.axis === "y" && p.at.x > 6 * CELL), posts: [] }, MASONRY),
    ].map(([f]) => castShadow(f));
    expect(shapes.map(corners)).toEqual(expect.arrayContaining([corners(north), corners(east)]));
    expect(shown(north)).toEqual([]);
    expect(shown(east)).toEqual([]);
    // the west wall's long shadow lies across the room's floor
    const [west] = wallFeet({ pieces: one.pieces.filter((p) => p.axis === "y" && p.at.x < 2 * CELL), posts: [] }, MASONRY);
    expect(shown(castShadow(west)).length).toBeGreaterThan(100);
  });
});
