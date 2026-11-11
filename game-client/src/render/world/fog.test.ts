import { describe, expect, it } from "vitest";
import type { FloorRegion, WallState } from "@/types/gameState";
import { screenToWorld, worldToScreen, type Point } from "@/render/iso/projection";
import { ChunkGrid, ChunkVisibility } from "./chunks";
import { RegionGrid, dungeonWalls, edgeHeight, wallPlan, type EdgeSide, type WallPlan } from "./dungeon";
import { Exploration, type ExplorationState } from "./exploration";
import { FOG, Fog, fogShapes, wallLayout, type FogHeights, type FogShape, type FogTweenConfig } from "./fog";
import { FEATHER, fogField } from "./fogField";
import { MASONRY_WALLS, thicknessPx } from "./walls";
import fixture from "./dungeon.fixture.json";
import { mix, palette } from "@/utils/canvasPalette";
import { TINT_IDENTITY } from "@/utils/theme";

const CELL = 80;
const HEIGHTS = { back: 141, front: 43 };
/** The tower's masonry, as a dungeon floor draws it: its thickness and half of it, world px. */
const THICK = thicknessPx(MASONRY_WALLS);
const HALF = THICK / 2;

const floor = (cols: number, rows: number, regions: FloorRegion[]) =>
  new RegionGrid({ width: cols * CELL, height: rows * CELL, cell_size: CELL, regions });
const region = (kind: FloorRegion["kind"]) => (id: number, x: number, y: number, w: number, h: number): FloorRegion => ({
  id,
  kind,
  cells: [{ x, y, w, h }],
});
const room = region("room");
const corridor = region("corridor");

/** Whether a cell is a shell cell: not walkable, and 8-adjacent to a walkable one (FS-KE075 R7). */
const isShell = (grid: RegionGrid, cx: number, cy: number) =>
  !grid.walkable(cx, cy) &&
  [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => grid.walkable(cx + dx, cy + dy)));

/**
 * A floor's walls as the server lays them (levelgen `mergeWalls`): the shell's cells, each row cut
 * into runs, a run the same as the one above it carried on down.
 */
function shellWalls(grid: RegionGrid): WallState[] {
  const shell = (cx: number, cy: number) => isShell(grid, cx, cy);
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  let open: { x: number; y: number; w: number; h: number }[] = [];
  for (let cy = 0; cy <= grid.rows; cy++) {
    const runs: { x: number; w: number }[] = [];
    for (let cx = 0; cy < grid.rows && cx < grid.cols; cx++) {
      if (!shell(cx, cy)) continue;
      const x = cx;
      while (cx < grid.cols && shell(cx, cy)) cx++;
      runs.push({ x, w: cx - x });
    }
    const next: typeof open = [];
    for (const r of runs) {
      const same = open.find((o) => o.x === r.x && o.w === r.w);
      if (same) {
        same.h++;
        next.push(same);
      } else next.push({ x: r.x, y: cy, w: r.w, h: 1 });
    }
    for (const o of open) if (!next.includes(o)) rects.push(o);
    open = next;
  }
  return rects.map((r, i) => ({
    entity_id: `w-${i}`,
    position: { x: r.x * CELL, y: r.y * CELL },
    width: r.w * CELL,
    height: r.h * CELL,
  }));
}

/** The fixture floor's walls, as the server sends them. */
const fixtureWalls = (): WallState[] => (fixture as { walls: WallState[] }).walls;

/** A floor's wall plan (FS-XK2B6 §A), in the tower's masonry. */
const planOf = (grid: RegionGrid, walls: readonly WallState[] = shellWalls(grid)): WallPlan => wallPlan(walls, grid, THICK);

/** The fog over a floor whose walls are its shell's, as the server lays them. */
const fogOf = (grid: RegionGrid, state: (id: number) => ExplorationState, walls = shellWalls(grid), heights: FogHeights = HEIGHTS) =>
  fogShapes(grid, state, heights, wallLayout(grid, planOf(grid, walls)));

/** World point (x, y) on screen, raised by `up` px. */
const lifted = (x: number, y: number, up = 0) => {
  const s = worldToScreen(x, y);
  return { x: s.x, y: s.y - up };
};

/** The middle of cell (cx, cy), world px. */
const mid = (cx: number, cy: number) => ({ x: (cx + 0.5) * CELL, y: (cy + 0.5) * CELL });
/** The middle of cell (cx, cy) on screen, raised by `up` px. */
const onScreen = (cx: number, cy: number, up = 0) => {
  const s = worldToScreen(mid(cx, cy).x, mid(cx, cy).y);
  return { x: s.x, y: s.y - up };
};

/** Whether `p` lies inside the polygon (even-odd). */
function inside(p: Point, poly: readonly Point[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** Whether `p` lies on one of the polygon's sides. */
function onEdge(p: Point, poly: readonly Point[]): boolean {
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j];
    const b = poly[i];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    const within = Math.min(a.x, b.x) - 1e-6 <= p.x && p.x <= Math.max(a.x, b.x) + 1e-6 && Math.min(a.y, b.y) - 1e-6 <= p.y && p.y <= Math.max(a.y, b.y) + 1e-6;
    if (within && Math.abs(cross) <= 1e-6 * Math.hypot(b.x - a.x, b.y - a.y)) return true;
  }
  return false;
}

/** The fog over a screen point: the veil of every shape covering it, the drawn walls' clear columns left out. */
const fogAt = (shapes: readonly FogShape[], p: Point) => shapes.filter((s) => s.alpha > 0 && inside(p, s.points)).map((s) => s.alpha);
/** Every shape of the partition over a screen point, clear wall columns too. */
const partsAt = (shapes: readonly FogShape[], p: Point) => shapes.filter((s) => inside(p, s.points));

const DARK = FOG.unexplored.alpha;
const DIM = FOG.explored.alpha;

/** Region states from a table, unexplored for any other. */
const states = (table: Record<number, ExplorationState>) => (id: number) => table[id] ?? "unexplored";

// room A (1) over 1–4 × 1–4, a corridor (2) over 5–10 × 2–3, room B (3) over 11–14 × 1–4
const A = 1;
const C = 2;
const B = 3;
const walk = () => floor(17, 7, [room(A, 1, 1, 4, 4), corridor(C, 5, 2, 6, 2), room(B, 11, 1, 4, 4)]);
/** Where a piece of room B's north wall stands: on row 0's south edge, half a thickness into its wall cell. */
const NORTH_OF_B = { x: 12.25 * CELL, y: CELL - HALF };

describe("the fog over each region (FS-SRA9J §C.8–§C.10)", () => {
  it("lays the dense veil over an unexplored region, the lighter one over an explored one, and none over a visible one", () => {
    const grid = walk();
    const shapes = fogOf(grid, states({ [A]: "explored", [C]: "visible" }));
    expect(fogAt(shapes, onScreen(2, 3))).toEqual([DIM]);
    expect(fogAt(shapes, onScreen(7, 2))).toEqual([]);
    expect(fogAt(shapes, onScreen(13, 3))).toEqual([DARK]);
  });

  it("veils the whole floor before anyone is seen", () => {
    const grid = walk();
    const shapes = fogOf(grid, states({}));
    // cell middles no wall stands in front of: a low wall on a region's south or east edge covers
    // its floor up to about 54 px in, and a corner post the middles on its screen column above it
    // (FS-XK2B6 ruling E2)
    for (const [cx, cy] of [[2, 2], [3, 3], [7, 2], [12, 1], [13, 3]]) expect(fogAt(shapes, onScreen(cx, cy))).toEqual([DARK]);
  });

  it("veils an unexplored region densely but not opaquely, darker than an explored one, the void opaque (owner playtest 2026-11-06)", () => {
    expect(DARK).toBeGreaterThan(DIM);
    expect(DARK).toBeLessThan(1);
    const shapes = fogOf(walk(), states({}));
    // off the floor, past its west edge
    expect(fogAt(shapes, onScreen(-3, 3))).toEqual([FOG.void]);
    expect(FOG.void).toBe(1);
  });

  it("never covers a screen point twice, so the explored dim never compounds", () => {
    const grid = new RegionGrid(fixture as never);
    // a scatter of states over the fixture's regions
    const state = (id: number): ExplorationState => (["unexplored", "explored", "visible"] as const)[id % 3];
    const shapes = fogOf(grid, state, fixtureWalls());
    let covered = 0;
    for (let x = -3000; x < 6000; x += 37)
      for (let y = -200; y < 4800; y += 23) {
        const n = partsAt(shapes, { x: x + 0.5, y: y + 0.5 }).length;
        expect(n).toBeLessThanOrEqual(1);
        covered += n;
      }
    expect(covered).toBeGreaterThan(0);
  });
});

describe("the fog and what stands up (FS-SRA9J §C.11, §C.13)", () => {
  // room A (1) over rows 1–3, a one-cell wall on row 4, a corridor (2) over rows 5–6: the wall
  // borders both
  const split = () => floor(10, 9, [room(A, 1, 1, 6, 3), corridor(C, 1, 5, 6, 2)]);

  it("leaves a wall cell bordering a visible region clear, both its walls, whatever is behind them (FS-XK2B6 §F.19)", () => {
    const grid = split();
    const shapes = fogOf(grid, states({ [C]: "visible" }));
    // the wall cell on row 4 shows an edge to the room (its north side) and one to the corridor
    // (its south side), both low (walkable on both sides): the middle of each face is clear
    for (const y of [4 * CELL + HALF, 5 * CELL - HALF]) expect(fogAt(shapes, lifted(3.5 * CELL, y, HEIGHTS.front / 2))).toEqual([]);
    // and the room behind it is veiled
    expect(fogAt(shapes, onScreen(3, 2))).toEqual([DARK]);
  });

  it("draws an unexplored region's walls, standing clear of the veil behind them, to be tinted as dark (owner playtest 2026-11-06)", () => {
    const grid = walk();
    const shapes = fogOf(grid, states({}));
    // room B's north wall, on row 0's south edge, full height: clear over its face, feathering as
    // the veil it is tinted to
    const face = lifted(12.5 * CELL, CELL - HALF, HEIGHTS.back / 2);
    expect(fogAt(shapes, face)).toEqual([]);
    expect(partsAt(shapes, face).map((s) => s.equiv)).toEqual([DARK]);
  });

  it("leaves a visible region's back wall clear over its full height", () => {
    const grid = walk();
    const shapes = fogOf(grid, states({ [B]: "visible" }));
    // room B's north wall, on row 0's south edge, is full height
    expect(fogAt(shapes, lifted(12.5 * CELL, CELL - HALF, HEIGHTS.back - 10))).toEqual([]);
  });

  it("never covers a member's head where they stand by the region behind them", () => {
    const grid = walk();
    const shapes = fogOf(grid, states({ [C]: "visible" }));
    // a member at the corridor's mouth (5, 2): room A, unexplored, lies behind them on screen
    for (const up of [20, 50, 80, FOG.stand - 4])
      for (const dx of [-12, 12]) {
        const head = onScreen(5, 2, up);
        expect(fogAt(shapes, { x: head.x + dx, y: head.y })).toEqual([]);
      }
  });
});

describe("the fog over what lies behind a visible region (FS-SRA9J §C.8, §C.13)", () => {
  // what a delver is (§C.18): the server's PlayerRadius, and the head clearance the fog keeps over
  // their feet, either side of them
  const RADIUS = 20;
  const HEAD = FOG.stand;
  const GIRTH = FOG.girth;

  /**
   * Each drawn wall piece and post on screen (FS-XK2B6 §A, as I-XK2B6-2 draws them): a piece's
   * centreline from end to end, raised to its height and a few px for its top (FS-SRA9J §C.13,
   * `FOG.headroom`); a post's cap, 0.3 tile square (9.6 px either
   * side of it on screen), from its foot to its top. Every wall bordering a region is drawn,
   * whatever its state (owner playtest 2026-11-06). A post stands at a cell corner, on the same
   * screen column as the cells' middles above it, so it stands in front of floor there.
   */
  function drawnSlabs(grid: RegionGrid, walls: readonly WallState[], heights: FogHeights) {
    const { pieces, posts } = dungeonWalls(planOf(grid, walls), grid, 1, MASONRY_WALLS);
    const CAP = 9.6;
    return [
      ...pieces.map((p) => {
        const h = heights[p.height] + FOG.headroom;
        const half = CELL / 4;
        const [a, b] = (p.axis === "x" ? [[p.at.x - half, p.at.y], [p.at.x + half, p.at.y]] : [[p.at.x, p.at.y - half], [p.at.x, p.at.y + half]]).map(([x, y]) =>
          worldToScreen(x, y),
        );
        return [a, b, { x: b.x, y: b.y - h }, { x: a.x, y: a.y - h }];
      }),
      ...posts.map((post) => {
        const foot = worldToScreen(post.at.x, post.at.y);
        const top = foot.y - heights[post.height] - FOG.post;
        return [{ x: foot.x - CAP, y: foot.y }, { x: foot.x + CAP, y: foot.y }, { x: foot.x + CAP, y: top }, { x: foot.x - CAP, y: top }];
      }),
    ];
  }

  /** Every place a member's feet can be in a region, on screen: RADIUS world px off any closed cell. */
  function feetIn(grid: RegionGrid, region: FloorRegion): Point[] {
    const feet: Point[] = [];
    const off = (x: number, y: number) => {
      const cx = Math.floor(x / CELL);
      const cy = Math.floor(y / CELL);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (grid.walkable(cx + dx, cy + dy)) continue;
          const nx = Math.max((cx + dx) * CELL, Math.min(x, (cx + dx + 1) * CELL));
          const ny = Math.max((cy + dy) * CELL, Math.min(y, (cy + dy + 1) * CELL));
          if (Math.hypot(x - nx, y - ny) < RADIUS) return false;
        }
      return true;
    };
    for (const r of region.cells)
      for (let x = r.x * CELL; x <= (r.x + r.w) * CELL; x += 4)
        for (let y = r.y * CELL; y <= (r.y + r.h) * CELL; y += 4) if (off(x, y)) feet.push(worldToScreen(x, y));
    return feet;
  }

  it("leaves no unexplored floor in sight: each cell's middle is fogged, behind a drawn wall, or under a member's head", () => {
    const grid = new RegionGrid(fixture as never);
    const walls = fixtureWalls();
    const tally = { fog: 0, wall: 0, head: 0 };
    const leaks: string[] = [];
    for (const seen of grid.regions) {
      const state = (id: number): ExplorationState => (id === seen.id ? "visible" : "unexplored");
      const shapes = fogOf(grid, state, walls);
      const slabs = drawnSlabs(grid, walls, HEIGHTS);
      const feet = feetIn(grid, seen);
      for (let cy = 0; cy < grid.rows; cy++)
        for (let cx = 0; cx < grid.cols; cx++) {
          const id = grid.region(cx, cy);
          if (!id || id === seen.id) continue;
          // the middle of its floor, nudged off the seam between two strips
          const p = worldToScreen((cx + 0.5) * CELL, (cy + 0.45) * CELL);
          if (fogAt(shapes, p).join() === String(DARK)) tally.fog++;
          else if (slabs.some((q) => inside(p, q))) tally.wall++;
          else if (feet.some((f) => Math.abs(f.x - p.x) <= GIRTH && p.y <= f.y && p.y >= f.y - HEAD)) tally.head++;
          else leaks.push(`${seen.kind} ${seen.id} visible: (${cx}, ${cy}) in ${id} left clear`);
        }
    }
    expect(leaks).toEqual([]);
    expect(tally.fog).toBeGreaterThan(0);
  });

  it("covers an unexplored room behind a low wall from the corridor beyond it", () => {
    // room A (1) over rows 1–4, a low wall on row 5, a corridor (2) on row 6: the corridor visible
    const grid = floor(12, 9, [room(A, 1, 1, 8, 4), corridor(C, 1, 6, 8, 1)]);
    const shapes = fogOf(grid, states({ [C]: "visible" }));
    const slabs = drawnSlabs(grid, shellWalls(grid), HEIGHTS);
    // its front row down its middle: veiled, or behind its own low south wall, which now stands on
    // its edge and covers its floor up to about 54 px in (FS-XK2B6 ruling E2); veiled past that
    for (const fy of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const p = worldToScreen(4.55 * CELL, (4 + fy) * CELL);
      if (fy < 0.3) expect(fogAt(shapes, p)).toEqual([DARK]);
      else expect(fogAt(shapes, p).join() === String(DARK) || slabs.some((q) => inside(p, q))).toBe(true);
    }
    // and its next row all over: points off the seams between strips
    for (const [fx, fy] of [[0.55, 0.5], [0.85, 0.9], [0.2, 0.75], [0.75, 0.2]]) {
      const p = worldToScreen((4 + fx) * CELL, (3 + fy) * CELL);
      expect(fogAt(shapes, p)).toEqual([DARK]);
    }
  });

  it("covers an unexplored corridor past a visible room's doorway beyond a member's reach, but where a drawn wall stands in front of it", () => {
    // room R (1) over 2–7 × 5–9, visible; a corridor (2) up column 4 over rows 0–4, unexplored
    const grid = floor(10, 11, [room(A, 2, 5, 6, 5), corridor(C, 4, 0, 1, 5)]);
    const state = states({ [A]: "visible" });
    const walls = shellWalls(grid);
    const shapes = fogOf(grid, state, walls);
    const slabs = drawnSlabs(grid, walls, HEIGHTS);
    let fogged = 0;
    // across the corridor: its low east wall, on its edge, covers about 54 px of its 80 (FS-XK2B6
    // ruling E2), so the points by its west wall are the ones the fog must cover
    for (const cy of [0, 1, 2])
      for (const [fx, fy] of [[0.55, 0.5], [0.2, 0.75], [0.75, 0.2], [0.1, 0.5]]) {
        const p = worldToScreen((4 + fx) * CELL, (cy + fy) * CELL);
        const dark = fogAt(shapes, p).join() === String(DARK);
        if (dark) fogged++;
        // or behind a drawn wall: its slab, or a corner post where its strip ends (every wall
        // bordering a region now stands, the unexplored corridor's own too)
        else expect(slabs.some((q) => inside(p, q)) || partsAt(shapes, p).some((x) => x.alpha === 0 && x.equiv > 0)).toBe(true);
      }
    expect(fogged).toBeGreaterThan(4);
  });

  it("leaves every corner post standing where drawn walls end clear to its cap (FS-XK2B6 §F.18)", () => {
    // room A's shell: a post at each of the room's four corners, set off into the corner's cell
    const grid = floor(8, 6, [room(A, 1, 1, 4, 3)]);
    const plan = planOf(grid);
    expect(plan.posts).toHaveLength(4);
    for (const state of [states({ [A]: "visible" }), states({})]) {
      const shapes = fogOf(grid, state);
      for (const post of plan.posts)
        for (const dx of [-7, -3, 0, 3, 7]) {
          const top = lifted(post.at.x, post.at.y, HEIGHTS[post.height] + 10);
          expect(fogAt(shapes, { x: top.x + dx, y: top.y })).toEqual([]);
        }
    }
  });
});

/**
 * The screen points of a drawn thing, from its foot to its top: its footprint (world px, `along`
 * by `across` about `at`, kept a hair inside its sides) raised to `height` px.
 */
function standing(at: Point, axis: "x" | "y", along: number, across: number, height: number): Point[] {
  const points: Point[] = [];
  const u = along / 2 - 0.3;
  const v = across / 2 - 0.3;
  for (const du of [-u, 0, u])
    for (const dv of [-v, v])
      for (const up of [0, height / 2, height]) {
        const [dx, dy] = axis === "x" ? [du, dv] : [dv, du];
        points.push(lifted(at.x + dx, at.y + dy, up));
      }
  return points;
}

/** The veils over a screen point, looked up among only the shapes whose box is near it. */
function veilsAt(shapes: readonly FogShape[]): (p: Point) => number[] {
  const side = 64;
  const buckets = new Map<string, FogShape[]>();
  for (const s of shapes) {
    if (s.alpha === 0) continue;
    const xs = s.points.map((p) => p.x);
    const ys = s.points.map((p) => p.y);
    for (let bx = Math.floor(Math.min(...xs) / side); bx <= Math.floor(Math.max(...xs) / side); bx++)
      for (let by = Math.floor(Math.min(...ys) / side); by <= Math.floor(Math.max(...ys) / side); by++) {
        const key = `${bx},${by}`;
        buckets.set(key, [...(buckets.get(key) ?? []), s]);
      }
  }
  return (p) => fogAt(buckets.get(`${Math.floor(p.x / side)},${Math.floor(p.y / side)}`) ?? [], p);
}

describe("a floor's wall layout, as the fog sees it (FS-XK2B6 §F)", () => {
  const LEFT = false;
  const RIGHT = true;
  /** A cell's north and east edges are the outer sides of its right half, its west and south its left's. */
  const HALF_OF: Record<EdgeSide, { right: boolean; axis: "x" | "y" }> = {
    south: { right: RIGHT, axis: "x" },
    west: { right: RIGHT, axis: "y" },
    east: { right: LEFT, axis: "y" },
    north: { right: LEFT, axis: "x" },
  };

  describe("a room's north wall", () => {
    // room A over 1–4 × 1–3: its north wall cells on row 0 each show one edge, their south side
    const grid = floor(8, 6, [room(A, 1, 1, 4, 3)]);
    const layout = wallLayout(grid, planOf(grid));

    it("stands a slab on each wall cell's south side, on the half that side bounds, and none through its middle", () => {
      for (let cx = 1; cx <= 4; cx++) {
        expect(layout.slabs(cx, 0, LEFT)).toEqual([
          { axis: "x", height: "back", foot: worldToScreen((cx + 0.5) * CELL, CELL - HALF) },
        ]);
        expect(layout.slabs(cx, 0, RIGHT)).toEqual([]);
      }
    });

    it("leaves the px over the edge clear up to the wall's top, whatever the room's state", () => {
      for (const state of [states({}), states({ [A]: "explored" }), states({ [A]: "visible" })]) {
        const at = veilsAt(fogOf(grid, state));
        for (let cx = 1; cx <= 4; cx++)
          for (const p of standing({ x: (cx + 0.5) * CELL, y: CELL - HALF }, "x", CELL, THICK, HEIGHTS.back))
            expect(at(p)).toEqual([]);
      }
    });
  });

  describe("on the sample floor", () => {
    const grid = new RegionGrid(fixture as never);
    const plan = planOf(grid, fixtureWalls());
    const layout = wallLayout(grid, plan);
    const halves: { cx: number; cy: number; right: boolean }[] = [];
    for (let cy = -1; cy <= grid.rows; cy++)
      for (let cx = -1; cx <= grid.cols; cx++) for (const right of [LEFT, RIGHT]) halves.push({ cx, cy, right });

    it("gives a slab for every wall edge of the plan, on the half of its wall cell that edge bounds, at its height, and nothing else", () => {
      const got = halves.flatMap(({ cx, cy, right }) => layout.slabs(cx, cy, right).map((s) => `${cx},${cy},${right},${s.axis},${s.height}`));
      const want = plan.edges.map((e) => `${e.cx},${e.cy},${HALF_OF[e.wallSide].right},${HALF_OF[e.wallSide].axis},${edgeHeight(e, grid)}`);
      expect(got.sort()).toEqual(want.sort());
      expect(got).toHaveLength(766);
    });

    it("stands each slab on its wall's centre line: half a thickness from its edge, in its wall cell", () => {
      for (const { cx, cy, right } of halves)
        for (const s of layout.slabs(cx, cy, right)) {
          const foot = screenToWorld(s.foot.x, s.foot.y);
          expect(grid.cellOf(foot)).toEqual({ cx, cy });
          const across = s.axis === "x" ? foot.y : foot.x;
          const off = Math.abs(across - Math.round(across / CELL) * CELL);
          expect(off).toBeCloseTo(HALF, 6);
        }
    });

    it("gives a post for every post of the plan, at its place and height, claimed only by halves of cells no one walks on", () => {
      const claims = halves.flatMap(({ cx, cy, right }) => layout.posts(cx, cy, right).map((p) => ({ cx, cy, ...p })));
      for (const c of claims) expect(grid.walkable(c.cx, c.cy)).toBe(false);
      const key = (p: Point, height: string) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)},${height}`;
      expect(new Set(claims.map((c) => key(c.foot, c.height)))).toEqual(new Set(plan.posts.map((p) => key(worldToScreen(p.at.x, p.at.y), p.height))));
    });

    it("lays no fog over any drawn piece or post, from its foot to its top, with every region unexplored or under a scatter of states", () => {
      const { pieces, posts } = dungeonWalls(plan, grid, 41, MASONRY_WALLS);
      expect(pieces).toHaveLength(2 * 766);
      const scatter = (id: number): ExplorationState => (["unexplored", "explored", "visible"] as const)[id % 3];
      for (const state of [states({}), scatter]) {
        const at = veilsAt(fogOf(grid, state, fixtureWalls()));
        const veiled: string[] = [];
        for (const p of pieces)
          for (const q of standing(p.at, p.axis, CELL / 2, THICK, HEIGHTS[p.height])) if (at(q).length) veiled.push(`piece ${p.at.x},${p.at.y}`);
        for (const post of posts) {
          const top = HEIGHTS[post.height];
          const cap = [-7, -3, 0, 3, 7].map((dx) => {
            const c = lifted(post.at.x, post.at.y, top + 10);
            return { x: c.x + dx, y: c.y };
          });
          for (const q of [...standing(post.at, "x", THICK, THICK, top), ...cap]) if (at(q).length) veiled.push(`post ${post.at.x},${post.at.y}`);
        }
        expect([...new Set(veiled)]).toEqual([]);
      }
    });
  });
});

/** A canvas texture as the fog paints it: the alphas it was last given, and how often. */
class FakeCanvas {
  puts = 0;
  destroyed = false;
  filter?: number;
  alphas: number[] = [];
  constructor(
    readonly key: string,
    readonly width: number,
    readonly height: number,
  ) {}
  getContext() {
    return { createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }) };
  }
  putData(pixels: { data: Uint8ClampedArray }) {
    this.puts++;
    this.alphas = [];
    for (let i = 3; i < pixels.data.length; i += 4) this.alphas.push(pixels.data[i] / 255);
    return this;
  }
  refresh() {
    return this;
  }
  setFilter(mode: number) {
    this.filter = mode;
    return this;
  }
  destroy() {
    this.destroyed = true;
  }
}

/** An image of a canvas texture, as the fog lays it. */
class FakeImage {
  depth = 0;
  alpha = 1;
  scale = 1;
  visible = true;
  destroyed = false;
  constructor(
    readonly x: number,
    readonly y: number,
    readonly key: string,
  ) {}
  setOrigin() {
    return this;
  }
  setScale(v: number) {
    this.scale = v;
    return this;
  }
  setDepth(v: number) {
    this.depth = v;
    return this;
  }
  setVisible(v: boolean) {
    this.visible = v;
    return this;
  }
  setAlpha(v: number) {
    this.alpha = v;
    return this;
  }
  destroy() {
    this.destroyed = true;
  }
}

/** A wall piece as the gate sees it. */
class FakePiece {
  visible = true;
  tint?: number;
  setVisible(v: boolean) {
    this.visible = v;
    return this;
  }
  setTint(c: number) {
    this.tint = c;
    return this;
  }
  clearTint() {
    this.tint = undefined;
    return this;
  }
}

/** The scene's tweens as the fade uses them: each counter made, run by hand. */
function fakeTweens() {
  const made: { config: FogTweenConfig; stopped: boolean }[] = [];
  return {
    made,
    addCounter(config: FogTweenConfig) {
      const tween = { config, stopped: false, stop: () => ((tween.stopped = true), tween) };
      made.push(tween);
      return tween;
    },
    /** The last counter run `p` of the way. */
    run(p: number) {
      made.at(-1)!.config.onUpdate({ getValue: () => p });
    },
    /** The last counter run to its end. */
    finish() {
      made.at(-1)!.config.onUpdate({ getValue: () => 1 });
      made.at(-1)!.config.onComplete();
    },
  };
}

function fogOver(grid: RegionGrid, side = 512) {
  const canvases: FakeCanvas[] = [];
  const images: FakeImage[] = [];
  const tweens = fakeTweens();
  const stage = {
    add: { image: (x: number, y: number, key: string) => images[images.push(new FakeImage(x, y, key)) - 1] },
    textures: { createCanvas: (key: string, w: number, h: number) => canvases[canvases.push(new FakeCanvas(key, w, h)) - 1] },
    tweens,
  };
  const bounds = { x: -grid.rows * 64, y: 0, width: (grid.cols + grid.rows) * 64, height: (grid.cols + grid.rows) * 32 };
  const chunks = new ChunkVisibility(new ChunkGrid(bounds, side));
  const fog = new Fog(stage, grid, chunks, () => HEIGHTS, wallLayout(grid, planOf(grid)));
  /**
   * The alpha one layer of the fog lays over screen point `p`, and its image: the base over the
   * world, the fog that comes (`up`), or the fog that lifts (`down`).
   */
  const alphaAt = (p: Point, which: "base" | "up" | "down" = "base") => {
    const t = FEATHER.texel;
    for (const image of images) {
      if (image.destroyed || !image.key.endsWith(`:${which}`)) continue;
      const canvas = canvases.find((c) => c.key === image.key)!;
      const c = Math.floor((p.x - image.x) / t);
      const r = Math.floor((p.y - image.y) / t);
      if (c >= 0 && r >= 0 && c < canvas.width && r < canvas.height) return { alpha: canvas.alphas[r * canvas.width + c], image };
    }
    return { alpha: 0, image: undefined };
  };
  return { fog, images, canvases, tweens, chunks, alphaAt };
}

describe("the fog layer (FS-SRA9J §C.13)", () => {
  it("works the fog out only when a region's state changes", () => {
    const grid = walk();
    const { fog, images, tweens } = fogOver(grid);
    const seen = new Exploration(grid);
    const shown = () => fog.show((id) => seen.state(id));
    shown();
    // a member walks room A, along the corridor, into room B, a step a frame
    for (let x = 2; x <= 13; x += 0.25)
      if (seen.see([mid(x, 2)])) {
        shown();
        tweens.finish();
      }
    for (let i = 0; i < 10; i++) shown();
    // the first draw, then A, C, B each lit in turn
    expect(fog.redraws).toBe(4);
    expect(images.length).toBeGreaterThan(0);
  });

  it("lays each chunk's field as an image at the blackout's depth, a texel of its texture to a texel of the lattice, drawn smooth", () => {
    const { fog, images, canvases } = fogOver(walk());
    fog.show(() => "unexplored");
    expect(FOG.depth).toBe(500);
    const base = images.filter((m) => m.depth === FOG.depth);
    expect(base.length).toBeGreaterThan(0);
    const onLattice = (v: number) => Math.abs(v % FEATHER.texel) === 0;
    for (const m of base) expect([m.scale, onLattice(m.x), onLattice(m.y)]).toEqual([FEATHER.texel, true, true]);
    // Phaser's FilterMode.LINEAR
    for (const c of canvases) expect(c.filter).toBe(0);
  });

  it("covers no region's floor and no wall while every region is visible: only the void is veiled", () => {
    const grid = new RegionGrid(fixture as never);
    const shapes = fogOf(grid, () => "visible", fixtureWalls());
    for (let cy = 0; cy < grid.rows; cy++)
      for (let cx = 0; cx < grid.cols; cx++) {
        if (grid.walkable(cx, cy)) expect(fogAt(shapes, onScreen(cx, cy))).toEqual([]);
        else if (isShell(grid, cx, cy)) expect(fogAt(shapes, onScreen(cx, cy, HEIGHTS.front / 2))).toEqual([]);
      }
  });

  it("goes with its floor, its fade stopped", () => {
    const { fog, images, canvases, tweens } = fogOver(walk());
    fog.show(() => "unexplored");
    fog.show(states({ [C]: "visible" }));
    fog.destroy();
    expect(images.every((m) => m.destroyed)).toBe(true);
    expect(canvases.every((c) => c.destroyed)).toBe(true);
    expect(tweens.made.at(-1)!.stopped).toBe(true);
  });

  it("paints a chunk far from the camera only once it comes near, then at once", () => {
    const grid = walk();
    const { fog, canvases, chunks, alphaAt, images } = fogOver(grid, 128);
    fog.show(() => "unexplored");
    // the view on room A alone: room B's chunk is far
    const a = onScreen(2, 2);
    chunks.update({ x: a.x - 100, y: a.y - 100, width: 200, height: 200 });
    const b = onScreen(13, 2);
    const before = canvases.map((c) => c.puts);
    fog.show(states({ [B]: "visible" }));
    const bImage = alphaAt(b).image!;
    expect(bImage.visible).toBe(false);
    expect(canvases.find((c) => c.key === bImage.key)!.puts).toBe(before[canvases.findIndex((c) => c.key === bImage.key)]);
    chunks.update({ x: b.x - 100, y: b.y - 100, width: 200, height: 200 });
    expect(alphaAt(b).alpha).toBe(0);
    expect(bImage.visible).toBe(true);
    // no fade where none was watched
    expect(images.filter((m) => m.depth === FOG.floorDepth && m.visible)).toEqual([]);
  });
  it("paints a changed chunk near the camera but out of its view a few a frame on the fade's counter, not at once", () => {
    const grid = walk();
    const { fog, canvases, chunks, alphaAt, tweens } = fogOver(grid, 128);
    fog.show(() => "unexplored");
    const b = onScreen(13, 2);
    const at = chunks.grid.rects[chunks.grid.indexAt(b)];
    // the view just left of room B's chunk: near it, not on it
    chunks.update({ x: at.x - 200, y: at.y, width: 199, height: at.height });
    const image = alphaAt(b).image!;
    const canvas = canvases.find((c) => c.key === image.key)!;
    const puts = canvas.puts;
    fog.show(states({ [B]: "visible" }));
    expect(canvas.puts).toBe(puts);
    for (let i = 1; i <= 20 && canvas.puts === puts; i++) tweens.run(i / 20);
    expect(canvas.puts).toBeGreaterThan(puts);
    expect(alphaAt(b).alpha).toBe(0);
    expect(FOG.paints).toBeGreaterThan(0);
  });
});

describe("the feather at the fog's edges (FS-SRA9J §C.13, owner playtest 2026-11-06)", () => {
  it("never lays any fog over a member's head, yet eases in from it rather than cutting", () => {
    // room A (1) over 1–8 × 1–6, a corridor (2) up into it over columns 4–5, rows 7–10
    const grid = floor(12, 12, [room(A, 1, 1, 8, 6), corridor(C, 4, 7, 2, 4)]);
    const { fog, alphaAt } = fogOver(grid);
    fog.show(states({ [C]: "visible" }));
    // a member at the corridor's mouth (4, 7): room A, unexplored, lies behind them on screen
    for (const up of [20, 50, 80, FOG.stand - 4])
      for (const dx of [-12, 0, 12]) {
        const head = onScreen(4, 7, up);
        expect(alphaAt({ x: head.x + dx, y: head.y }).alpha).toBe(0);
      }
    // up the screen from their head into room A's floor: from clear, through a ramp, to the full veil
    const seen: number[] = [];
    for (let up = 60; up <= 212; up += 4) seen.push(alphaAt(onScreen(4, 7, up)).alpha);
    expect(seen[0]).toBe(0);
    expect(seen.at(-1)).toBeCloseTo(DARK, 2);
    expect(seen.some((v) => v > 0.15 && v < DARK - 0.15)).toBe(true);
    for (let k = 1; k < seen.length; k++) expect(seen[k]).toBeGreaterThanOrEqual(seen[k - 1] - 1 / 255);
  });

  it("never darkens a px past the sharp veil, over the fixture floor with any one region visible", () => {
    const grid = new RegionGrid(fixture as never);
    const walls = fixtureWalls();
    for (const seen of grid.regions.filter((_, i) => i % 7 === 0)) {
      const shapes = fogOf(grid, (id) => (id === seen.id ? "visible" : id % 2 ? "explored" : "unexplored"), walls);
      // the region's own floor, where its members stand: each cell's middle and up to a head over it
      const r = seen.cells[0];
      const a = worldToScreen((r.x + 0.5) * CELL, (r.y + 0.5) * CELL);
      const rect = { x: a.x - 256, y: a.y - 256, width: 512, height: 512 };
      const { window: win, alpha } = fogField(shapes, rect);
      for (let row = 0; row < win.rows; row++)
        for (let col = 0; col < win.cols; col++) {
          const p = { x: win.x + (col + 0.5) * FEATHER.texel, y: win.y + (row + 0.5) * FEATHER.texel };
          // a texel's middle on the line between two shapes lies in either: the darker is the sharp veil there
          const sharp = Math.max(0, ...shapes.filter((s) => s.alpha > 0 && (inside(p, s.points) || onEdge(p, s.points))).map((s) => s.alpha));
          expect(alpha[row * win.cols + col]).toBeLessThanOrEqual(sharp + 1e-6);
        }
    }
  });
});

describe("the fade between states (FS-SRA9J §C.13, owner playtest 2026-11-06)", () => {
  /** What the layers show over screen point `p`, each visible one laid over the last. */
  const shownAt = (alphaAt: ReturnType<typeof fogOver>["alphaAt"], p: Point) => {
    let clear = 1;
    for (const which of ["down", "base", "up"] as const) {
      const { alpha, image } = alphaAt(p, which);
      if (image?.visible) clear *= 1 - alpha * image.alpha;
    }
    return 1 - clear;
  };

  it("eases a lifting veil out over FOG.fade ms, under everything that stands, so a member stepping in is never veiled", () => {
    const { fog, tweens, alphaAt, images } = fogOver(walk());
    fog.show(() => "unexplored");
    expect(tweens.made).toEqual([]);
    fog.show(states({ [C]: "visible" }));
    expect(tweens.made.at(-1)!.config.duration).toBe(FOG.fade);
    expect(FOG.fade).toBeGreaterThanOrEqual(250);
    expect(FOG.fade).toBeLessThanOrEqual(400);
    // over the world, nothing on the corridor's floor at once; under what stands, all the veil it had
    const p = onScreen(7, 2);
    expect(alphaAt(p).alpha).toBe(0);
    const down = alphaAt(p, "down");
    expect(down.alpha).toBeCloseTo(DARK, 2);
    expect(down.image!.depth).toBe(FOG.floorDepth);
    expect(FOG.floorDepth).toBeLessThan(100);
    expect([down.image!.visible, down.image!.alpha]).toEqual([true, 1]);
    tweens.run(0.5);
    expect(down.image!.alpha).toBe(0.5);
    tweens.finish();
    expect(down.image!.visible).toBe(false);
    expect(alphaAt(p).alpha).toBe(0);
    expect(images.filter((m) => m.depth === FOG.floorDepth && m.visible)).toEqual([]);
  });

  it("eases a veil coming back in over the world as the last member leaves", () => {
    const { fog, tweens, alphaAt } = fogOver(walk());
    fog.show(states({ [A]: "visible" }));
    fog.show(states({ [A]: "explored", [C]: "visible" }));
    // room A's middle, far from any edge
    const p = onScreen(2, 2);
    expect(alphaAt(p).alpha).toBe(0);
    const coming = alphaAt(p, "up");
    expect(coming.alpha).toBeCloseTo(DIM, 2);
    expect([coming.image!.depth, coming.image!.alpha]).toEqual([FOG.depth, 0]);
    tweens.run(0.5);
    expect(coming.image!.alpha).toBe(0.5);
    tweens.finish();
    expect(alphaAt(p).alpha).toBeCloseTo(DIM, 2);
    expect(coming.image!.visible).toBe(false);
  });

  it("changes only alphas and tints while it eases: nothing is worked out or painted again", () => {
    const { fog, tweens, canvases } = fogOver(walk());
    fog.show(() => "unexplored");
    fog.show(states({ [C]: "visible" }));
    const puts = canvases.map((c) => c.puts);
    const redraws = fog.redraws;
    for (const p of [0.2, 0.4, 0.6, 0.8]) tweens.run(p);
    expect(canvases.map((c) => c.puts)).toEqual(puts);
    expect(fog.redraws).toBe(redraws);
  });

  it("takes up a new change from where the last fade had got to, with no jump", () => {
    const { fog, tweens, alphaAt } = fogOver(walk());
    fog.show(() => "unexplored");
    fog.show(states({ [C]: "visible" }));
    tweens.run(0.5);
    const p = onScreen(7, 2);
    const q = onScreen(2, 2, 10);
    const before = [shownAt(alphaAt, p), shownAt(alphaAt, q)];
    const first = tweens.made.at(-1)!;
    fog.show(states({ [C]: "visible", [A]: "visible" }));
    expect(first.stopped).toBe(true);
    // the corridor still easing, room A starting to: each where it was
    expect(shownAt(alphaAt, p)).toBeCloseTo(before[0], 1);
    expect(shownAt(alphaAt, q)).toBeCloseTo(before[1], 1);
    tweens.finish();
    expect(shownAt(alphaAt, p)).toBe(0);
  });

  it("eases a wall's tint with its veil", () => {
    const grid = walk();
    const { fog, tweens } = fogOver(grid);
    const piece = new FakePiece();
    // room B's north wall, which borders B alone
    fog.gate(piece, NORTH_OF_B);
    fog.show(() => "unexplored");
    expect(piece.tint).toBe(FOG.unexplored.tint);
    fog.show(states({ [B]: "visible" }));
    tweens.run(0.5);
    expect(piece.tint).toBe(mix(TINT_IDENTITY, palette.inkDeep, DARK / 2));
    tweens.finish();
    expect(piece.tint).toBeUndefined();
  });
});

describe("a wall piece under the fog (FS-SRA9J §C.8, §C.9, §C.11)", () => {
  it("is drawn tinted as dense as the unexplored veil while every region it borders is unexplored, the lighter tint while the brightest is explored, plain while one is visible", () => {
    const grid = walk();
    const { fog, tweens } = fogOver(grid);
    const piece = new FakePiece();
    // room B's north wall, which borders B alone
    fog.gate(piece, NORTH_OF_B);
    fog.show(() => "unexplored");
    expect([piece.visible, piece.tint]).toEqual([true, FOG.unexplored.tint]);
    fog.show(states({ [B]: "explored" }));
    tweens.finish();
    expect([piece.visible, piece.tint]).toEqual([true, FOG.explored.tint]);
    fog.show(states({ [B]: "visible" }));
    tweens.finish();
    expect([piece.visible, piece.tint]).toEqual([true, undefined]);
  });

  it("takes the brightest of the regions its wall cell borders: a wall cell between a visible and an unexplored region shows both its walls plain (FS-XK2B6 §F.20)", () => {
    // room A over rows 1–3, the wall cells of row 4, a corridor over rows 5–6: each wall cell of
    // row 4 carries a wall on its north edge, facing A, and one on its south edge, facing C
    const grid = floor(10, 9, [room(A, 1, 1, 6, 3), corridor(C, 1, 5, 6, 2)]);
    const { pieces } = dungeonWalls(planOf(grid), grid, 1, MASONRY_WALLS);
    const own = pieces.filter((p) => grid.cellOf(p.at).cx === 3 && grid.cellOf(p.at).cy === 4);
    expect(new Set(own.map((p) => p.at.y))).toEqual(new Set([4 * CELL + HALF, 5 * CELL - HALF]));
    for (const lit of [{ [A]: "unexplored", [C]: "visible" }, { [A]: "visible", [C]: "unexplored" }, { [A]: "explored", [C]: "visible" }] as const) {
      const { fog } = fogOver(grid);
      const gated = own.map((p) => {
        const piece = new FakePiece();
        fog.gate(piece, p.at);
        return piece;
      });
      fog.show(states(lit));
      for (const piece of gated) expect([piece.visible, piece.tint]).toEqual([true, undefined]);
    }
  });

  it("standing on a region's floor (run dressing), takes that region's state: hidden while unexplored, never tinted", () => {
    const grid = walk();
    const { fog, tweens } = fogOver(grid);
    const piece = new FakePiece();
    // in room B, by its doorway to the corridor: B's own state, not the corridor's
    fog.gate(piece, mid(11, 2));
    fog.show(states({ [C]: "visible" }));
    expect(piece.visible).toBe(false);
    // explored: the veil over its floor lies over it already
    fog.show(states({ [B]: "explored" }));
    tweens.finish();
    expect([piece.visible, piece.tint]).toEqual([true, undefined]);
  });

  it("stays hidden while its ground chunk is far from the camera, whatever the fog says", () => {
    const grid = walk();
    const { fog } = fogOver(grid);
    const piece = new FakePiece();
    const gate = fog.gate(piece, NORTH_OF_B);
    fog.show(() => "visible");
    gate.setVisible(false);
    expect(piece.visible).toBe(false);
    gate.setVisible(true);
    expect(piece.visible).toBe(true);
  });
});
