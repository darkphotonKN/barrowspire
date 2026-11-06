import { describe, expect, it } from "vitest";
import type { FloorRegion, WallState } from "@/types/gameState";
import { worldToScreen, type Point } from "@/render/iso/projection";
import { ChunkGrid, ChunkVisibility } from "./chunks";
import { RegionGrid, stripWalls, wallRule } from "./dungeon";
import { Exploration, type ExplorationState } from "./exploration";
import { FOG, Fog, fogShapes, wallLayout, type FogHeights, type FogShape } from "./fog";
import { axisOf } from "./walls";
import fixture from "./dungeon.fixture.json";

const CELL = 80;
const HEIGHTS = { back: 141, front: 43 };

const floor = (cols: number, rows: number, regions: FloorRegion[]) =>
  new RegionGrid({ width: cols * CELL, height: rows * CELL, cell_size: CELL, regions });
const region = (kind: FloorRegion["kind"]) => (id: number, x: number, y: number, w: number, h: number): FloorRegion => ({
  id,
  kind,
  cells: [{ x, y, w, h }],
});
const room = region("room");
const corridor = region("corridor");

/**
 * A floor's walls as the server lays them (levelgen `mergeWalls`): the shell's cells, each row cut
 * into runs, a run the same as the one above it carried on down; then cut into one-cell strips.
 */
function shellWalls(grid: RegionGrid): WallState[] {
  const shell = (cx: number, cy: number) => !grid.walkable(cx, cy) && grid.hasGround(mid(cx, cy));
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
  const walls = rects.map((r, i) => ({
    entity_id: `w-${i}`,
    position: { x: r.x * CELL, y: r.y * CELL },
    width: r.w * CELL,
    height: r.h * CELL,
  }));
  return stripWalls(walls, CELL);
}

/** The fixture floor's walls, as the scene strips them. */
const fixtureWalls = (): WallState[] =>
  stripWalls(
(fixture as { walls: WallState[] }).walls, CELL);

/** The fog over a floor whose walls are its shell's, as the server lays them. */
const fogOf = (grid: RegionGrid, state: (id: number) => ExplorationState, walls = shellWalls(grid), heights: FogHeights = HEIGHTS) =>
  fogShapes(grid, wallRule(grid), state, heights, wallLayout(grid, walls));

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

/** The fog over a screen point: the shades of every shape covering it. */
const fogAt = (shapes: readonly FogShape[], p: Point) => shapes.filter((s) => inside(p, s.points)).map((s) => s.shade);

/** Region states from a table, unexplored for any other. */
const states = (table: Record<number, ExplorationState>) => (id: number) => table[id] ?? "unexplored";

// room A (1) over 1–4 × 1–4, a corridor (2) over 5–10 × 2–3, room B (3) over 11–14 × 1–4
const A = 1;
const C = 2;
const B = 3;
const walk = () => floor(17, 7, [room(A, 1, 1, 4, 4), corridor(C, 5, 2, 6, 2), room(B, 11, 1, 4, 4)]);

describe("the fog over each region (FS-SRA9J §C.8–§C.10)", () => {
  it("is dark over an unexplored region, dim over an explored one, and none over a visible one", () => {
    const grid = walk();
    const shapes = fogOf(grid, states({ [A]: "explored", [C]: "visible" }));
    expect(fogAt(shapes, onScreen(2, 3))).toEqual(["dim"]);
    expect(fogAt(shapes, onScreen(7, 2))).toEqual([]);
    expect(fogAt(shapes, onScreen(13, 3))).toEqual(["dark"]);
  });

  it("is dark over the whole floor before anyone is seen", () => {
    const grid = walk();
    const shapes = fogOf(grid, states({}));
    for (const [cx, cy] of [[2, 2], [4, 4], [7, 3], [12, 1], [14, 4]]) expect(fogAt(shapes, onScreen(cx, cy))).toEqual(["dark"]);
  });

  it("never covers a screen point twice, so the explored dim never compounds", () => {
    const grid = new RegionGrid(fixture as never);
    // a scatter of states over the fixture's regions
    const state = (id: number): ExplorationState => (["unexplored", "explored", "visible"] as const)[id % 3];
    const shapes = fogOf(grid, state, fixtureWalls());
    let covered = 0;
    for (let x = -3000; x < 6000; x += 37)
      for (let y = -200; y < 4800; y += 23) {
        const n = fogAt(shapes, { x: x + 0.5, y: y + 0.5 }).length;
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

  it("leaves a wall bordering a visible region clear, whatever is behind it", () => {
    const grid = split();
    const shapes = fogOf(grid, states({ [C]: "visible" }));
    // the wall on row 4 is low (walkable on both sides): the middle of its face is clear
    expect(fogAt(shapes, onScreen(3, 4, HEIGHTS.front / 2))).toEqual([]);
    // and the room behind it is dark
    expect(fogAt(shapes, onScreen(3, 2))).toEqual(["dark"]);
  });

  it("leaves a visible region's back wall clear over its full height", () => {
    const grid = walk();
    const shapes = fogOf(grid, states({ [B]: "visible" }));
    // room B's north wall, row 0, is full height
    expect(fogAt(shapes, onScreen(12, 0, HEIGHTS.back - 10))).toEqual([]);
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

  /** Each drawn wall cell's slab on screen: its centreline from edge to edge, raised to its height. */
  function drawnSlabs(grid: RegionGrid, walls: readonly WallState[], state: (id: number) => ExplorationState, heights: FogHeights) {
    const rule = wallRule(grid);
    const drawn = (cx: number, cy: number) => {
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const id = grid.region(cx + dx, cy + dy);
          if (id && state(id) !== "unexplored") return true;
        }
      return false;
    };
    const quads: Point[][] = [];
    for (const w of walls) {
      const along = axisOf(w);
      const cells = (along === "x" ? w.width : w.height) / CELL;
      for (let k = 0; k < cells; k++) {
        const cx = Math.round(w.position.x / CELL) + (along === "x" ? k : 0);
        const cy = Math.round(w.position.y / CELL) + (along === "y" ? k : 0);
        if (!drawn(cx, cy)) continue;
        const h = rule.height(mid(cx, cy)) === "back" ? heights.back : heights.front;
        const ends = along === "x" ? [[cx * CELL, (cy + 0.5) * CELL], [(cx + 1) * CELL, (cy + 0.5) * CELL]] : [[(cx + 0.5) * CELL, cy * CELL], [(cx + 0.5) * CELL, (cy + 1) * CELL]];
        const [a, b] = ends.map(([x, y]) => worldToScreen(x, y));
        quads.push([a, b, { x: b.x, y: b.y - h }, { x: a.x, y: a.y - h }]);
      }
    }
    return quads;
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
      const slabs = drawnSlabs(grid, walls, state, HEIGHTS);
      const feet = feetIn(grid, seen);
      for (let cy = 0; cy < grid.rows; cy++)
        for (let cx = 0; cx < grid.cols; cx++) {
          const id = grid.region(cx, cy);
          if (!id || id === seen.id) continue;
          // the middle of its floor, nudged off the seam between two strips
          const p = worldToScreen((cx + 0.5) * CELL, (cy + 0.45) * CELL);
          if (fogAt(shapes, p).join() === "dark") tally.fog++;
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
    // its front row's middle, and its next row all over: points off the seams between strips
    expect(fogAt(shapes, worldToScreen(4.55 * CELL, 4.5 * CELL))).toEqual(["dark"]);
    for (const [fx, fy] of [[0.55, 0.5], [0.85, 0.9], [0.2, 0.75], [0.75, 0.2]]) {
      const p = worldToScreen((4 + fx) * CELL, (3 + fy) * CELL);
      expect(fogAt(shapes, p)).toEqual(["dark"]);
    }
  });

  it("covers an unexplored corridor past a visible room's doorway beyond a member's reach, but where a drawn wall stands in front of it", () => {
    // room R (1) over 2–7 × 5–9, visible; a corridor (2) up column 4 over rows 0–4, unexplored
    const grid = floor(10, 11, [room(A, 2, 5, 6, 5), corridor(C, 4, 0, 1, 5)]);
    const state = states({ [A]: "visible" });
    const walls = shellWalls(grid);
    const shapes = fogOf(grid, state, walls);
    const slabs = drawnSlabs(grid, walls, state, HEIGHTS);
    let fogged = 0;
    for (const cy of [0, 1, 2])
      for (const [fx, fy] of [[0.55, 0.5], [0.2, 0.75], [0.75, 0.2]]) {
        const p = worldToScreen((4 + fx) * CELL, (cy + fy) * CELL);
        const dark = fogAt(shapes, p).join() === "dark";
        if (dark) fogged++;
        else expect(slabs.some((q) => inside(p, q))).toBe(true);
      }
    expect(fogged).toBeGreaterThan(4);
  });

  it("leaves a corner post standing where a drawn wall ends clear to its cap", () => {
    // room A's north wall runs along row 0 from column 0 to column 5, its posts at both ends
    const grid = floor(8, 6, [room(A, 1, 1, 4, 3)]);
    const shapes = fogOf(grid, states({ [A]: "visible" }));
    for (const cx of [0, 5])
      for (const dx of [-7, -3, 3, 7]) {
        const top = onScreen(cx, 0, HEIGHTS.back + 10);
        expect(fogAt(shapes, { x: top.x + dx, y: top.y })).toEqual([]);
      }
  });
});

/** A Graphics as the fog uses it, counting what it is told. */
class FakeGraphics {
  visible = true;
  fills = 0;
  clears = 0;
  destroyed = false;
  setDepth() {
    return this;
  }
  setVisible(v: boolean) {
    this.visible = v;
    return this;
  }
  clear() {
    this.clears++;
    this.fills = 0;
    return this;
  }
  fillStyle() {
    return this;
  }
  fillPoints() {
    this.fills++;
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

function fogOver(grid: RegionGrid) {
  const made: FakeGraphics[] = [];
  const stage = { add: { graphics: () => made[made.push(new FakeGraphics()) - 1] as never } };
  const bounds = { x: -grid.rows * 64, y: 0, width: (grid.cols + grid.rows) * 64, height: (grid.cols + grid.rows) * 32 };
  const chunks = new ChunkVisibility(new ChunkGrid(bounds, 512));
  const fog = new Fog(stage, grid, wallRule(grid), chunks, () => HEIGHTS, wallLayout(grid, shellWalls(grid)));
  return { fog, made, chunks };
}

describe("the fog layer (FS-SRA9J §C.13)", () => {
  it("draws at the blackout's depth, and redraws only when a region's state changes", () => {
    const grid = walk();
    const { fog, made } = fogOver(grid);
    const seen = new Exploration(grid);
    const shown = () => fog.show((id) => seen.state(id));
    shown();
    // a member walks room A, along the corridor, into room B, a step a frame
    for (let x = 2; x <= 13; x += 0.25) if (seen.see([mid(x, 2)])) shown();
    for (let i = 0; i < 10; i++) shown();
    // the first draw, then A, C, B each lit in turn
    expect(fog.redraws).toBe(4);
    expect(FOG.depth).toBe(500);
    expect(made.length).toBeGreaterThan(0);
  });

  it("covers no region's floor and no wall while every region is visible: only the void is dark", () => {
    const grid = new RegionGrid(fixture as never);
    const shapes = fogOf(grid, () => "visible", fixtureWalls());
    for (let cy = 0; cy < grid.rows; cy++)
      for (let cx = 0; cx < grid.cols; cx++) {
        if (grid.walkable(cx, cy)) expect(fogAt(shapes, onScreen(cx, cy))).toEqual([]);
        else if (grid.hasGround(mid(cx, cy))) expect(fogAt(shapes, onScreen(cx, cy, HEIGHTS.front / 2))).toEqual([]);
      }
  });

  it("goes with its floor", () => {
    const { fog, made } = fogOver(walk());
    fog.show(() => "unexplored");
    fog.destroy();
    expect(made.every((g) => g.destroyed)).toBe(true);
  });
});

describe("a wall piece under the fog (FS-SRA9J §C.8, §C.9, §C.11)", () => {
  it("is hidden while every region it borders is unexplored, dim while the brightest is explored, and plain while one is visible", () => {
    const grid = walk();
    const { fog } = fogOver(grid);
    const piece = new FakePiece();
    // room B's north wall, which borders B alone
    fog.gate(piece, mid(12, 0));
    fog.show(() => "unexplored");
    expect(piece.visible).toBe(false);
    fog.show(states({ [B]: "explored" }));
    expect([piece.visible, piece.tint]).toEqual([true, FOG.dimTint]);
    fog.show(states({ [B]: "visible" }));
    expect([piece.visible, piece.tint]).toEqual([true, undefined]);
  });

  it("takes the brightest of the regions it borders", () => {
    const grid = floor(10, 9, [room(A, 1, 1, 6, 3), corridor(C, 1, 5, 6, 2)]);
    const { fog } = fogOver(grid);
    const piece = new FakePiece();
    fog.gate(piece, mid(3, 4));
    fog.show(states({ [A]: "explored", [C]: "visible" }));
    expect([piece.visible, piece.tint]).toEqual([true, undefined]);
  });

  it("standing on a region's floor (run dressing), takes that region's state: hidden while unexplored, never tinted", () => {
    const grid = walk();
    const { fog } = fogOver(grid);
    const piece = new FakePiece();
    // in room B, by its doorway to the corridor: B's own state, not the corridor's
    fog.gate(piece, mid(11, 2));
    fog.show(states({ [C]: "visible" }));
    expect(piece.visible).toBe(false);
    // explored: the fog over its floor dims it already
    fog.show(states({ [B]: "explored" }));
    expect([piece.visible, piece.tint]).toEqual([true, undefined]);
  });

  it("stays hidden while its ground chunk is far from the camera, whatever the fog says", () => {
    const grid = walk();
    const { fog } = fogOver(grid);
    const piece = new FakePiece();
    const gate = fog.gate(piece, mid(12, 0));
    fog.show(() => "visible");
    gate.setVisible(false);
    expect(piece.visible).toBe(false);
    gate.setVisible(true);
    expect(piece.visible).toBe(true);
  });
});
