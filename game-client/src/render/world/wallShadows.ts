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
 * there; only a building's door gap is read as found (`doorGaps`), since from outside the wall's
 * shadow runs across it (FS-V8FT3 R27). One foot is one shape, and a run of pieces of one height is
 * one foot, never one per piece.
 */

// by path, not the barrel: the barrel pulls in the Phaser drawing helpers, and this is pure maths
import { WORLD_PX_PER_TILE, type Point, type Rect } from "@/render/iso/projection";
import { BAKE } from "./bake";
import type { BuildingWalls, DoorGap } from "./buildingLooks";
import type { RegionGrid } from "./dungeon";
import { axisOf } from "./houses";
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

/**
 * Walls as a draw call drew them (`addWalls`, `addWallPieces`): the pieces and posts its sprites
 * stand by, and its material's thickness in world px (`thicknessPx`).
 */
export interface DrawnWallSet {
  plan: DrawnWalls;
  thickness: number;
}

/**
 * A building as `addBuildings` drew it: its walls in both looks, the door gaps its heads close, and
 * its material's thickness in world px.
 */
export interface DrawnBuilding {
  plan: BuildingWalls;
  gaps: readonly DoorGap[];
  thickness: number;
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
 * What of a convex shape lies on one side of a line of constant x or y: where `keep` times
 * (`p[axis]` − `at`) is not negative (Sutherland–Hodgman, one edge). Convex, in the shape's order.
 */
function clip(shape: readonly Point[], axis: "x" | "y", at: number, keep: 1 | -1): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < shape.length; i++) {
    const a = shape[i];
    const b = shape[(i + 1) % shape.length];
    const sa = keep * (a[axis] - at);
    const sb = keep * (b[axis] - at);
    if (sa >= 0) out.push(a);
    if ((sa > 0 && sb < 0) || (sa < 0 && sb > 0)) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
  }
  return out;
}

/** Whether a polygon covers any ground: three corners or more, not all on one line. */
function covers(shape: readonly Point[]): boolean {
  let twice = 0;
  for (let i = 0; i < shape.length; i++) {
    const p = shape[i];
    const q = shape[(i + 1) % shape.length];
    twice += p.x * q.y - q.x * p.y;
  }
  return shape.length >= 3 && Math.abs(twice) > EPSILON;
}

/** What of a convex shape lies within a rect: none, or one convex shape. */
function within(shape: readonly Point[], r: Rect): Point[][] {
  let s = clip(shape, "x", r.x, 1);
  s = clip(s, "x", r.x + r.width, -1);
  s = clip(s, "y", r.y, 1);
  s = clip(s, "y", r.y + r.height, -1);
  return covers(s) ? [s] : [];
}

/**
 * What of a convex shape lies outside a rect: up to four convex shapes, west, east, north and
 * south of it, overlapping past its corners (they are drawn opaque, so an overlap is no darker),
 * none reaching into it.
 */
function without(shape: readonly Point[], r: Rect): Point[][] {
  return [
    clip(shape, "x", r.x, -1),
    clip(shape, "x", r.x + r.width, 1),
    clip(shape, "y", r.y, -1),
    clip(shape, "y", r.y + r.height, 1),
  ].filter(covers);
}

/**
 * The shadows of drawn walls that show within a footprint (FS-V8FT3 §F): each shape cut at the
 * footprint's edge. A building's interior look, and the walls inside it (the Inn's partition, R25).
 */
export function shadowsWithin(walls: DrawnWalls, thickness: number, footprint: Rect): Point[][] {
  return planWallShadows(walls, thickness).flatMap((shape) => within(shape, footprint));
}

/**
 * The shadows a building's ground carries (FS-V8FT3 §F R26, R27), `thickness` its material's.
 * Outside its footprint, those of its exterior look (every side full height) and, across each of
 * its door gaps, the wall as if it were whole: from outside a gap holds a shut door under its
 * head. Inside, those of its interior look (south and east cut away), where a gap casts nothing.
 * Each is cut at the footprint's edge: the ground is painted once, and each patch of it is only
 * ever seen in one look.
 */
export function buildingShadows(
  building: BuildingWalls,
  gaps: readonly DoorGap[],
  thickness: number,
): { outside: Point[][]; inside: Point[][] } {
  const { house, shared, interior, exterior } = building;
  const across = gaps.filter((g) => g.houseId === house.id).map(gapSpan);
  const outer: DrawnWalls = {
    pieces: [...shared.pieces, ...exterior.pieces, ...across],
    posts: [...shared.posts, ...exterior.posts],
  };
  const inner: DrawnWalls = {
    pieces: [...shared.pieces, ...interior.pieces],
    posts: [...shared.posts, ...interior.posts],
  };
  return {
    outside: planWallShadows(outer, thickness).flatMap((shape) => without(shape, house)),
    inside: shadowsWithin(inner, thickness, house),
  };
}

/**
 * The shadows of walls as they were drawn (FS-V8FT3 §F), never planned a second time: each building
 * by its two looks (`buildingShadows`), from the plan its sprites stand by, and walls of no house as
 * their pieces stand, at the height drawn (R28). The village's houses and walls, and a floor of
 * buildings' rooms and halls.
 */
export function buildingWallShadows(buildings: readonly DrawnBuilding[], loose?: DrawnWallSet | null): Point[][] {
  const houses = buildings.flatMap(({ plan, gaps, thickness }) => {
    const { outside, inside } = buildingShadows(plan, gaps, thickness);
    return [...outside, ...inside];
  });
  return [...houses, ...(loose ? planWallShadows(loose.plan, loose.thickness) : [])];
}

/**
 * A door gap as a stretch of full-height wall on the line of the walls either side of it, from
 * jamb to jamb: shaped as a trimmed piece is (`keep` the gap's length in tiles), so `wallFeet`
 * joins it to them in one foot.
 */
function gapSpan({ position, width, height }: DoorGap): DrawnWalls["pieces"][number] {
  const axis = axisOf({ width, height });
  const at =
    axis === "x"
      ? { x: position.x + T / 2, y: position.y + height / 2 }
      : { x: position.x + width / 2, y: position.y + T / 2 };
  return { axis, at, keep: (axis === "x" ? width : height) / T, height: "back" };
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
