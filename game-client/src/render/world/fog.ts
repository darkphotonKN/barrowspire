/**
 * The fog of war's layer (FS-SRA9J §C, ADR-0063, ADR-0068; CONTEXT.md "Fog of war"): on a dungeon
 * floor, a dense veil of the canvas's darkest ink over every unexplored region, a lighter one over
 * every explored one, nothing over a visible one. The floor and walls under a veil are drawn, so the
 * layout reads faintly through it (owner playtest 2026-11-06). Presentation only, like the
 * light-map and the indoor blackout: it never changes what anyone can see or hit.
 *
 * **One partition, never overlapping.** The fog is cut so each screen px belongs to one cell's
 * column, as a painter would draw them: every cell an upright column on its diamond, the one
 * nearest the viewer winning a px. A drawn wall and a visible region's floor stand up as columns of
 * their own with no fog over them, so nothing in front of the fog's edge is ever covered, and a
 * translucent veil never lies over a px twice; an unexplored or explored floor lies flat. See
 * {@link fogShapes}.
 *
 * **Feathered, on a lattice** (`fogField.ts`): the partition is laid on a lattice of
 * {@link FEATHER}`.texel` px and feathered inward from every lighter edge, so no edge cuts hard and
 * nothing the partition keeps clear is covered. Each ground chunk (FS-KE075 §H.45) paints its part
 * into a canvas texture, drawn smooth between texels, under both renderers; only a chunk near the
 * camera is painted, and only when its part changed. Nothing is rebuilt per frame.
 *
 * **Faded, never popped** (owner playtest 2026-11-06): a region's change of state is eased over
 * {@link FOG}`.fade` ms on the scene's clock. Fog that comes eases in over the world; fog that
 * lifts eases out at {@link FOG}`.floorDepth`, under everything that stands, so a member stepping
 * into a veiled region is never veiled. A wall's tint eases with it.
 *
 * **What it does not cover, it tints or hides** (§C.8, §C.9, §C.11): a wall piece stands up out of
 * its diamond, so it is tinted, not covered, as dark as the veil of the brightest region it borders;
 * run dressing on a region's floor is hidden while its region is unexplored.
 */

// by path, not the barrel: the barrel pulls in the Phaser drawing helpers
import { worldToScreen, type Point, type Rect } from "@/render/iso/projection";
import { mix, palette } from "@/utils/canvasPalette";
import { TINT_IDENTITY } from "@/utils/theme";
import { BLACKOUT } from "./blackout";
import type { ChunkVisibility, Toggle } from "./chunks";
import type { RegionGrid, WallPlan } from "./dungeon";
import type { ExplorationState } from "./exploration";
import { FEATHER, fieldWindow, fogField, type FieldShape, type FieldWindow } from "./fogField";
import { intoWall, wallward, type WallAxis, type WallHeight } from "./walls";

/** A veil: the share of `palette.inkDeep` laid over a region's ground, and its walls' multiply tint. */
export interface Veil {
  alpha: number;
  tint: number;
}

const veil = (alpha: number): Veil => ({ alpha, tint: mix(TINT_IDENTITY, palette.inkDeep, alpha) });

export const FOG = {
  /**
   * The blackout's own (§C.13): over the world, the light-map (135), its halos (136) and world
   * effects (≥ 140); under the dust (902), the vignette (905), markers (950, 951) and the HUD.
   */
  depth: BLACKOUT.depth,
  /**
   * Where a lifting veil fades out (owner playtest 2026-11-06): over the ground (−1), the mist
   * (−0.5) and the trails' beds (0), under every standing thing (`WORLD_DEPTH`, 100), so it never
   * lies over a member.
   */
  floorDepth: 1,
  /**
   * An unexplored region's veil (§C.8): dense, darker than the explored one but not opaque, so its
   * ground and walls read faintly through it. Tune here.
   */
  unexplored: veil(0.8),
  /** An explored region's veil (§C.9): the lighter dim. Tune here. */
  explored: veil(0.55),
  /** The void and off the floor: the darkest ink, opaque, as the canvas round the floor is. */
  void: 1,
  /** Milliseconds a region's change of state eases over, fog and wall tint alike. Tune here. */
  fade: 320,
  /**
   * Chunks near the camera but out of its view painted a frame while the fade's counter runs: a
   * change is painted at once only where it is seen, the rest before the camera reaches it.
   */
  paints: 3,
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

/**
 * One polygon of the fog's partition, in screen px: its veil's alpha (0 where it is clear) and the
 * alpha it feathers as, a drawn wall's being its tint's (`fogField.ts`).
 */
export type FogShape = FieldShape;

/** A region's state as the veil over its floor, and the tint of the walls it is the brightest of. */
const VEIL: Record<ExplorationState, number> = { visible: 0, explored: FOG.explored.alpha, unexplored: FOG.unexplored.alpha };
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

/**
 * A drawn wall on one of a half's outer sides, as the fog leaves it clear (FS-XK2B6 §F.18): one
 * cell's length of an edge run.
 */
export interface WallSlab {
  /** The world axis it runs along: on screen a line falling left to right along x, rising along y. */
  axis: WallAxis;
  /** A screen point of its centre line at its foot: half its thickness from its edge, in its wall cell. */
  foot: Point;
  height: WallHeight;
}

/** A post where edge runs end, as the half that claims it leaves it clear (FS-XK2B6 §F.18). */
export interface WallPostClaim {
  /** Its place on screen, at its foot. */
  foot: Point;
  height: WallHeight;
}

/** How a dungeon floor's walls stand, half by half, as the fog needs them (§C.13, FS-XK2B6 §F). */
export interface WallLayout {
  /** The slabs standing on one half of cell (cx, cy), its right half on screen or its left: one per family at most. */
  slabs(cx: number, cy: number, right: boolean): readonly WallSlab[];
  /** The posts one half of cell (cx, cy) claims. */
  posts(cx: number, cy: number, right: boolean): readonly WallPostClaim[];
}

const NONE: readonly never[] = [];

/**
 * A dungeon floor's wall layout from its wall plan (`wallPlan`, FS-XK2B6 §A, §F): a slab over each
 * wall edge and a claim on each post, nothing through a cell's middle.
 *
 * On screen a cell's north and east edges are the two outer sides of its right half, its west and
 * south edges those of its left half: so an edge's slab is one line across the whole half its wall
 * cell has on that side, and a half holds at most two, one per slope family.
 *
 * A post stands at a cell corner, which lies on the side between two strips, set off at most
 * 7.68 px either way, so its claim reaches into both. In each strip three halves meet at the
 * corner, back to front: the one whose bottom corner it is, the one beside it, the one whose top
 * corner it is. The post goes to the frontmost of them whose cell no one walks on: in front of
 * every veiled floor its px could fall on, and never a walkable half, whose veil would lie over it.
 * A strip whose three halves are all walkable has no claim: the post's footprint does not reach
 * into it, only the edge of its cap, under 2 px.
 */
export function wallLayout(grid: RegionGrid, plan: Pick<WallPlan, "runs" | "posts">): WallLayout {
  const c = grid.cell;
  const slabs = new Map<string, WallSlab[]>();
  const posts = new Map<string, WallPostClaim[]>();
  const key = (cx: number, cy: number, right: boolean) => `${cx},${cy},${right ? "r" : "l"}`;
  const add = <T>(map: Map<string, T[]>, k: string, v: T) => map.set(k, [...(map.get(k) ?? []), v]);

  for (const run of plan.runs) {
    const across = run.axis === "x" ? "y" : "x";
    const line = run.from[across];
    // the wall cells' lane: past the line when they lie south or east of it, before it otherwise
    const lane = line / c - (wallward(run.wallSide) > 0 ? 0 : 1);
    // a wall cell's north side (its cells south of the line) and east side (west of it) are its right half's
    const right = run.wallSide === "south" || run.wallSide === "west";
    for (let at = run.from[run.axis]; at < run.to[run.axis]; at += c) {
      const k = Math.round(at / c);
      const [cx, cy] = run.axis === "x" ? [k, lane] : [lane, k];
      const mid = at + c / 2;
      const centre = intoWall(run.axis === "x" ? { x: mid, y: line } : { x: line, y: mid }, [run.wallSide], run.thickness);
      const foot = worldToScreen(centre.x, centre.y);
      add(slabs, key(cx, cy, right), { axis: run.axis, foot, height: run.height });
    }
  }

  for (const post of plan.posts) {
    const gx = Math.round(post.corner.x / c);
    const gy = Math.round(post.corner.y / c);
    const claim = { foot: worldToScreen(post.at.x, post.at.y), height: post.height };
    // the halves meeting at the corner in the strip left of it and the one right of it, front to back
    const strips: (readonly [number, number, boolean])[][] = [
      [[gx, gy, false], [gx - 1, gy, true], [gx - 1, gy - 1, false]],
      [[gx, gy, true], [gx, gy - 1, false], [gx - 1, gy - 1, true]],
    ];
    for (const halves of strips) {
      const front = halves.find(([cx, cy]) => !grid.walkable(cx, cy));
      if (front) add(posts, key(...front), claim);
    }
  }

  return {
    slabs: (cx, cy, right) => slabs.get(key(cx, cy, right)) ?? NONE,
    posts: (cx, cy, right) => posts.get(key(cx, cy, right)) ?? NONE,
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
 * The fog's partition of a dungeon floor, as polygons in screen px that never overlap (§C.13): the
 * veiled ones and the drawn walls' clear columns, which the feather reads (`fogField.ts`).
 *
 * The floor's diamonds cut the screen into vertical strips half a diamond wide; in a strip, each
 * cell has one half (a triangle), and the halves are stacked in the order a painter draws them,
 * back to front. Each half claims its triangle and whatever stands up from it: the px under its
 * top, `min(a + m·t, b − m·t)` over the strip (`t` from its left side), the lower of one line in
 * each family of the floor's two slopes. A screen px goes to the frontmost half claiming it. In the
 * strip, the halves from index `s` on then own exactly the px below the lower envelope of every
 * top from `s` on, two numbers per index, found back to front. A run of halves of one veil owns
 * the px between its first index's envelope and the next run's, one polygon of at most six corners.
 *
 * What stands up is cut to what is there, so the fog leaves clear only what stands in front of it:
 * - **a drawn wall** (FS-XK2B6 §F) claims a slab over each of its wall cell's edges that is a side
 *   of the half: the wall's centre line, half its thickness from the edge, raised to its height
 *   plus {@link FOG}`.headroom`, one line of a family across the whole half; and each post the half
 *   claims (`wallLayout`), raised {@link FOG}`.post` over its wall top, peaked over its middle as
 *   its cap is and {@link FOG}`.postHalf` px either side of it. The strip is cut at a post's middle
 *   and either side of it, so in each part a post is one line of a family;
 * - **a visible region's floor** claims the head of a member standing anywhere their feet can be
 *   on it (`feetOn`): {@link FOG}`.stand` px over the feet, {@link FOG}`.girth` px either side.
 */
export function fogShapes(
  grid: RegionGrid,
  state: (region: number) => ExplorationState,
  heights: FogHeights,
  walls: WallLayout,
): FogShape[] {
  const { x: w, y: hh } = worldToScreen(grid.cell, 0);
  const m = hh / w;
  const ph = FOG.postHalf;
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
    // the strip is cut at a post's middle and either side of it, and where the heads over a cell's
    // feet change course, so each part's post and heads are each one line
    const cuts = new Set([0, w]);
    const cut = (t: number) => {
      if (t > 1e-6 && t < w - 1e-6) cuts.add(Math.round(t * 1e6) / 1e6);
    };
    for (let i = 0; i < n; i++) {
      const s = sLo + i;
      const r = right(s);
      const cx = r ? (s + k) / 2 : (s + k + 1) / 2;
      const cy = r ? (s - k) / 2 : (s - k - 1) / 2;
      const half = halfOf(grid, state, heights, walls, cx, cy, r, s * hh);
      cells[i] = half;
      for (const post of half.posts) for (const t of [post.x - ph, post.x, post.x + ph]) cut(t - x0);
      if (half.stand) for (const t of peaks(feetOf(half.stand.cx, half.stand.cy))) cut(t - x0);
    }
    const parts = [...cuts].sort((p, q) => p - q);
    for (let p = 0; p + 1 < parts.length; p++) {
      const t0 = parts[p];
      const t1 = parts[p + 1];
      for (let i = 0; i < n; i++) {
        const top = topOf(cells[i], t0, t1, { x0, m, hh, ph }, feetOf);
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
        while (j + 1 < n && same(cells[j + 1], cells[i])) j++;
        const { alpha, equiv } = cells[i];
        if (alpha > 0 || equiv > 0) for (const band of between(x0 + t0, t1 - t0, m, at(i), at(j + 1))) bands.push({ alpha, equiv, ...band });
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

/** Whether two halves lie under one veil and feather alike, so one polygon may hold both. */
const same = (p: { alpha: number; equiv: number }, q: { alpha: number; equiv: number }) => p.alpha === q.alpha && p.equiv === q.equiv;

/** A band of the partition across one or more parts of a strip: its top and bottom, left to right. */
interface Band {
  alpha: number;
  equiv: number;
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
      (o) => same(o, band) && meets(o.top[o.top.length - 1], band.top[0]) && meets(o.bottom[o.bottom.length - 1], band.bottom[0]),
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
  if (points.length >= 3 && area(points) > 0.01) shapes.push({ alpha: band.alpha, equiv: band.equiv, points });
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
  /** The veil over it (0 clear), and the veil it feathers as: a drawn wall's tint share. */
  alpha: number;
  equiv: number;
  /** The right half of its cell (its centre at the strip's left side), or the left. */
  right: boolean;
  /** The y of its top corner, on its strip's left (right half) or right side (left half). */
  y: number;
  /** The drawn walls on its outer sides: each a line of its axis's family through its top on screen. */
  slabs: readonly { axis: WallAxis; top: Point }[];
  /** The posts it claims: each the screen point over its foot at its top. */
  posts: readonly Point[];
  /** A visible region's cell, where a member may stand. */
  stand?: { cx: number; cy: number };
}

/**
 * Cell (cx, cy)'s half (§C.8–§C.11): a visible region's floor clear, where a member may stand; an
 * explored or unexplored floor under its veil; the void and off the floor opaque. A wall cell
 * bordering any region is not veiled, so its walls' feet and thickness are never covered (FS-XK2B6
 * §F.19), and its half stands clear as the slabs on its sides and the posts it claims, its pieces
 * tinted to the veil of the brightest region it borders, which it feathers as.
 */
function halfOf(
  grid: RegionGrid,
  state: (region: number) => ExplorationState,
  heights: FogHeights,
  walls: WallLayout,
  cx: number,
  cy: number,
  right: boolean,
  y: number,
): Half {
  const inside = cx >= 0 && cy >= 0 && cx < grid.cols && cy < grid.rows;
  const flat = { right, y, slabs: NONE, posts: NONE };
  if (!inside) return { alpha: FOG.void, equiv: FOG.void, ...flat };
  const id = grid.region(cx, cy);
  if (id) {
    const s = state(id);
    return s === "visible" ? { alpha: 0, equiv: 0, ...flat, stand: { cx, cy } } : { alpha: VEIL[s], equiv: VEIL[s], ...flat };
  }
  const s = bordering(grid, cx, cy, state);
  if (!s) return { alpha: FOG.void, equiv: FOG.void, ...flat };
  const raised = (p: Point, up: number): Point => ({ x: p.x, y: p.y - up });
  return {
    alpha: 0,
    equiv: VEIL[s],
    right,
    y,
    slabs: walls.slabs(cx, cy, right).map(({ axis, foot, height }) => ({ axis, top: raised(foot, heights[height] + FOG.headroom) })),
    posts: walls.posts(cx, cy, right).map(({ foot, height }) => raised(foot, heights[height] + FOG.post)),
  };
}

/** A strip's measures: its left side's x, the slope, a half diamond's height and a post's half width. */
interface Frame {
  x0: number;
  m: number;
  hh: number;
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
  const { x0, m, hh, ph } = f;
  // its top edge: a right half's falls from its top corner, a left half's rises to it
  let a = half.right ? half.y : Infinity;
  let b = half.right ? Infinity : half.y + hh;
  for (const { axis, top } of half.slabs) {
    // the slab's line through its top, across the whole half: along x it falls left to right, along y it rises
    if (axis === "x") a = Math.min(a, top.y - m * (top.x - x0));
    else b = Math.min(b, top.y + m * (top.x - x0));
  }
  for (const top of half.posts) {
    // the post's top as its cap's outline on screen, peaked over its middle: a line of each family
    // through its top, rising to it from its left side and falling away to its right
    const tp = top.x - x0;
    if (t0 < tp && t1 > tp - ph) b = Math.min(b, top.y + m * tp);
    if (t0 < tp + ph && t1 > tp) a = Math.min(a, top.y - m * tp);
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
function between(x0: number, w: number, m: number, upper: [number, number], lower: [number, number]): Omit<Band, "alpha" | "equiv">[] {
  const f = (t: number) => Math.min(upper[0] + m * t, upper[1] - m * t);
  const g = (t: number) => Math.min(lower[0] + m * t, lower[1] - m * t);
  const kinks = [upper, lower].map(([a, b]) => (b - a) / (2 * m)).filter((t) => t > 0 && t < w);
  const ts = [0, ...kinks, w].sort((p, q) => p - q).filter((t, i, all) => i === 0 || t - all[i - 1] > 1e-9);
  const out: Omit<Band, "alpha" | "equiv">[] = [];
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

/** Pixels to paint into a canvas texture: an `ImageData`. */
export interface FogPixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** A canvas texture as the fog paints it: a Phaser `CanvasTexture`. */
export interface FogCanvas {
  getContext(): { createImageData(width: number, height: number): FogPixels };
  putData(pixels: FogPixels, x: number, y: number): unknown;
  refresh(): unknown;
  setFilter(mode: number): unknown;
  destroy(): void;
}

/** An image as the fog shows its texture: a Phaser `Image`. */
export interface FogImage {
  setOrigin(x: number, y?: number): unknown;
  setScale(scale: number): unknown;
  setDepth(depth: number): unknown;
  setVisible(visible: boolean): unknown;
  setAlpha(alpha: number): unknown;
  destroy(): void;
}

/** A counter tween as the fade runs on it: from 0 to 1 on the scene's clock. */
export interface FogTweenConfig {
  from: number;
  to: number;
  duration: number;
  ease: string;
  onUpdate: (tween: { getValue(): number | null }) => void;
  onComplete: () => void;
}

/** What the fog needs of a scene: images of canvas textures, and its tweens. A Phaser scene is one. */
export interface FogStage {
  add: { image(x: number, y: number, key: string): FogImage };
  textures: { createCanvas(key: string, width: number, height: number): FogCanvas | null };
  tweens: { addCounter(config: FogTweenConfig): { stop(): unknown } };
}

/** Phaser's `FilterMode.LINEAR` (`textures/const.js`): the field drawn smooth between its texels. */
const LINEAR = 0;

/** A wall piece, as its gate shows, hides and tints it: a sprite, or a placeholder block. */
export interface FogPart {
  setVisible(visible: boolean): unknown;
  setTint?(tint: number): unknown;
  clearTint?(): unknown;
}

/**
 * A standing piece's two keys (§C.8, §C.9, FS-KE075 §H.45): shown only while its ground chunk is
 * near the camera *and* the fog does not hide it; tinted to its veil's share of `palette.inkDeep`,
 * easing from one share to the next while the fog fades. The chunk turns its key through
 * {@link nearCamera} (behind the {@link Toggle} that {@link Fog.gate} hands it); the fog turns the
 * other through {@link look} and {@link ease}.
 */
class FogGate {
  private near = true;
  private hidden = false;
  /** The share tinted now, and the shares a fade runs between. */
  private share = 0;
  private from = 0;
  private to = 0;

  constructor(
    private readonly part: FogPart,
    readonly cell: { cx: number; cy: number },
  ) {}

  /** Its ground chunk's key: whether the chunk is near the camera. */
  nearCamera(near: boolean): void {
    this.near = near;
    this.part.setVisible(near && !this.hidden);
  }

  /**
   * Hidden or shown, and the share it is tinted to: at once, or eased from the share it has now
   * when `fade`. True when it now eases.
   */
  look(hidden: boolean, share: number, fade: boolean): boolean {
    if (hidden !== this.hidden) {
      this.hidden = hidden;
      this.part.setVisible(this.near && !hidden);
    }
    this.from = this.share;
    this.to = share;
    if (!fade || hidden || this.from === share) {
      this.tint(share);
      return false;
    }
    return true;
  }

  /** `p` of the way from the share it eased from to the one it eases to. */
  ease(p: number): void {
    this.tint(this.from + (this.to - this.from) * p);
  }

  private tint(share: number): void {
    if (share === this.share) return;
    this.share = share;
    if (share > 0) this.part.setTint?.(mix(TINT_IDENTITY, palette.inkDeep, share));
    else this.part.clearTint?.();
  }
}

/** A canvas texture of one chunk's field and the image showing it. */
interface Layer {
  canvas: FogCanvas;
  image: FogImage;
  pixels: FogPixels;
}

/** A fade under way in one chunk: what the three layers hold (see {@link Fog.paint}). */
interface Fading {
  base: Float32Array;
  up: Float32Array;
  down: Float32Array;
}

/** One ground chunk's part of the fog. */
interface Chunk {
  index: number;
  /** Its screen rect, and its window of the lattice. */
  rect: Rect;
  win: FieldWindow;
  near: boolean;
  /** The shapes reaching into its field, and their print: unchanged print, unchanged field. */
  shapes: FogShape[];
  print?: number;
  /** Its field for the shapes it holds, once worked out. */
  target?: Float32Array;
  /** What its base layer shows while no fade is under way; none until it is painted. */
  shown?: Float32Array;
  fading?: Fading;
  /** The fog over the world; the fog that comes, easing in; the fog that lifts, easing out. */
  base?: Layer;
  up?: Layer;
  down?: Layer;
}

let made = 0;

/**
 * A dungeon floor's fog (§C.13): each ground chunk's field painted into a canvas texture at
 * {@link FOG}`.depth`, shown and hidden with its chunk, painted only while near the camera; and
 * the gates on the floor's wall pieces and dressing. {@link show} works the fog out again only when
 * some region's state differs from the last shown, and eases to it over {@link FOG}`.fade` ms.
 */
export class Fog {
  private readonly id = ++made;
  private readonly chunkList: Chunk[];
  private readonly gates: FogGate[] = [];
  private easing: FogGate[] = [];
  private drawn?: string;
  private state?: (region: number) => ExplorationState;
  private count = 0;
  private tween?: { stop(): unknown };
  /** The fade under way's own mark: a callback of a fade since stopped finds another. */
  private fadeMark?: object;
  /** How far the fade under way has run, 0 to 1. */
  private progress = 1;
  /** Chunks near the camera but out of its view, to paint a few a frame while the fade's counter runs. */
  private readonly pending = new Set<Chunk>();

  constructor(
    private readonly stage: FogStage,
    private readonly grid: RegionGrid,
    private readonly chunks: ChunkVisibility,
    private readonly heights: () => FogHeights,
    private readonly walls: WallLayout,
  ) {
    this.chunkList = chunks.grid.rects.map((rect, index) => ({ index, rect, win: fieldWindow(rect), near: true, shapes: [] }));
    // a chunk shows and hides its layers, and paints them when it comes near changed
    for (const chunk of this.chunkList)
      chunks.add({ setVisible: (near: boolean) => this.nearCamera(chunk, near) }, { x: chunk.rect.x + chunk.rect.width / 2, y: chunk.rect.y + chunk.rect.height / 2 });
  }

  /** How many times the fog has been worked out. */
  get redraws(): number {
    return this.count;
  }

  /**
   * A wall piece or run dressing standing at world point `at` under the fog: what its ground chunk
   * toggles in its stead (FS-KE075 §H.45). It takes the fog's look at once.
   */
  gate(part: FogPart, at: Point): Toggle {
    const gate = new FogGate(part, this.grid.cellOf(at));
    this.gates.push(gate);
    if (this.state) this.look(gate, this.state, false);
    // a chunk shows and hides what stands in it; for a gated piece, that is "near the camera"
    return { setVisible: (near: boolean) => gate.nearCamera(near) };
  }

  /**
   * Works the fog out for these region states, unless they are the ones shown, and eases to it
   * from what is on screen; the first time, shows it at once. True when it worked it out.
   */
  show(state: (region: number) => ExplorationState): boolean {
    const key = this.grid.regions.map((r) => state(r.id)[0]).join("");
    this.state = state;
    if (key === this.drawn) return false;
    const fade = this.drawn !== undefined;
    this.drawn = key;
    this.count++;
    // a fade under way stops where it is: what it shows now is where the next one starts
    this.stopFade();
    for (const gate of this.easing) gate.ease(this.progress);
    this.easing = this.gates.filter((gate) => this.look(gate, state, fade));
    this.assign(fogShapes(this.grid, state, this.heights(), this.walls));
    let fades = this.easing.length > 0;
    for (const chunk of this.chunkList) {
      if (!chunk.near || (chunk.target !== undefined && !chunk.fading)) continue;
      // out of view: a fade nobody sees ends at once, a change waits its turn
      if (!this.inView(chunk)) {
        if (chunk.target === undefined) this.pending.add(chunk);
        else this.settle(chunk);
        continue;
      }
      fades = this.paint(chunk, fade) || fades;
    }
    this.progress = 0;
    if (fades || this.pending.size > 0) this.startFade();
    else this.progress = 1;
    return true;
  }

  /** Whether chunk `chunk` meets the camera's view; every chunk does before the view is known. */
  private inView(chunk: Chunk): boolean {
    const view = this.chunks.view;
    if (!view) return true;
    const r = chunk.rect;
    return r.x < view.x + view.width && r.x + r.width > view.x && r.y < view.y + view.height && r.y + r.height > view.y;
  }

  /** Up to `most` of the chunks waiting their turn painted, at once, those gone far dropped. */
  private drain(most: number): void {
    for (const chunk of this.pending) {
      if (most <= 0) return;
      this.pending.delete(chunk);
      if (!chunk.near || chunk.target !== undefined) continue;
      this.paint(chunk, false);
      most--;
    }
  }

  /** Gone with its floor: its fade stopped, its layers destroyed, its gates let go. */
  destroy(): void {
    this.stopFade();
    for (const chunk of this.chunkList)
      for (const layer of [chunk.base, chunk.up, chunk.down]) {
        layer?.image.destroy();
        layer?.canvas.destroy();
      }
    this.chunkList.length = 0;
    this.pending.clear();
    this.gates.length = 0;
    this.easing = [];
    this.drawn = undefined;
    this.state = undefined;
  }

  /**
   * A wall piece takes the veil of the brightest region it borders; a piece on a region's floor
   * (run dressing) is hidden while that region is unexplored and never tinted, since the veil over
   * its floor lies over it already. A piece bordering no region keeps the floor's plain look.
   */
  private look(gate: FogGate, state: (region: number) => ExplorationState, fade: boolean): boolean {
    const { cx, cy } = gate.cell;
    const own = this.grid.region(cx, cy);
    if (own) return gate.look(state(own) === "unexplored", 0, fade);
    const s = bordering(this.grid, cx, cy, state);
    return gate.look(false, s ? VEIL[s] : 0, fade);
  }

  /**
   * Each chunk the shapes reaching into its field, each shape put only in the chunks its box meets;
   * a chunk whose shapes changed, its field to work out again.
   */
  private assign(shapes: readonly FogShape[]): void {
    const pad = FEATHER.reach * FEATHER.texel;
    const grid = this.chunks.grid;
    const first = grid.rects[0];
    const span = (v: number, origin: number, side: number, n: number) => Math.min(n - 1, Math.max(0, Math.floor((v - origin) / side)));
    const mine: FogShape[][] = this.chunkList.map(() => []);
    const marks = new Uint32Array(this.chunkList.length).fill(2166136261);
    for (const shape of shapes) {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const p of shape.points) {
        x0 = Math.min(x0, p.x);
        y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x);
        y1 = Math.max(y1, p.y);
      }
      const h = print(shape);
      const c0 = span(x0 - pad, first.x, first.width, grid.cols);
      const c1 = span(x1 + pad, first.x, first.width, grid.cols);
      const r0 = span(y0 - pad, first.y, first.height, grid.rows);
      const r1 = span(y1 + pad, first.y, first.height, grid.rows);
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) {
          const i = r * grid.cols + c;
          mine[i].push(shape);
          marks[i] = Math.imul(marks[i] ^ h, 16777619) >>> 0;
        }
    }
    this.chunkList.forEach((chunk, i) => {
      const next = marks[i] ^ mine[i].length;
      if (next === chunk.print) return;
      chunk.print = next;
      chunk.shapes = mine[i];
      chunk.target = undefined;
    });
  }

  /** Chunk `chunk` came near the camera or left it: its layers shown or hidden, painted if it changed. */
  private nearCamera(chunk: Chunk, near: boolean): void {
    chunk.near = near;
    this.pending.delete(chunk);
    // come near changed: painted now if in view, else in its turn a few a frame
    if (near && this.drawn !== undefined && chunk.target === undefined) {
      if (this.inView(chunk)) this.paint(chunk, false);
      else {
        this.pending.add(chunk);
        if (!this.fadeMark) this.startFade();
      }
    }
    // a chunk far off finishes its fade at once
    if (!near && chunk.fading) this.settle(chunk);
    chunk.base?.image.setVisible(near);
    chunk.up?.image.setVisible(near && !!chunk.fading);
    chunk.down?.image.setVisible(near && !!chunk.fading);
  }

  /**
   * Paints chunk `chunk`'s field, at once or, when `fade`, as a fade from what it shows now. True
   * when it fades.
   *
   * A fade holds three fields, all from `from` (on screen now) and `to`: the base, the less of the
   * two at each texel, over the world; the fog that comes, `up`, eased in over the world; and the
   * fog that lifts, `down`, eased out at {@link FOG}`.floorDepth`, under what stands. Each is the
   * alpha that, laid over the base, makes `to` or `from`: `1 − (1 − v)/(1 − base)`. No member is
   * ever under `down`, and `up` is nothing where `to` is clear, so where a member may stand.
   */
  private paint(chunk: Chunk, fade: boolean): boolean {
    chunk.target ??= fogField(chunk.shapes, chunk.rect).alpha;
    const to = chunk.target;
    const from = chunk.fading ? onScreen(chunk.fading, this.progress) : chunk.shown;
    if (!fade || !from || same32(from, to)) {
      this.write(chunk, "base", to, FOG.depth);
      chunk.shown = to;
      chunk.fading = undefined;
      chunk.up?.image.setVisible(false);
      chunk.down?.image.setVisible(false);
      return false;
    }
    const base = new Float32Array(to.length);
    const up = new Float32Array(to.length);
    const down = new Float32Array(to.length);
    for (let i = 0; i < to.length; i++) {
      const b = Math.min(from[i], to[i]);
      base[i] = b;
      if (b < 1) {
        up[i] = 1 - (1 - to[i]) / (1 - b);
        down[i] = 1 - (1 - from[i]) / (1 - b);
      }
    }
    chunk.fading = { base, up, down };
    chunk.shown = undefined;
    this.write(chunk, "base", base, FOG.depth);
    this.write(chunk, "up", up, FOG.depth)?.image.setAlpha(0);
    this.write(chunk, "down", down, FOG.floorDepth)?.image.setAlpha(1);
    chunk.up?.image.setVisible(chunk.near);
    chunk.down?.image.setVisible(chunk.near);
    return true;
  }

  /** A chunk's fade done: its base the field it eased to, its easing layers hidden. */
  private settle(chunk: Chunk): void {
    if (!chunk.fading || !chunk.target) return;
    chunk.fading = undefined;
    this.write(chunk, "base", chunk.target, FOG.depth);
    chunk.shown = chunk.target;
    chunk.up?.image.setVisible(false);
    chunk.down?.image.setVisible(false);
  }

  /** The fade from 0 to 1 over {@link FOG}`.fade` ms, on the scene's clock; only alphas and tints change on the way. */
  private startFade(): void {
    const mark = {};
    this.fadeMark = mark;
    const tween = this.stage.tweens.addCounter({
      from: 0,
      to: 1,
      duration: FOG.fade,
      ease: "Sine.easeInOut",
      onUpdate: (t) => {
        if (mark !== this.fadeMark) return;
        this.progress = t.getValue() ?? 1;
        this.drain(FOG.paints);
        for (const chunk of this.chunkList) {
          if (!chunk.fading) continue;
          chunk.up?.image.setAlpha(this.progress);
          chunk.down?.image.setAlpha(1 - this.progress);
        }
        for (const gate of this.easing) gate.ease(this.progress);
      },
      onComplete: () => {
        if (mark !== this.fadeMark) return;
        this.fadeMark = undefined;
        this.progress = 1;
        this.drain(Infinity);
        for (const chunk of this.chunkList) this.settle(chunk);
        for (const gate of this.easing) gate.ease(1);
        this.easing = [];
      },
    });
    if (mark === this.fadeMark) this.tween = tween;
  }

  /** The fade under way, if any, stopped where it is. */
  private stopFade(): void {
    this.fadeMark = undefined;
    this.tween?.stop();
    this.tween = undefined;
  }

  /**
   * A field into one of a chunk's layers, the layer made the first time it has fog to show: its
   * canvas texture the field's size, its image laid over the chunk's window a texel to a texel.
   */
  private write(chunk: Chunk, which: "base" | "up" | "down", field: Float32Array, depth: number): Layer | undefined {
    let layer = chunk[which];
    if (!layer) {
      if (!field.some((v) => v > 0)) return undefined;
      const { win } = chunk;
      const key = `fog:${this.id}:${chunk.index}:${which}`;
      const canvas = this.stage.textures.createCanvas(key, win.cols, win.rows);
      if (!canvas) return undefined;
      canvas.setFilter(LINEAR);
      const pixels = canvas.getContext().createImageData(win.cols, win.rows);
      const ink = palette.inkDeep;
      for (let i = 0; i < win.cols * win.rows; i++) {
        pixels.data[i * 4] = (ink >> 16) & 255;
        pixels.data[i * 4 + 1] = (ink >> 8) & 255;
        pixels.data[i * 4 + 2] = ink & 255;
      }
      const image = this.stage.add.image(win.x, win.y, key);
      image.setOrigin(0, 0);
      image.setScale(FEATHER.texel);
      image.setDepth(depth);
      image.setVisible(chunk.near);
      layer = chunk[which] = { canvas, image, pixels };
    }
    for (let i = 0; i < field.length; i++) layer.pixels.data[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, field[i])) * 255);
    layer.canvas.putData(layer.pixels, 0, 0);
    layer.canvas.refresh();
    return layer;
  }
}

/** What a fade shows `p` of the way: the base, with the fog that comes eased in and the fog that lifts eased out. */
function onScreen(f: Fading, p: number): Float32Array {
  const out = new Float32Array(f.base.length);
  for (let i = 0; i < out.length; i++) out[i] = 1 - (1 - f.base[i]) * (1 - f.up[i] * p) * (1 - f.down[i] * (1 - p));
  return out;
}

/** Whether two fields are the same, texel for texel. */
function same32(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-4) return false;
  return true;
}

/** A shape's print: a hash of its veils and its corners to a hundredth of a px. */
function print(shape: FogShape): number {
  let h = 2166136261;
  const mixIn = (v: number) => (h = Math.imul(h ^ (Math.round(v * 100) | 0), 16777619) >>> 0);
  mixIn(shape.alpha);
  mixIn(shape.equiv);
  for (const p of shape.points) {
    mixIn(p.x);
    mixIn(p.y);
  }
  return h;
}
