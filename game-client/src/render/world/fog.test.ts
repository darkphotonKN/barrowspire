import { describe, expect, it } from "vitest";
import type { FloorRegion } from "@/types/gameState";
import { worldToScreen, type Point } from "@/render/iso/projection";
import { ChunkGrid, ChunkVisibility } from "./chunks";
import { RegionGrid, wallRule } from "./dungeon";
import { Exploration, type ExplorationState } from "./exploration";
import { FOG, Fog, fogShapes, type FogShape } from "./fog";
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
    const shapes = fogShapes(grid, wallRule(grid), states({ [A]: "explored", [C]: "visible" }), HEIGHTS);
    expect(fogAt(shapes, onScreen(2, 3))).toEqual(["dim"]);
    expect(fogAt(shapes, onScreen(7, 2))).toEqual([]);
    expect(fogAt(shapes, onScreen(13, 3))).toEqual(["dark"]);
  });

  it("is dark over the whole floor before anyone is seen", () => {
    const grid = walk();
    const shapes = fogShapes(grid, wallRule(grid), states({}), HEIGHTS);
    for (const [cx, cy] of [[2, 2], [4, 4], [7, 3], [12, 1], [14, 4]]) expect(fogAt(shapes, onScreen(cx, cy))).toEqual(["dark"]);
  });

  it("never covers a screen point twice, so the explored dim never compounds", () => {
    const grid = new RegionGrid(fixture as never);
    // a scatter of states over the fixture's regions
    const state = (id: number): ExplorationState => (["unexplored", "explored", "visible"] as const)[id % 3];
    const shapes = fogShapes(grid, wallRule(grid), state, HEIGHTS);
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
    const shapes = fogShapes(grid, wallRule(grid), states({ [C]: "visible" }), HEIGHTS);
    // the wall on row 4 is low (walkable on both sides): the middle of its face is clear
    expect(fogAt(shapes, onScreen(3, 4, HEIGHTS.front / 2))).toEqual([]);
    // and the room behind it is dark
    expect(fogAt(shapes, onScreen(3, 2))).toEqual(["dark"]);
  });

  it("leaves a visible region's back wall clear over its full height", () => {
    const grid = walk();
    const shapes = fogShapes(grid, wallRule(grid), states({ [B]: "visible" }), HEIGHTS);
    // room B's north wall, row 0, is full height
    expect(fogAt(shapes, onScreen(12, 0, HEIGHTS.back - 10))).toEqual([]);
  });

  it("never covers a member's head where they stand by the region behind them", () => {
    const grid = walk();
    const shapes = fogShapes(grid, wallRule(grid), states({ [C]: "visible" }), HEIGHTS);
    // a member at the corridor's mouth (5, 2): room A, unexplored, lies behind them on screen
    for (const up of [20, 50, 80, FOG.stand - 4])
      for (const dx of [-12, 12]) {
        const head = onScreen(5, 2, up);
        expect(fogAt(shapes, { x: head.x + dx, y: head.y })).toEqual([]);
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
  const fog = new Fog(stage, grid, wallRule(grid), chunks, () => HEIGHTS);
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
    const shapes = fogShapes(grid, wallRule(grid), () => "visible", HEIGHTS);
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
