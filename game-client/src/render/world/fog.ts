/**
 * The fog of war's layer (FS-SRA9J §C, ADR-0063; CONTEXT.md "Fog of war"): on a dungeon floor, the
 * canvas's darkest ink over every unexplored region, a dim share of it over every explored one,
 * nothing over a visible one. Presentation only, like the light-map and the indoor blackout: it
 * never changes what anyone can see or hit.
 *
 * **Geometric, under both renderers** (§C.13), as the blackout's canvas fallback is: no mask, no
 * render texture, only filled polygons at {@link FOG}`.depth`, redrawn when a region's state changes
 * and never per frame.
 *
 * **One partition, never overlapping.** Phaser 4.2.1 multiplies a Graphics' alpha into each fill
 * on its own (`gameobjects/graphics/GraphicsWebGLRenderer.js:196`), so two dim fills over one px
 * would draw it darker. The fog is therefore cut so each screen px belongs to one cell's column,
 * as a painter would draw them: every cell an upright column on its diamond, the one nearest the
 * viewer winning a px. A drawn wall and a visible region's floor stand up as columns of their own
 * with no fog over them, so nothing in front of the fog's edge is ever covered; an unexplored or
 * explored floor lies flat. See {@link fogShapes}.
 *
 * **Few polygons, chunked.** Phaser earcuts every fill path each frame it renders
 * (`renderer/webgl/renderNodes/FillPath.js`, run from the Graphics renderer per frame), so the fog
 * merges each strip's like columns into one polygon, and cuts them into the floor's ground chunks
 * (FS-KE075 §H.45): a chunk's Graphics is drawn only while its chunk is near the camera.
 *
 * **What it does not cover, it hides or dims** (§C.8, §C.9, §C.11): a wall piece stands up out of
 * its diamond, so it is gated, not covered: hidden while every region it borders is unexplored,
 * tinted dim while the brightest is explored.
 */

import type Phaser from "phaser";
// by path, not the barrel: the barrel pulls in the Phaser drawing helpers
import { worldToScreen, type Point, type Rect } from "@/render/iso/projection";
import { mix, palette } from "@/utils/canvasPalette";
import { BLACKOUT } from "./blackout";
import type { ChunkVisibility, Toggle } from "./chunks";
import type { RegionGrid } from "./dungeon";
import type { ExplorationState } from "./exploration";
import type { PieceRule } from "./walls";

/** Phaser's untinted multiply: the identity, not a colour. */
const UNTINTED = 0xffffff;

/** How much fog a screen px has: none, the explored dim, or the unexplored dark. */
export type FogShade = "none" | "dim" | "dark";

const DIM_SHARE = 0.55;

export const FOG = {
  /**
   * The blackout's own (§C.13): over the world, the light-map (135), its halos (136) and world
   * effects (≥ 140); under the dust (902), the vignette (905), markers (950, 951) and the HUD.
   */
  depth: BLACKOUT.depth,
  /** The share of `palette.inkDeep` laid over an explored region (§C.9). */
  dim: DIM_SHARE,
  /** An explored wall piece's multiply tint: the same share of `palette.inkDeep` as its floor's. */
  dimTint: mix(UNTINTED, palette.inkDeep, DIM_SHARE),
  /**
   * Screen px a visible region's floor stands clear above its diamond: a delver's head (the
   * tallest baked crown is 93 px, plus the markers' 3 px gap), so a member by the region behind
   * them on screen is never covered by its fog (§C.18).
   */
  stand: 100,
  /** Screen px a drawn wall's column stands over its wall top: its corner posts (`BLACKOUT`). */
  headroom: 6,
} as const;

/** How tall the floor's walls stand, in screen px: full-height (back) and cut-away (front). */
export interface FogHeights {
  back: number;
  front: number;
}

/** One polygon of fog, in screen px. */
export interface FogShape {
  shade: Exclude<FogShade, "none">;
  points: Point[];
}

/** A region's state as a shade: the fog over its floor, the look of its wall. */
const SHADE: Record<ExplorationState, FogShade> = { visible: "none", explored: "dim", unexplored: "dark" };
const RANK: Record<ExplorationState, number> = { unexplored: 0, explored: 1, visible: 2 };

/**
 * The brightest state of the regions a wall cell borders (§C.11): its eight neighbours'. None for a
 * cell bordering no region.
 */
function bordering(
  grid: RegionGrid,
  cx: number,
  cy: number,
  state: (region: number) => ExplorationState,
): ExplorationState | undefined {
  let best: ExplorationState | undefined;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const id = grid.region(cx + dx, cy + dy);
      if (!id) continue;
      const s = state(id);
      if (!best || RANK[s] > RANK[best]) best = s;
    }
  return best;
}

/** A cell's column as the fog sees it: its shade, and how far it stands up on screen. */
interface Column {
  shade: FogShade;
  rise: number;
}

const FLAT_DARK: Column = { shade: "dark", rise: 0 };

/**
 * Every cell's column (§C.8–§C.11, §C.13): a visible region's floor clear and standing
 * {@link FOG}`.stand` px; an explored floor dim and flat; an unexplored floor, the void and off the
 * floor dark and flat. A wall cell clear and as tall as its piece (plus headroom) while drawn, its
 * piece dimming itself when explored; flat and dark while its piece is hidden (unexplored).
 */
function columnOf(
  grid: RegionGrid,
  rule: PieceRule,
  state: (region: number) => ExplorationState,
  heights: FogHeights,
): (cx: number, cy: number) => Column {
  return (cx, cy) => {
    const id = grid.region(cx, cy);
    if (id) {
      const s = state(id);
      return s === "visible" ? { shade: "none", rise: FOG.stand } : s === "explored" ? { shade: "dim", rise: 0 } : FLAT_DARK;
    }
    const s = bordering(grid, cx, cy, state);
    if (!s || s === "unexplored") return FLAT_DARK;
    const at = { x: (cx + 0.5) * grid.cell, y: (cy + 0.5) * grid.cell };
    return { shade: "none", rise: (rule.height(at) === "back" ? heights.back : heights.front) + FOG.headroom };
  };
}

/**
 * The fog over a dungeon floor, as polygons in screen px that never overlap (§C.13).
 *
 * The floor's diamonds cut the screen into vertical strips half a diamond wide; in a strip, each
 * cell has one half (a triangle), and the halves are stacked in the order a painter draws them,
 * back to front. A column standing `rise` px covers its half and the `rise` px above it; a screen
 * px goes to the frontmost column covering it. In the strip, the halves from index `s` on then own
 * exactly the px below `min over j ≥ s of (top_j − rise_j)`, the lower envelope of two families of
 * parallel lines (the halves' top edges slope one way or the other), so it is two numbers per
 * index, found back to front. A run of halves of one shade owns the px between its first index's
 * envelope and the next run's, one polygon of at most six corners.
 */
export function fogShapes(
  grid: RegionGrid,
  rule: PieceRule,
  state: (region: number) => ExplorationState,
  heights: FogHeights,
): FogShape[] {
  const column = columnOf(grid, rule, state, heights);
  const { x: w, y: hh } = worldToScreen(grid.cell, 0);
  const m = hh / w;
  // every index a strip may hold, and one past it each end: off the floor, dark and flat
  const sLo = -2;
  const sHi = grid.cols + grid.rows;
  const n = sHi - sLo + 1;
  const shapes: FogShape[] = [];
  const shade: FogShade[] = new Array(n);
  const rise = new Float64Array(n);
  const upA = new Float64Array(n + 1);
  const upB = new Float64Array(n + 1);

  for (let k = -grid.rows; k < grid.cols; k++) {
    // a half is the right half of the cell with cx − cy = k when s − k is even, else the left
    // half of the one with cx − cy = k + 1
    const right = (s: number) => (((s - k) % 2) + 2) % 2 === 0;
    for (let i = 0; i < n; i++) {
      const s = sLo + i;
      const cx = right(s) ? (s + k) / 2 : (s + k + 1) / 2;
      const cy = right(s) ? (s - k) / 2 : (s - k - 1) / 2;
      const inside = cx >= 0 && cy >= 0 && cx < grid.cols && cy < grid.rows;
      const col = inside ? column(cx, cy) : FLAT_DARK;
      shade[i] = col.shade;
      rise[i] = col.rise;
    }
    // the envelope from each index on: a + m·t over the right halves' tops, b − m·t the left's,
    // seeded by the flat halves past the end
    let a = Infinity;
    let b = Infinity;
    for (const s of [sHi + 1, sHi + 2]) {
      if (right(s)) a = Math.min(a, s * hh);
      else b = Math.min(b, s * hh + hh);
    }
    upA[n] = a;
    upB[n] = b;
    for (let i = n - 1; i >= 0; i--) {
      const s = sLo + i;
      if (right(s)) a = Math.min(a, s * hh - rise[i]);
      else b = Math.min(b, s * hh + hh - rise[i]);
      upA[i] = a;
      upB[i] = b;
    }
    for (let i = 0; i < n; ) {
      let j = i;
      while (j + 1 < n && shade[j + 1] === shade[i]) j++;
      const own = shade[i];
      if (own !== "none")
        for (const points of between(k * w, w, m, [upA[i], upB[i]], [upA[j + 1], upB[j + 1]]))
          shapes.push({ shade: own, points });
      i = j + 1;
    }
  }
  return shapes;
}

/**
 * The px of a strip from `x0`, `w` wide, between two envelopes `min(a + m·t, b − m·t)`, the upper
 * (smaller y) first: one polygon, or more where they pinch together. None where they meet.
 */
function between(x0: number, w: number, m: number, upper: [number, number], lower: [number, number]): Point[][] {
  const f = (t: number) => Math.min(upper[0] + m * t, upper[1] - m * t);
  const g = (t: number) => Math.min(lower[0] + m * t, lower[1] - m * t);
  const kinks = [upper, lower].map(([a, b]) => (b - a) / (2 * m)).filter((t) => t > 0 && t < w);
  const ts = [0, ...kinks, w].sort((p, q) => p - q).filter((t, i, all) => i === 0 || t - all[i - 1] > 1e-9);
  const out: Point[][] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length >= 2) {
      const top = run.map((t) => ({ x: x0 + t, y: f(t) }));
      const bottom = run.map((t) => ({ x: x0 + t, y: g(t) })).reverse();
      const points = [...top, ...bottom].filter(
        (p, i, all) => i === 0 || Math.abs(p.x - all[i - 1].x) + Math.abs(p.y - all[i - 1].y) > 1e-9,
      );
      if (area(points) > 0.01) out.push(points);
    }
    run = [];
  };
  for (const t of ts) {
    run.push(t);
    // a pinch ends one polygon and starts the next at the same point
    if (g(t) - f(t) <= 1e-9) {
      flush();
      run.push(t);
    }
  }
  flush();
  return out;
}

/** A polygon's area, by the shoelace. */
function area(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) sum += (points[j].x + points[i].x) * (points[j].y - points[i].y);
  return Math.abs(sum) / 2;
}

/** A polygon cut to an axis-aligned window (Sutherland–Hodgman: the window is convex). */
function clip(points: readonly Point[], win: { x0: number; y0: number; x1: number; y1: number }): Point[] {
  const edges: [(p: Point) => number][] = [
    [(p) => p.x - win.x0],
    [(p) => win.x1 - p.x],
    [(p) => p.y - win.y0],
    [(p) => win.y1 - p.y],
  ];
  let out = [...points];
  for (const [side] of edges) {
    if (out.length === 0) break;
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const p = input[i];
      const q = input[(i + 1) % input.length];
      const dp = side(p);
      const dq = side(q);
      if (dp >= 0) out.push(p);
      if (dp >= 0 !== dq >= 0) {
        const r = dp / (dp - dq);
        out.push({ x: p.x + (q.x - p.x) * r, y: p.y + (q.y - p.y) * r });
      }
    }
  }
  return out;
}

/** What the fog needs of a scene: somewhere to make its Graphics. A Phaser scene is one. */
export interface FogStage {
  add: { graphics(): Phaser.GameObjects.Graphics };
}

/** A wall piece, as its gate shows, hides and dims it: a sprite, or a placeholder block. */
export interface FogPart {
  setVisible(visible: boolean): unknown;
  setTint?(tint: number): unknown;
  clearTint?(): unknown;
}

/**
 * A wall piece's two keys (§C.8, §C.9, FS-KE075 §H.45): shown only while its ground chunk is near
 * the camera *and* some region it borders is not unexplored; tinted dim while the brightest of them
 * is explored. The chunk turns its key through {@link Toggle}; the fog turns the other.
 */
class FogGate implements Toggle {
  private near = true;
  private shade: FogShade = "none";

  constructor(
    private readonly part: FogPart,
    readonly cell: { cx: number; cy: number },
  ) {}

  setVisible(near: boolean): this {
    this.near = near;
    this.part.setVisible(near && this.shade !== "dark");
    return this;
  }

  shadeAs(shade: FogShade): void {
    if (shade === this.shade) return;
    const was = this.shade;
    this.shade = shade;
    this.part.setVisible(this.near && shade !== "dark");
    if (shade === "dim") this.part.setTint?.(FOG.dimTint);
    else if (was === "dim") this.part.clearTint?.();
  }
}

/**
 * A dungeon floor's fog (§C.13): one Graphics per ground chunk it covers, at {@link FOG}`.depth`,
 * shown and hidden with its chunk; and the gates on the floor's wall pieces. {@link show} redraws
 * only when some region's state differs from the last drawn.
 */
export class Fog {
  private readonly layers = new Map<number, Phaser.GameObjects.Graphics>();
  private readonly gates: FogGate[] = [];
  private drawn?: string;
  private state?: (region: number) => ExplorationState;
  private count = 0;

  constructor(
    private readonly stage: FogStage,
    private readonly grid: RegionGrid,
    private readonly rule: PieceRule,
    private readonly chunks: ChunkVisibility,
    private readonly heights: () => FogHeights,
  ) {}

  /** How many times the fog has been drawn. */
  get redraws(): number {
    return this.count;
  }

  /**
   * A wall piece standing at world point `at` under the fog: what its ground chunk toggles in its
   * stead (FS-KE075 §H.45). It takes the fog's shade at once.
   */
  gate(part: FogPart, at: Point): Toggle {
    const gate = new FogGate(part, this.grid.cellOf(at));
    this.gates.push(gate);
    if (this.state) this.shadeGate(gate, this.state);
    return gate;
  }

  /** Draws the fog for these region states, unless they are the ones drawn. True when it drew. */
  show(state: (region: number) => ExplorationState): boolean {
    const key = this.grid.regions.map((r) => state(r.id)[0]).join("");
    this.state = state;
    if (key === this.drawn) return false;
    this.drawn = key;
    this.count++;
    for (const gate of this.gates) this.shadeGate(gate, state);
    this.draw(fogShapes(this.grid, this.rule, state, this.heights()));
    return true;
  }

  /** Gone with its floor: its Graphics destroyed, its gates let go. */
  destroy(): void {
    for (const layer of this.layers.values()) layer.destroy();
    this.layers.clear();
    this.gates.length = 0;
    this.drawn = undefined;
    this.state = undefined;
  }

  private shadeGate(gate: FogGate, state: (region: number) => ExplorationState): void {
    const s = bordering(this.grid, gate.cell.cx, gate.cell.cy, state);
    // a piece bordering no region keeps the floor's plain look
    gate.shadeAs(s ? SHADE[s] : "none");
  }

  /** Each shape cut into the ground chunks it crosses, each chunk's Graphics drawn afresh. */
  private draw(shapes: readonly FogShape[]): void {
    const grid = this.chunks.grid;
    const byChunk = new Map<number, FogShape[]>();
    grid.rects.forEach((r, i) => {
      // the outer chunks reach on past the ground, so nothing at its edge goes undrawn
      const col = i % grid.cols;
      const row = Math.floor(i / grid.cols);
      const win = {
        x0: col === 0 ? -Infinity : r.x,
        x1: col === grid.cols - 1 ? Infinity : r.x + r.width,
        y0: row === 0 ? -Infinity : r.y,
        y1: row === grid.rows - 1 ? Infinity : r.y + r.height,
      };
      const mine: FogShape[] = [];
      for (const shape of shapes) {
        if (!overlaps(shape.points, win)) continue;
        const points = clip(shape.points, win);
        if (points.length >= 3 && area(points) > 0.01) mine.push({ shade: shape.shade, points });
      }
      if (mine.length > 0) byChunk.set(i, mine);
    });
    for (const [i, layer] of this.layers) if (!byChunk.has(i)) layer.clear();
    for (const [i, mine] of byChunk) {
      const layer = this.layer(i);
      layer.clear();
      for (const shade of ["dim", "dark"] as const) {
        layer.fillStyle(palette.inkDeep, shade === "dark" ? 1 : FOG.dim);
        for (const s of mine) if (s.shade === shade) layer.fillPoints(s.points as Phaser.Math.Vector2[], true);
      }
    }
  }

  /** Chunk `i`'s Graphics, made the first time it has fog to draw and shown with its chunk. */
  private layer(i: number): Phaser.GameObjects.Graphics {
    const made = this.layers.get(i);
    if (made) return made;
    const layer = this.stage.add.graphics().setDepth(FOG.depth);
    const r: Rect = this.chunks.grid.rects[i];
    this.chunks.add(layer, { x: r.x + r.width / 2, y: r.y + r.height / 2 });
    this.layers.set(i, layer);
    return layer;
  }
}

/** Whether a polygon's bounding box meets a window. */
function overlaps(points: readonly Point[], win: { x0: number; y0: number; x1: number; y1: number }): boolean {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return x1 > win.x0 && x0 < win.x1 && y1 > win.y0 && y0 < win.y1;
}
