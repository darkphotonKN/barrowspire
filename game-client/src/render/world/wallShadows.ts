/**
 * The ground shadows of walls, as shapes (FS-V8FT3 §C, §D).
 *
 * A wall's sprite carries no ground shadow: the client paints one, flat, where the bake's key
 * light would have thrown it, so it agrees with the baked shadows of the props beside it. This
 * plans the shapes and paints nothing.
 *
 * A shadow is cast by a **foot**: the ground a stretch of wall, or a post, is drawn standing on,
 * with how tall it stands. Nothing here reads a server wall rect or a cell: a foot comes from the
 * pieces and posts as they are drawn (`planWalls`), so wherever a wall is drawn, its shadow starts
 * there. One foot is one shape, and a run of pieces of one height is one foot, never one per piece.
 */

// by path, not the barrel: the barrel pulls in the Phaser drawing helpers, and this is pure maths
import { WORLD_PX_PER_TILE, type Point, type Rect } from "@/render/iso/projection";
import { BAKE } from "./bake";
import type { RegionGrid } from "./dungeon";
import type { WallHeight, WallPiece, WallPost } from "./walls";

/** The ground something that casts stands on: an axis-aligned rect in world px, and its height. */
export interface WallFoot {
  /** The rect's north-west corner. */
  min: Point;
  /** The rect's south-east corner. */
  max: Point;
  /** How tall the wall or post stands, in tile edges (`BAKE.WALL_BACK`, `BAKE.WALL_FRONT`). */
  height: number;
}

/** Walls as they are drawn: what of `planWalls`' pieces and posts a shadow is cast from. */
export interface DrawnWalls {
  pieces: readonly Pick<WallPiece, "axis" | "at" | "keep" | "height">[];
  posts: readonly Pick<WallPost, "at" | "height">[];
}

const T = WORLD_PX_PER_TILE;
/** Pieces closer than this, in world px, stand on one line and end to end. */
const EPSILON = 1e-6;
/** How tall a piece or post of each drawn height stands, in tile edges (R2). */
const TALL: Record<WallHeight, number> = { back: BAKE.WALL_BACK, front: BAKE.WALL_FRONT };

/**
 * Where the bake's key light throws the shadow of a point `height` tile edges above the ground,
 * as an offset in world px (R11).
 */
export function castOffset(height: number): Point {
  const [lx, ly, lz] = BAKE.KEY_LIGHT;
  return { x: ((height * -lx) / ly) * T, y: ((height * -lz) / ly) * T };
}

/**
 * The shadow one foot casts (R15): the outline of the foot swept along the light to its top, which
 * is the convex hull of the foot and the foot moved by the offset for its height. A closed polygon
 * in world px, each corner once.
 */
export function castShadow(foot: WallFoot): Point[] {
  const { min, max } = foot;
  const d = castOffset(foot.height);
  const rect = [min, { x: max.x, y: min.y }, max, { x: min.x, y: max.y }];
  return hull([...rect, ...rect.map((p) => ({ x: p.x + d.x, y: p.y + d.y }))]);
}

/** The convex hull of some points (Andrew's monotone chain): its corners in order, none twice. */
function hull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const turn = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const chain = (from: readonly Point[]) => {
    const out: Point[] = [];
    for (const p of from) {
      while (out.length >= 2 && turn(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...chain(sorted), ...chain(sorted.reverse())];
}

/**
 * The feet drawn walls stand on (R13, R15–R17): one for every stretch of pieces that stand end to
 * end on one line at one height, as long as the pieces are (a trimmed piece to where it ends) and
 * `thickness` thick, centred on the pieces' line; then one square for every post, by its own
 * height. Pieces across a gap, on two lines or of two heights are separate feet. `thickness` is
 * the material's, in world px (`thicknessPx`): on a dungeon floor, where a piece's centre is half
 * a thickness into its wall cell, a run's foot is the strip from its edge to one thickness behind.
 */
export function wallFeet(walls: DrawnWalls, thickness: number): WallFoot[] {
  const spans = walls.pieces
    .map((p) => {
      const from = p.at[p.axis] - T / 2;
      return { axis: p.axis, line: p.at[p.axis === "x" ? "y" : "x"], from, to: from + p.keep * T, height: p.height };
    })
    .sort((a, b) => {
      if (a.axis !== b.axis) return a.axis < b.axis ? -1 : 1;
      return Math.abs(a.line - b.line) > EPSILON ? a.line - b.line : a.from - b.from;
    });
  const stretches: typeof spans = [];
  for (const s of spans) {
    const last = stretches[stretches.length - 1];
    const joins =
      last !== undefined &&
      last.axis === s.axis &&
      last.height === s.height &&
      Math.abs(last.line - s.line) <= EPSILON &&
      s.from <= last.to + EPSILON;
    if (joins) last.to = Math.max(last.to, s.to);
    else stretches.push({ ...s });
  }

  const wall = thickness / 2;
  const post = (BAKE.POST_FOOT * T) / 2;
  return [
    ...stretches.map(({ axis, line, from, to, height }) =>
      axis === "x"
        ? { min: { x: from, y: line - wall }, max: { x: to, y: line + wall }, height: TALL[height] }
        : { min: { x: line - wall, y: from }, max: { x: line + wall, y: to }, height: TALL[height] },
    ),
    ...walls.posts.map(({ at, height }) => ({
      min: { x: at.x - post, y: at.y - post },
      max: { x: at.x + post, y: at.y + post },
      height: TALL[height],
    })),
  ];
}

/**
 * The ground shadows of drawn walls: one shape per foot (`wallFeet`), so one per run of a height
 * and one per post, each a closed polygon in world px (`castShadow`).
 */
export function planWallShadows(walls: DrawnWalls, thickness: number): Point[][] {
  return wallFeet(walls, thickness).map(castShadow);
}

/**
 * A ground's wall shadows as they are painted (FS-V8FT3 §E): the shapes, and what is cut from them
 * before they are laid on the ground.
 */
export interface GroundShadows {
  /** One closed polygon per foot, world px (`planWallShadows`). */
  shapes: readonly (readonly Point[])[];
  /**
   * World rects no shadow is laid on: on a dungeon floor, the wall cells and void cells a shape
   * reaches, whole cells, never a walkable one (R23).
   */
  cuts: readonly Rect[];
}

/**
 * A dungeon floor's wall shadows (FS-V8FT3 §D, §E R23): one shape per edge run and per post of
 * the walls as drawn (`dungeonWalls`), and every cell with no ground under it (a wall cell or the
 * void, FS-XK2B6 §E) that a shape's bounds reach, to cut. The shapes stay whole: the cut is made
 * where they are laid, so a shadow over several walkable cells has no seam between them.
 */
export function dungeonShadows(walls: DrawnWalls, thickness: number, grid: RegionGrid): GroundShadows {
  const shapes = planWallShadows(walls, thickness);
  const c = grid.cell;
  const cuts = new Map<string, Rect>();
  for (const shape of shapes) {
    const xs = shape.map((p) => p.x);
    const ys = shape.map((p) => p.y);
    const [x0, x1] = [Math.floor(Math.min(...xs) / c), Math.ceil(Math.max(...xs) / c)];
    const [y0, y1] = [Math.floor(Math.min(...ys) / c), Math.ceil(Math.max(...ys) / c)];
    for (let cx = x0; cx < x1; cx++)
      for (let cy = y0; cy < y1; cy++)
        if (!grid.walkable(cx, cy)) cuts.set(`${cx},${cy}`, { x: cx * c, y: cy * c, width: c, height: c });
  }
  return { shapes, cuts: [...cuts.values()] };
}
