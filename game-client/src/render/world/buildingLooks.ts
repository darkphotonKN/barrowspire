/**
 * A building's two looks, planned (ADR-0036, FS-9PN7X §B). Pure: the walls and doors in, pieces
 * out, so every client draws the same building from the same broadcast.
 *
 * The **interior look** is the cut-away that ships (`planWalls`): back walls full height, south
 * and east fronts low. The **building exterior** is the full-height version of every side: the
 * same fronts cut on exactly the same footprint, in the type's outward face, their posts columns,
 * a stone cap over a masonry room, a dark opening in each entrance. A scene draws both and shows
 * one per building.
 */

import { WORLD_PX_PER_TILE, type Point, type Rect } from "@/render/iso";
import type { WallState } from "@/types/gameState";
import { BAKE } from "./bake";
import { tileHash } from "./ground";
import { housesFrom, type House } from "./houses";
import {
  TIMBER_WALLS,
  axisOf,
  cutExterior,
  heightOf,
  planWalls,
  sideOf,
  type WallAxis,
  type WallPiece,
  type WallPost,
  type WallSheets,
} from "./walls";

const T = WORLD_PX_PER_TILE;
const EPSILON = 1e-6;

/** Pieces and posts one look draws. */
export interface WallLook {
  pieces: WallPiece[];
  posts: WallPost[];
}

/** One building's walls, by the look that draws them. */
export interface BuildingWalls {
  house: House;
  /** Drawn in both looks: the north and west walls, and every post already full height. */
  shared: WallLook;
  /** The interior look only: the cut-away south and east fronts and their low posts. */
  interior: WallLook;
  /**
   * The building exterior only: those same fronts full height in the outward face, on the
   * cut-away's footprint, and their posts as back posts (FS-9PN7X §B.2).
   */
  exterior: WallLook;
}

/**
 * Every building's walls in both looks, in `housesFrom` order. Walls with no house belong to no
 * building and are left out: the scene keeps drawing them with `planWalls`.
 *
 * Posts are planned per building, as `planWalls` would post that building's walls alone, so a
 * corner two buildings share is posted by each and goes with either.
 */
export function planBuildings(
  walls: readonly WallState[],
  seed: number,
  sheets: WallSheets = TIMBER_WALLS,
): BuildingWalls[] {
  return housesFrom(walls).map((house) => {
    const own = walls.filter((w) => w.house_id === house.id);
    const { pieces, posts } = planWalls(own, seed, sheets);
    const fronts = own.filter((w) => heightOf(sideOf(w, house)) === "front");
    const isBack = (p: { height: string }) => p.height === "back";
    const lowPosts = posts.filter((p) => !isBack(p));
    return {
      house,
      shared: { pieces: pieces.filter(isBack), posts: posts.filter(isBack) },
      interior: { pieces: pieces.filter((p) => !isBack(p)), posts: lowPosts },
      exterior: {
        pieces: fronts.flatMap((w) => cutExterior(w, seed, sheets)),
        posts: lowPosts.map((p) => ({
          ...p,
          sheet: `${sheets.prefix}post_back`,
          height: "back" as const,
        })),
      },
    };
  });
}

/** One slab of a stone cap (FS-9PN7X §F.3). */
export interface CapPiece {
  sheet: string;
  /** Variant frame; the art library wraps it. */
  index: number;
  /** World position of the slab's footprint centre; also what it sorts by. */
  at: Point;
  /** Screen px above the ground: the back walls' top. */
  lift: number;
}

/**
 * A masonry building's stone cap (FS-9PN7X §B.3, §F.3): one-tile slabs laid over the room rect at
 * the back walls' top, the grid centred on the room so a part tile overhangs evenly on both sides
 * rather than leaving a gap. A building type with a roof (no `cap`) gets none.
 */
export function planCap(
  house: House,
  sheets: WallSheets,
  seed: number,
): CapPiece[] {
  const sheet = sheets.cap;
  if (!sheet) return [];
  const cols = Math.ceil(house.width / T - EPSILON);
  const rows = Math.ceil(house.height / T - EPSILON);
  const x0 = house.x + house.width / 2 - (cols * T) / 2;
  const y0 = house.y + house.height / 2 - (rows * T) / 2;
  const lift = BAKE.WALL_BACK * BAKE.VPX;
  const pieces: CapPiece[] = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const at = { x: x0 + (i + 0.5) * T, y: y0 + (j + 0.5) * T };
      const h = tileHash(Math.round(at.x), Math.round(at.y), seed);
      pieces.push({ sheet, index: h >>> 8, at, lift });
    }
  return pieces;
}

/** A gap between two collinear wall segments of one building: a town door (FS-9PN7X §B.5). */
export interface DoorGap {
  houseId: string;
  /** The gap's world rect, in the wall's thickness, shaped like a `DoorState`. */
  position: Point;
  width: number;
  height: number;
}

/**
 * Every door gap the walls leave (FS-9PN7X §B.5), found from the walls, never from a constant: on
 * each side of each building, the stretches between its collinear wall segments. Only walls on
 * the building's outline count, so furnishings standing in a row indoors are never a gap.
 */
export function doorGaps(walls: readonly WallState[]): DoorGap[] {
  const gaps: DoorGap[] = [];
  for (const house of housesFrom(walls)) {
    // the building's sides: walls on one line of its outline, keyed by axis and line
    const lines = new Map<string, WallState[]>();
    for (const w of walls) {
      if (w.house_id !== house.id) continue;
      const axis = axisOf(w);
      const [near, far, lo, hi] =
        axis === "x"
          ? [w.position.y, w.position.y + w.height, house.y, house.y + house.height]
          : [w.position.x, w.position.x + w.width, house.x, house.x + house.width];
      if (Math.abs(near - lo) > EPSILON && Math.abs(far - hi) > EPSILON) continue;
      const key = `${axis}:${near}:${far}`;
      lines.set(key, [...(lines.get(key) ?? []), w]);
    }
    for (const line of lines.values()) {
      const axis = axisOf(line[0]);
      const span = (w: WallState) =>
        axis === "x"
          ? [w.position.x, w.position.x + w.width]
          : [w.position.y, w.position.y + w.height];
      const sorted = [...line].sort((a, b) => span(a)[0] - span(b)[0]);
      let reach = span(sorted[0])[1];
      for (const w of sorted.slice(1)) {
        const [start, end] = span(w);
        if (start - reach > EPSILON) {
          const { x, y } = sorted[0].position;
          gaps.push({
            houseId: house.id,
            position: axis === "x" ? { x: reach, y } : { x, y: reach },
            width: axis === "x" ? start - reach : sorted[0].width,
            height: axis === "x" ? sorted[0].height : start - reach,
          });
        }
        reach = Math.max(reach, end);
      }
    }
  }
  return gaps;
}

/** An entrance seen from outside (FS-9PN7X §B.5): the type's dark frame, darkness inside. */
export interface DarkOpening {
  /** `{opening}_{x|y}`: `door_dark_x`, `tower_door_dark_y`. */
  sheet: string;
  axis: WallAxis;
  /** World position of the opening's centre, where the frame stands. */
  at: Point;
  /** The back corner of its footprint: what it sorts by, like the door it stands for. */
  depthAt: Point;
  /** The opening's world rect, for a placeholder. */
  rect: Rect;
}

/**
 * The dark opening for a town door gap, or for an open Spire door's rect (a `DoorState`), on the
 * opening's axis as the door sheets name it.
 */
export function darkOpening(
  spot: { position: Point; width: number; height: number },
  sheets: WallSheets,
): DarkOpening {
  const { position, width, height } = spot;
  const axis = axisOf(spot);
  return {
    sheet: `${sheets.opening}_${axis}`,
    axis,
    at: { x: position.x + width / 2, y: position.y + height / 2 },
    depthAt: { x: position.x, y: position.y },
    rect: { x: position.x, y: position.y, width, height },
  };
}
