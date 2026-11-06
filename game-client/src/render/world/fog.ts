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
import { TINT_IDENTITY } from "@/utils/theme";
import { BLACKOUT } from "./blackout";
import type { ChunkVisibility, Toggle } from "./chunks";
import type { WallState } from "@/types/gameState";
import type { RegionGrid } from "./dungeon";
import type { ExplorationState } from "./exploration";
import { axisOf, type PieceRule, type WallAxis } from "./walls";

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
  dimTint: mix(TINT_IDENTITY, palette.inkDeep, DIM_SHARE),
  /**
   * Screen px a visible region's floor stands clear above its diamond: a delver's head (the
   * tallest baked crown is 93 px, plus the markers' 3 px gap), so a member by the region behind
   * them on screen is never covered by its fog (§C.18).
   */
  stand: 100,
  /**
   * Screen px either side of a member's feet their head may reach: the delver sprites' crowns and
   * shoulders (§C.18).
   */
  girth: 12,
  /**
   * World px a member's feet stay off a cell no one can walk on: the server's `PlayerRadius`
   * (`game-service/common/constants/game.go`); a position drawn between two snapshots along one
   * wall keeps it too.
   */
  reach: 20,
  /** Screen px a drawn wall's slab stands clear over its wall top: its top face and cap. */
  headroom: 6,
  /**
   * Screen px a corner post stands clear over its wall top: its beam 0.12 tile over the wall, its
   * cap 0.08 more and the cap's top face behind it (`tools/bake/page/models/architecture.js`
   * `post`), about 13 px at `BAKE.VPX`.
   */
  post: 14,
  /** Screen px either side of a post's centre it covers: its cap, 0.3 tile square, on the diamond. */
  postHalf: 10,
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

/** How a dungeon floor's walls stand, cell by cell, as the fog needs them (§C.13). */
export interface WallLayout {
  /** The axis of the slab standing on cell (cx, cy), none where no wall does. */
  axis(cx: number, cy: number): WallAxis | undefined;
  /** Whether a corner post stands at cell (cx, cy)'s centre: where a wall strip ends. */
  post(cx: number, cy: number): boolean;
}

/**
 * A floor's wall layout from its one-cell wall strips (`stripWalls`): every piece of a strip is a
 * slab on its centreline from one end of the rect to the other, so each cell a strip covers carries
 * a slab along the strip's axis; its two posts stand at its end cells' centres (`planWalls`).
 */
export function wallLayout(grid: RegionGrid, strips: readonly WallState[]): WallLayout {
  const axes = new Uint8Array(grid.cols * grid.rows);
  const posts = new Uint8Array(grid.cols * grid.rows);
  const index = (cx: number, cy: number) =>
    cx >= 0 && cy >= 0 && cx < grid.cols && cy < grid.rows ? cy * grid.cols + cx : -1;
  const c = grid.cell;
  for (const w of strips) {
    const along = axisOf(w) === "x" ? 1 : 2;
    const cx0 = Math.round(w.position.x / c);
    const cy0 = Math.round(w.position.y / c);
    const cx1 = Math.max(cx0, Math.round((w.position.x + w.width) / c) - 1);
    const cy1 = Math.max(cy0, Math.round((w.position.y + w.height) / c) - 1);
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const i = index(cx, cy);
        if (i >= 0) axes[i] = along;
      }
    for (const i of [index(cx0, cy0), index(cx1, cy1)]) if (i >= 0) posts[i] = 1;
  }
  return {
    axis: (cx, cy) => {
      const i = index(cx, cy);
      return i < 0 || !axes[i] ? undefined : axes[i] === 1 ? "x" : "y";
    },
    post: (cx, cy) => {
      const i = index(cx, cy);
      return i >= 0 && posts[i] === 1;
    },
  };
}

/**
 * Where a member's feet can be on cell (cx, cy), on screen: the cell's square kept {@link FOG}
 * `.reach` world px off every cell no one can walk on (a wall's rect is the whole cell), its edges
 * for the cells beside it and its corners for the cells diagonal to it. A convex polygon.
 */
function feetOn(grid: RegionGrid, cx: number, cy: number): Point[] {
  const c = grid.cell;
  const r = FOG.reach;
  const open = (dx: number, dy: number) => grid.walkable(cx + dx, cy + dy);
  const x0 = cx * c + (open(-1, 0) ? 0 : r);
  const x1 = (cx + 1) * c - (open(1, 0) ? 0 : r);
  const y0 = cy * c + (open(0, -1) ? 0 : r);
  const y1 = (cy + 1) * c - (open(0, 1) ? 0 : r);
  // a corner cut where the cell diagonal to it is closed and the two beside it are open; the cut
  // (a chord, not the arc) keeps a little more than the body could reach, never less
  const cut = (dx: number, dy: number) => open(dx, 0) && open(0, dy) && !open(dx, dy);
  const world: Point[] = [];
  if (cut(-1, -1)) world.push({ x: x0, y: y0 + r }, { x: x0 + r, y: y0 });
  else world.push({ x: x0, y: y0 });
  if (cut(1, -1)) world.push({ x: x1 - r, y: y0 }, { x: x1, y: y0 + r });
  else world.push({ x: x1, y: y0 });
  if (cut(1, 1)) world.push({ x: x1, y: y1 - r }, { x: x1 - r, y: y1 });
  else world.push({ x: x1, y: y1 });
  if (cut(-1, 1)) world.push({ x: x0 + r, y: y1 }, { x: x0, y: y1 - r });
  else world.push({ x: x0, y: y1 });
  return world.map((p) => worldToScreen(p.x, p.y));
}

/**
 * The fog over a dungeon floor, as polygons in screen px that never overlap (§C.13).
 *
 * The floor's diamonds cut the screen into vertical strips half a diamond wide; in a strip, each
 * cell has one half (a triangle), and the halves are stacked in the order a painter draws them,
 * back to front. Each half claims its triangle and whatever stands up from it: the px under its
 * top, `min(a + m·t, b − m·t)` over the strip (`t` from its left side), the lower of one line in
 * each family of the floor's two slopes. A screen px goes to the frontmost half claiming it. In the
 * strip, the halves from index `s` on then own exactly the px below the lower envelope of every
 * top from `s` on, two numbers per index, found back to front. A run of halves of one shade owns
 * the px between its first index's envelope and the next run's, one polygon of at most six corners.
 *
 * What stands up is cut to what is there, so the fog leaves clear only what stands in front of it:
 * - **a drawn wall** claims its slab, a thin wall on its cell's centreline from edge to edge
 *   (`tools/bake/page/models/architecture.js`), raised to its height plus {@link FOG}`.headroom`,
 *   and its corner post where a strip ends, raised {@link FOG}`.post` over the wall top. A slab
 *   runs from a cell's centre to the middle of its edge, so the strip is cut at its middle, where
 *   one ends, and either side of a post, as wide as {@link FOG}`.postHalf`; in each part a slab or
 *   a post is one line of a family;
 * - **a visible region's floor** claims the head of a member standing anywhere their feet can be
 *   on it (`feetOn`): {@link FOG}`.stand` px over the feet, {@link FOG}`.girth` px either side.
 */
export function fogShapes(
  grid: RegionGrid,
  rule: PieceRule,
  state: (region: number) => ExplorationState,
  heights: FogHeights,
  walls: WallLayout,
): FogShape[] {
  const { x: w, y: hh } = worldToScreen(grid.cell, 0);
  const m = hh / w;
  const mid = w / 2;
  const ph = Math.min(FOG.postHalf, mid);
  const feet = new Map<number, Point[]>();
  const feetOf = (cx: number, cy: number) => {
    const key = cy * grid.cols + cx;
    let f = feet.get(key);
    if (!f) feet.set(key, (f = feetOn(grid, cx, cy)));
    return f;
  };
  // every index a strip may hold, and one past it each end: off the floor, dark and flat
  const sLo = -2;
  const sHi = grid.cols + grid.rows;
  const n = sHi - sLo + 1;
  const shapes: FogShape[] = [];
  const cells: Half[] = new Array(n);
  const A = new Float64Array(n);
  const B = new Float64Array(n);
  const upA = new Float64Array(n + 1);
  const upB = new Float64Array(n + 1);

  for (let k = -grid.rows; k < grid.cols; k++) {
    const x0 = k * w;
    let open: Band[] = [];
    let bands: Band[] = [];
    // a half is the right half of the cell with cx − cy = k when s − k is even, else the left
    // half of the one with cx − cy = k + 1
    const right = (s: number) => (((s - k) % 2) + 2) % 2 === 0;
    // the strip is cut at its middle, either side of a post, and where the heads over a cell's
    // feet change course, so each part's slab, post and heads are each one line
    const cuts = new Set([0, mid, w]);
    for (let i = 0; i < n; i++) {
      const s = sLo + i;
      const r = right(s);
      const cx = r ? (s + k) / 2 : (s + k + 1) / 2;
      const cy = r ? (s - k) / 2 : (s - k - 1) / 2;
      const half = halfOf(grid, rule, state, heights, walls, cx, cy, r, s * hh);
      cells[i] = half;
      if (half.post !== undefined) for (const t of half.right ? [ph] : [w - ph]) cuts.add(t);
      if (half.stand) for (const t of peaks(feetOf(half.stand.cx, half.stand.cy))) if (t > x0 + 1e-6 && t < x0 + w - 1e-6) cuts.add(Math.round((t - x0) * 1e6) / 1e6);
    }
    const parts = [...cuts].sort((p, q) => p - q);
    for (let p = 0; p + 1 < parts.length; p++) {
      const t0 = parts[p];
      const t1 = parts[p + 1];
      for (let i = 0; i < n; i++) {
        const top = topOf(cells[i], t0, t1, { x0, m, hh, w, mid, ph }, feetOf);
        A[i] = top[0];
        B[i] = top[1];
      }
      // the envelope from each index on, seeded by the flat halves past the end
      let a = Infinity;
      let b = Infinity;
      for (const s of [sHi + 1, sHi + 2]) {
        if (right(s)) a = Math.min(a, s * hh);
        else b = Math.min(b, s * hh + hh);
      }
      upA[n] = a;
      upB[n] = b;
      for (let i = n - 1; i >= 0; i--) {
        a = Math.min(a, A[i]);
        b = Math.min(b, B[i]);
        upA[i] = a;
        upB[i] = b;
      }
      // the part's own frame: t from its left side
      const at = (i: number): [number, number] => [upA[i] + m * t0, upB[i] - m * t0];
      for (let i = 0; i < n; ) {
        let j = i;
        while (j + 1 < n && cells[j + 1].shade === cells[i].shade) j++;
        const own = cells[i].shade;
        if (own !== "none") for (const band of between(x0 + t0, t1 - t0, m, at(i), at(j + 1))) bands.push({ shade: own, ...band });
        i = j + 1;
      }
      // a band carried on from the part before, where its two corners meet this one's, is one
      open = carry(open, bands, shapes);
      bands = [];
    }
    for (const band of open) emit(band, shapes);
  }
  return shapes;
}

/** A band of fog across one or more parts of a strip: its top and bottom, left to right. */
interface Band {
  shade: Exclude<FogShade, "none">;
  top: Point[];
  bottom: Point[];
}

const meets = (p: Point, q: Point) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y) < 1e-6;

/** The bands open after a part: each of its own, joined onto an open one it carries on; the rest emitted. */
function carry(open: Band[], next: readonly Band[], shapes: FogShape[]): Band[] {
  const still: Band[] = [];
  const left = new Set(open);
  for (const band of next) {
    const on = [...left].find(
      (o) => o.shade === band.shade && meets(o.top[o.top.length - 1], band.top[0]) && meets(o.bottom[o.bottom.length - 1], band.bottom[0]),
    );
    if (on) {
      left.delete(on);
      on.top.push(...band.top.slice(1));
      on.bottom.push(...band.bottom.slice(1));
      still.push(on);
    } else still.push({ ...band, top: [...band.top], bottom: [...band.bottom] });
  }
  for (const o of left) emit(o, shapes);
  return still;
}

/** A band as one polygon, its repeated and straight-through corners dropped. */
function emit(band: Band, shapes: FogShape[]): void {
  const ring = [...band.top, ...[...band.bottom].reverse()];
  const points: Point[] = [];
  for (const p of ring) if (points.length === 0 || !meets(points[points.length - 1], p)) points.push(p);
  if (points.length > 1 && meets(points[0], points[points.length - 1])) points.pop();
  for (let i = 0; i < points.length && points.length > 3; ) {
    const a = points[(i + points.length - 1) % points.length];
    const b = points[i];
    const c = points[(i + 1) % points.length];
    if (Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) < 1e-6) points.splice(i, 1);
    else i++;
  }
  if (points.length >= 3 && area(points) > 0.01) shapes.push({ shade: band.shade, points });
}

/**
 * Where the heads over a cell's feet change course on screen: under their top corners (one, or
 * the two ends of a level top edge), and {@link FOG}`.girth` px past their two sides, where no head
 * reaches.
 */
function peaks(points: readonly Point[]): number[] {
  const top = Math.min(...points.map((p) => p.y));
  const xs = points.map((p) => p.x);
  return [
    ...points.filter((p) => p.y - top < 1e-6).map((p) => p.x),
    Math.min(...xs) - FOG.girth,
    Math.max(...xs) + FOG.girth,
  ];
}

/** A half of one cell as the fog sees it, in its strip. */
interface Half {
  shade: FogShade;
  /** The right half of its cell (its centre at the strip's left side), or the left. */
  right: boolean;
  /** The y of its top corner, on its strip's left (right half) or right side (left half). */
  y: number;
  /** A drawn wall's slab: its axis and how far it stands over the centreline. */
  slab?: { axis: WallAxis; rise: number };
  /** A drawn wall's post at its centre: how far it stands over the centre. */
  post?: number;
  /** A visible region's cell, where a member may stand. */
  stand?: { cx: number; cy: number };
}

/**
 * Cell (cx, cy)'s half (§C.8–§C.11): a visible region's floor clear, where a member may stand; an
 * explored floor dim; an unexplored floor, the void and off the floor dark. A wall cell clear while
 * its piece is drawn (explored: its piece dims itself), standing as its slab and post; dark and
 * flat while its piece is hidden (unexplored).
 */
function halfOf(
  grid: RegionGrid,
  rule: PieceRule,
  state: (region: number) => ExplorationState,
  heights: FogHeights,
  walls: WallLayout,
  cx: number,
  cy: number,
  right: boolean,
  y: number,
): Half {
  const inside = cx >= 0 && cy >= 0 && cx < grid.cols && cy < grid.rows;
  if (!inside) return { shade: "dark", right, y };
  const id = grid.region(cx, cy);
  if (id) {
    const s = state(id);
    return s === "visible" ? { shade: "none", right, y, stand: { cx, cy } } : { shade: SHADE[s], right, y };
  }
  const s = bordering(grid, cx, cy, state);
  if (!s || s === "unexplored") return { shade: "dark", right, y };
  const wall = rule.height({ x: (cx + 0.5) * grid.cell, y: (cy + 0.5) * grid.cell }) === "back" ? heights.back : heights.front;
  const axis = walls.axis(cx, cy);
  return {
    shade: "none",
    right,
    y,
    slab: axis ? { axis, rise: wall + FOG.headroom } : undefined,
    post: walls.post(cx, cy) ? wall + FOG.post : undefined,
  };
}

/** A strip's measures: its left side's x, the slope, a half diamond's height and width, its middle and a post's half width. */
interface Frame {
  x0: number;
  m: number;
  hh: number;
  w: number;
  mid: number;
  ph: number;
}

/**
 * A half's top over the part `[t0, t1]` of its strip, as the two intercepts `[a, b]`: its own top
 * edge, and what stands up from it there.
 */
function topOf(
  half: Half,
  t0: number,
  t1: number,
  f: Frame,
  feetOf: (cx: number, cy: number) => Point[],
): [number, number] {
  const { m, hh, w, mid, ph } = f;
  // its top edge: a right half's falls from its top corner, a left half's rises to it
  let a = half.right ? half.y : Infinity;
  let b = half.right ? Infinity : half.y + hh;
  // its centre: the strip's left side for a right half, its right side for a left half
  const tc = half.right ? 0 : w;
  const yc = half.y + hh;
  const inner = half.right ? t1 <= mid : t0 >= mid;
  if (half.slab && inner) {
    // the slab's line through the centre: along x it falls left to right, along y it rises
    if (half.slab.axis === "x") a = Math.min(a, yc - m * tc - half.slab.rise);
    else b = Math.min(b, yc + m * tc - half.slab.rise);
  }
  if (half.post !== undefined && t0 < tc + ph && t1 > tc - ph) {
    // the post's top, flat over its width: a line under it from one end of the part to the other
    a = Math.min(a, yc - half.post - m * Math.min(t1, tc + ph));
  }
  if (half.stand) {
    const line = standOver(feetOf(half.stand.cx, half.stand.cy), t0, t1, f);
    if (line) {
      // the family that claims less over its own top edge
      const own = (t: number) => Math.min(a + m * t, b - m * t);
      const over = (l: (t: number) => number) => excess(own(t0) - l(t0), own(t1) - l(t1), t1 - t0);
      const viaA = line.a === Infinity ? Infinity : over((t) => line.a + m * t);
      const viaB = line.b === Infinity ? Infinity : over((t) => line.b - m * t);
      if (viaA <= viaB) a = Math.min(a, line.a);
      else b = Math.min(b, line.b);
    }
  }
  return [a, b];
}

/** The area where a linear `d` (from `d0` to `d1` over a width) is above zero, under it. */
function excess(d0: number, d1: number, width: number): number {
  if (d0 <= 0 && d1 <= 0) return 0;
  if (d0 >= 0 && d1 >= 0) return ((d0 + d1) / 2) * width;
  const pos = Math.max(d0, d1);
  return ((pos * pos) / (Math.abs(d0) + Math.abs(d1)) / 2) * width;
}

/**
 * The lowest line of each family over the part `[t0, t1]` of a strip that stays over every head
 * standing on these feet: {@link FOG}`.stand` px over a foot, {@link FOG}`.girth` px either side of
 * it. None where no head reaches the part.
 */
function standOver(feet: readonly Point[], t0: number, t1: number, f: Frame): { a: number; b: number } | undefined {
  const g = FOG.girth;
  const X0 = f.x0 + t0;
  const X1 = f.x0 + t1;
  // where the worst x of a head over the part stops moving with the foot
  const breaks = [X0 - g, X0 + g, X1 - g, X1 + g].sort((p, q) => p - q);
  let a = Infinity;
  let b = Infinity;
  for (let i = 0; i + 1 < breaks.length; i++) {
    if (breaks[i + 1] - breaks[i] <= 1e-9) continue;
    const band = clip(feet, { x0: breaks[i], x1: breaks[i + 1], y0: -Infinity, y1: Infinity });
    for (const p of band) {
      // a head only touching the part's side does not reach into it
      if (p.x - g >= X1 - 1e-9 || p.x + g <= X0 + 1e-9) continue;
      const head = p.y - FOG.stand;
      // a head spans x ± girth: a falling line is highest at its right end, a rising at its left
      a = Math.min(a, head - f.m * (Math.min(p.x + g, X1) - f.x0));
      b = Math.min(b, head + f.m * (Math.max(p.x - g, X0) - f.x0));
    }
  }
  return a === Infinity && b === Infinity ? undefined : { a, b };
}

/**
 * The px of a strip from `x0`, `w` wide, between two envelopes `min(a + m·t, b − m·t)`, the upper
 * (smaller y) first: one band, or more where they pinch together. None where they meet.
 */
function between(x0: number, w: number, m: number, upper: [number, number], lower: [number, number]): Omit<Band, "shade">[] {
  const f = (t: number) => Math.min(upper[0] + m * t, upper[1] - m * t);
  const g = (t: number) => Math.min(lower[0] + m * t, lower[1] - m * t);
  const kinks = [upper, lower].map(([a, b]) => (b - a) / (2 * m)).filter((t) => t > 0 && t < w);
  const ts = [0, ...kinks, w].sort((p, q) => p - q).filter((t, i, all) => i === 0 || t - all[i - 1] > 1e-9);
  const out: Omit<Band, "shade">[] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length >= 2) {
      const top = run.map((t) => ({ x: x0 + t, y: f(t) }));
      const bottom = run.map((t) => ({ x: x0 + t, y: g(t) }));
      if (area([...top, ...[...bottom].reverse()]) > 0.01) out.push({ top, bottom });
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
 * A standing piece's two keys (§C.8, §C.9, FS-KE075 §H.45): shown only while its ground chunk is
 * near the camera *and* the fog does not hide it; tinted dim while the fog says so. The chunk turns
 * its key through {@link nearCamera} (behind the {@link Toggle} that {@link Fog.gate} hands it);
 * the fog turns the other through {@link shadeAs}.
 */
class FogGate {
  private near = true;
  private shade: FogShade = "none";

  constructor(
    private readonly part: FogPart,
    readonly cell: { cx: number; cy: number },
  ) {}

  /** Its ground chunk's key: whether the chunk is near the camera. */
  nearCamera(near: boolean): void {
    this.near = near;
    this.part.setVisible(near && this.shade !== "dark");
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
    private readonly walls: WallLayout,
  ) {}

  /** How many times the fog has been drawn. */
  get redraws(): number {
    return this.count;
  }

  /**
   * A wall piece or run dressing standing at world point `at` under the fog: what its ground chunk
   * toggles in its stead (FS-KE075 §H.45). It takes the fog's shade at once.
   */
  gate(part: FogPart, at: Point): Toggle {
    const gate = new FogGate(part, this.grid.cellOf(at));
    this.gates.push(gate);
    if (this.state) this.shadeGate(gate, this.state);
    // a chunk shows and hides what stands in it; for a gated piece, that is "near the camera"
    return { setVisible: (near: boolean) => gate.nearCamera(near) };
  }

  /** Draws the fog for these region states, unless they are the ones drawn. True when it drew. */
  show(state: (region: number) => ExplorationState): boolean {
    const key = this.grid.regions.map((r) => state(r.id)[0]).join("");
    this.state = state;
    if (key === this.drawn) return false;
    this.drawn = key;
    this.count++;
    for (const gate of this.gates) this.shadeGate(gate, state);
    this.draw(fogShapes(this.grid, this.rule, state, this.heights(), this.walls));
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

  /**
   * A wall piece takes the brightest region it borders; a piece on a region's floor (run dressing)
   * that region's state, hidden while unexplored and never tinted, since the fog over its floor
   * dims it already. A piece bordering no region keeps the floor's plain look.
   */
  private shadeGate(gate: FogGate, state: (region: number) => ExplorationState): void {
    const { cx, cy } = gate.cell;
    const own = this.grid.region(cx, cy);
    if (own) {
      gate.shadeAs(state(own) === "unexplored" ? "dark" : "none");
      return;
    }
    const s = bordering(this.grid, cx, cy, state);
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
