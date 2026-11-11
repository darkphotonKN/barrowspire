import { describe, expect, it } from "vitest";
import type { FloorRegion, WallState } from "@/types/gameState";
import { worldToScreen, type Point } from "@/render/iso/projection";
import { ChunkGrid, ChunkVisibility } from "./chunks";
import { RegionGrid, wallRule, wallRuns } from "./dungeon";
import { Exploration, type ExplorationState } from "./exploration";
import { FOG, Fog, fogShapes, wallLayout, type FogHeights, type FogShape, type FogTweenConfig } from "./fog";
import { FEATHER, fogField } from "./fogField";
import { axisOf } from "./walls";
import fixture from "./dungeon.fixture.json";
import { mix, palette } from "@/utils/canvasPalette";
import { TINT_IDENTITY } from "@/utils/theme";

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

/** Whether a cell is a shell cell: not walkable, and 8-adjacent to a walkable one (FS-KE075 R7). */
const isShell = (grid: RegionGrid, cx: number, cy: number) =>
  !grid.walkable(cx, cy) &&
  [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => grid.walkable(cx + dx, cy + dy)));

/**
 * A floor's walls as the server lays them (levelgen `mergeWalls`): the shell's cells, each row cut
 * into runs, a run the same as the one above it carried on down; then cut into runs as the scene cuts them.
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
  const walls = rects.map((r, i) => ({
    entity_id: `w-${i}`,
    position: { x: r.x * CELL, y: r.y * CELL },
    width: r.w * CELL,
    height: r.h * CELL,
  }));
  return wallRuns(walls, grid);
}

/** The fixture floor's walls, as the scene cuts them into runs. */
const fixtureWalls = (): WallState[] => wallRuns((fixture as { walls: WallState[] }).walls, new RegionGrid(fixture as never));

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
    for (const [cx, cy] of [[2, 2], [4, 4], [7, 3], [12, 1], [14, 4]]) expect(fogAt(shapes, onScreen(cx, cy))).toEqual([DARK]);
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

  it("leaves a wall bordering a visible region clear, whatever is behind it", () => {
    const grid = split();
    const shapes = fogOf(grid, states({ [C]: "visible" }));
    // the wall on row 4 is low (walkable on both sides): the middle of its face is clear
    expect(fogAt(shapes, onScreen(3, 4, HEIGHTS.front / 2))).toEqual([]);
    // and the room behind it is veiled
    expect(fogAt(shapes, onScreen(3, 2))).toEqual([DARK]);
  });

  it("draws an unexplored region's walls, standing clear of the veil behind them, to be tinted as dark (owner playtest 2026-11-06)", () => {
    const grid = walk();
    const shapes = fogOf(grid, states({}));
    // room B's north wall, row 0, full height: clear over its face, feathering as the veil it is tinted to
    const face = onScreen(12, 0, HEIGHTS.back / 2);
    expect(fogAt(shapes, face)).toEqual([]);
    expect(partsAt(shapes, face).map((s) => s.equiv)).toEqual([DARK]);
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
    // every wall bordering a region is drawn, whatever its state (owner playtest 2026-11-06)
    void state;
    const drawn = (cx: number, cy: number) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (grid.region(cx + dx, cy + dy)) return true;
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
    // its front row's middle, and its next row all over: points off the seams between strips
    expect(fogAt(shapes, worldToScreen(4.55 * CELL, 4.5 * CELL))).toEqual([DARK]);
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
    const slabs = drawnSlabs(grid, walls, state, HEIGHTS);
    let fogged = 0;
    for (const cy of [0, 1, 2])
      for (const [fx, fy] of [[0.55, 0.5], [0.2, 0.75], [0.75, 0.2]]) {
        const p = worldToScreen((4 + fx) * CELL, (cy + fy) * CELL);
        const dark = fogAt(shapes, p).join() === String(DARK);
        if (dark) fogged++;
        // or behind a drawn wall: its slab, or a corner post where its strip ends (every wall
        // bordering a region now stands, the unexplored corridor's own too)
        else expect(slabs.some((q) => inside(p, q)) || partsAt(shapes, p).some((x) => x.alpha === 0 && x.equiv > 0)).toBe(true);
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

describe("a floor's wall layout, as the fog sees it (FS-KE075 §H.46)", () => {
  // room A's shell: corners at cells (0, 0), (5, 0), (0, 4), (5, 4), each the end of two runs
  const grid = floor(8, 6, [room(A, 1, 1, 4, 3)]);
  const layout = wallLayout(grid, shellWalls(grid));
  const LEFT = false;
  const RIGHT = true;

  it("stands a slab on both halves of a cell in the middle of a run", () => {
    expect([layout.axis(2, 0, LEFT), layout.axis(2, 0, RIGHT)]).toEqual(["x", "x"]);
    expect([layout.axis(0, 2, LEFT), layout.axis(0, 2, RIGHT)]).toEqual(["y", "y"]);
  });

  it("stands no slab past the post on a run's end cell: only the half the run's pieces are drawn on", () => {
    // on screen a cell's left half holds its low-x and its high-y half: at the north-west corner
    // the x run leaves the post on the right half and the y run on the left; at the north-east
    // both leave it on the left half, and nothing stands on the right
    expect([layout.axis(0, 0, LEFT), layout.axis(0, 0, RIGHT)]).toEqual(["y", "x"]);
    expect([layout.axis(5, 0, LEFT), layout.axis(5, 0, RIGHT)]).toEqual(["x", undefined]);
    expect([layout.axis(0, 4, LEFT), layout.axis(0, 4, RIGHT)]).toEqual([undefined, "x"]);
    expect([layout.axis(5, 4, LEFT), layout.axis(5, 4, RIGHT)]).toEqual(["x", "y"]);
  });

  it("keeps the post at each end cell", () => {
    for (const [cx, cy] of [[0, 0], [5, 0], [0, 4], [5, 4]]) expect(layout.post(cx, cy)).toBe(true);
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
  const fog = new Fog(stage, grid, wallRule(grid), chunks, () => HEIGHTS, wallLayout(grid, shellWalls(grid)));
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
          const sharp = fogAt(shapes, p)[0] ?? 0;
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
    fog.gate(piece, mid(12, 0));
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
    fog.gate(piece, mid(12, 0));
    fog.show(() => "unexplored");
    expect([piece.visible, piece.tint]).toEqual([true, FOG.unexplored.tint]);
    fog.show(states({ [B]: "explored" }));
    tweens.finish();
    expect([piece.visible, piece.tint]).toEqual([true, FOG.explored.tint]);
    fog.show(states({ [B]: "visible" }));
    tweens.finish();
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
    const gate = fog.gate(piece, mid(12, 0));
    fog.show(() => "visible");
    gate.setVisible(false);
    expect(piece.visible).toBe(false);
    gate.setVisible(true);
    expect(piece.visible).toBe(true);
  });
});
