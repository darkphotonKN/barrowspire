/**
 * The tower's outer wall (FS-8RBQY §B.5, R2): a client-only ring of thick masonry around the play
 * area. Not a server wall: no entity, no collision, no message, and nothing in play is under it.
 *
 * It stands wholly outside `[0, width] × [0, height]` with its inner face on the edge. North and
 * west stand full height, pierced by arrow slits at a fixed pitch; south and east are the low
 * cut-away, so they never cover a delver or anything usable at the map edge. A pier stands at each
 * corner. Every choice is fixed by position, never random.
 *
 * The bake's facts this relies on (`tools/bake/page/models/tower.js`): a piece is one tile long,
 * its origin is the centre of its footprint, the wall is `PER_THICK` (0.62) tiles thick, a corner
 * pier is 0.9 tiles square, and `_x` pieces run along world x.
 */

import { WORLD_PX_PER_TILE, type Point, type Rect } from "@/render/iso";
import type { WallAxis, WallHeight } from "./walls";

const T = WORLD_PX_PER_TILE;

/** How thick the outer wall is, in world px: the bake's 0.62 tiles. */
export const PERIMETER_THICKNESS = 0.62 * T;
/** A corner pier's side, in world px: the bake's 0.9 tiles. */
export const PERIMETER_POST = 0.9 * T;
/** Every this many pieces along a full-height run, one is an arrow slit. */
const SLIT_PITCH = 6;
/** Which piece of each pitch is the slit: mid-pitch, so no slit sits against a corner. */
const SLIT_AT = 3;

export type PerimeterSide = "north" | "west" | "south" | "east";

export interface PerimeterPiece {
  side: PerimeterSide;
  /** Manifest sheet: `tower_perimeter_{back_plain|back_slit|front_plain}_{x|y}`. */
  sheet: string;
  /** Variant frame; the art library wraps it, so neighbours alternate. */
  index: number;
  height: WallHeight;
  axis: WallAxis;
  /** World position of the piece's origin: the centre of its footprint. */
  at: Point;
  /** The world rect the piece stands on. */
  rect: Rect;
  /** The back corner of the footprint: what the piece sorts by. */
  depthAt: Point;
}

export interface PerimeterPost {
  sheet: "tower_perimeter_post_back" | "tower_perimeter_post_front";
  at: Point;
  rect: Rect;
}

/** One run of the wall: `count` tiles along `axis`, standing on the rect `strip(k)` gives. */
function run(
  side: PerimeterSide,
  axis: WallAxis,
  count: number,
  strip: (k: number) => Rect,
): PerimeterPiece[] {
  const height: WallHeight =
    side === "north" || side === "west" ? "back" : "front";
  const pieces: PerimeterPiece[] = [];
  for (let k = 0; k < count; k++) {
    const rect = strip(k);
    const at = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    const kind =
      height === "front"
        ? "front_plain"
        : k % SLIT_PITCH === SLIT_AT
          ? "back_slit"
          : "back_plain";
    pieces.push({
      side,
      sheet: `tower_perimeter_${kind}_${axis}`,
      index: k,
      height,
      axis,
      at,
      rect,
      depthAt: { x: rect.x, y: rect.y },
    });
  }
  return pieces;
}

/** The outer wall around a `width` × `height` play area. The same plan on every client. */
export function planPerimeter(
  width: number,
  height: number,
): { pieces: PerimeterPiece[]; posts: PerimeterPost[] } {
  const D = PERIMETER_THICKNESS;
  const cols = Math.ceil(width / T);
  const rows = Math.ceil(height / T);
  const pieces = [
    ...run("north", "x", cols, (k) => ({
      x: k * T,
      y: -D,
      width: T,
      height: D,
    })),
    ...run("west", "y", rows, (k) => ({
      x: -D,
      y: k * T,
      width: D,
      height: T,
    })),
    ...run("south", "x", cols, (k) => ({
      x: k * T,
      y: height,
      width: T,
      height: D,
    })),
    ...run("east", "y", rows, (k) => ({
      x: width,
      y: k * T,
      width: D,
      height: T,
    })),
  ];

  const P = PERIMETER_POST;
  const post = (x: number, y: number, tall: boolean): PerimeterPost => ({
    sheet: tall ? "tower_perimeter_post_back" : "tower_perimeter_post_front",
    at: { x: x + P / 2, y: y + P / 2 },
    rect: { x, y, width: P, height: P },
  });
  // a pier is as tall as the tallest run it joins: only south-meets-east is low
  const posts = [
    post(-P, -P, true),
    post(width, -P, true),
    post(-P, height, true),
    post(width, height, false),
  ];
  return { pieces, posts };
}
