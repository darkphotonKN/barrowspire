/**
 * Server walls as baked wall pieces (FS-2325V §C.2).
 *
 * A server wall is an axis-aligned world rect. It is drawn as a run of one-tile pieces along its
 * centreline, each its own sprite sorted by its own footprint, with a corner post at each end.
 * North- and west-facing house sides stand full height; south and east sides are the low
 * cut-away, so the fixed camera sees into a house. Variants are hashed per piece, never random.
 * The same geometry draws timber house walls or masonry partition walls (FS-8RBQY §B.2): only
 * the sheets and the variant tables change, so a world theme picks a {@link WallSheets}.
 *
 * The bake's facts this relies on (`tools/bake/page/models/architecture.js`): a piece is one
 * tile long, its origin is the centre of its footprint, and `_x` pieces run along world x.
 */

import { TILE_WIDTH, WORLD_PX_PER_TILE, type Point } from "@/render/iso";
import type { WallState } from "@/types/gameState";
import { tileHash } from "./ground";
import { housesFrom, type House } from "./houses";

export type WallHeight = "back" | "front";
export type WallAxis = "x" | "y";
export type HouseSide = "north" | "south" | "east" | "west";

export interface WallPiece {
  /** The server wall this piece is part of. */
  wallId: string;
  /** Manifest sheet: `{prefix}wall_{back|front}_{kind}_{x|y}`, e.g. `wall_back_torch_x`. */
  sheet: string;
  height: WallHeight;
  /** Variant frame; the art library wraps it. */
  index: number;
  axis: WallAxis;
  /** World position of the piece's origin (the centre of a whole tile of wall). */
  at: Point;
  /** How much of the tile is wall, 0..1. Below 1 the piece is trimmed at its far end. */
  keep: number;
  /** The back corner of the kept footprint: what the piece sorts by. */
  depthAt: Point;
}

export interface WallPost {
  /** The first wall that ends here; the post goes when it does. */
  wallId: string;
  /** `{prefix}post_{back|front}`. */
  sheet: string;
  height: WallHeight;
  at: Point;
}

const T = WORLD_PX_PER_TILE;
/** A wall shorter than this remainder of a tile is treated as ending on a tile. */
const EPSILON = 1e-6;

const axisOf = (w: WallState): WallAxis => (w.width >= w.height ? "x" : "y");

/** Which side of its house a wall stands on; undefined for a wall with no house. */
export function sideOf(
  w: WallState,
  house: House | undefined,
): HouseSide | undefined {
  if (!house) return undefined;
  if (axisOf(w) === "x")
    return w.position.y + w.height / 2 < house.y + house.height / 2
      ? "north"
      : "south";
  return w.position.x + w.width / 2 < house.x + house.width / 2
    ? "west"
    : "east";
}

/** South and east sides face the camera and are cut away; everything else stands full height. */
export function heightOf(side: HouseSide | undefined): WallHeight {
  return side === "south" || side === "east" ? "front" : "back";
}

/** Share of whole pieces of each kind, cumulative, in percent. The first kind is the plain one. */
export type VariantTable = readonly (readonly [number, string])[];

/** The sheets one material draws server walls with, and how often each kind turns up. */
export interface WallSheets {
  /** Before every piece and post sheet name: `""` for timber, `"tower_"` for masonry. */
  prefix: string;
  /** Kinds a full-height piece may be. */
  back: VariantTable;
  /** Kinds a cut-away piece may be. */
  front: VariantTable;
}

const KINDS: VariantTable = [
  [55, "plain"],
  [78, "brace"],
  [90, "window"],
  [100, "torch"],
];

/** Timber-frame house walls, as the exterior world theme has always drawn them. */
export const TIMBER_WALLS: WallSheets = {
  prefix: "",
  back: KINDS,
  front: KINDS,
};

/**
 * Masonry partition walls (FS-8RBQY §B.2): no window indoors, and the low cut-away side is plain
 * or pillared. These are the `middle` floor band's shares; the band table varies them per floor.
 */
export const MASONRY_WALLS: WallSheets = {
  prefix: "tower_",
  back: [
    [40, "plain"],
    [68, "pillar"],
    [84, "sconce"],
    [92, "banner"],
    [100, "cobweb"],
  ],
  front: [
    [70, "plain"],
    [100, "pillar"],
  ],
};

/** Cuts one wall rect into pieces along its centreline, trimmed at the far end if it must be. */
export function cutWall(
  w: WallState,
  height: WallHeight,
  seed: number,
  sheets: WallSheets = TIMBER_WALLS,
): WallPiece[] {
  const kinds = sheets[height];
  const axis = axisOf(w);
  const { x, y } = w.position;
  const length = axis === "x" ? w.width : w.height;
  const whole = Math.floor(length / T + EPSILON);
  const rest = length / T - whole;
  const count = rest > EPSILON ? whole + 1 : whole;

  const pieces: WallPiece[] = [];
  for (let k = 0; k < count; k++) {
    const along = (k + 0.5) * T;
    const at =
      axis === "x"
        ? { x: x + along, y: y + w.height / 2 }
        : { x: x + w.width / 2, y: y + along };
    const depthAt = axis === "x" ? { x: x + k * T, y } : { x, y: y + k * T };
    const keep = k < whole ? 1 : rest;
    const h = tileHash(Math.round(at.x), Math.round(at.y), seed);
    const kind =
      keep < 1 ? kinds[0][1] : kinds.find(([cut]) => h % 100 < cut)![1];
    pieces.push({
      wallId: w.entity_id,
      sheet: `${sheets.prefix}wall_${height}_${kind}_${axis}`,
      height,
      index: h >>> 8,
      axis,
      at,
      keep,
      depthAt,
    });
  }
  return pieces;
}

/** The two ends of a wall on its centreline, inset by half its thickness to meet the next wall's. */
function endsOf(w: WallState): [Point, Point] {
  const { x, y } = w.position;
  if (axisOf(w) === "x") {
    const cy = y + w.height / 2;
    return [
      { x: x + w.height / 2, y: cy },
      { x: x + w.width - w.height / 2, y: cy },
    ];
  }
  const cx = x + w.width / 2;
  return [
    { x: cx, y: y + w.width / 2 },
    { x: cx, y: y + w.height - w.width / 2 },
  ];
}

/**
 * Every wall's pieces, and a post at every wall end: corners and door jambs, one post where
 * walls meet, as tall as the tallest wall it joins.
 */
export function planWalls(
  walls: readonly WallState[],
  seed: number,
  sheets: WallSheets = TIMBER_WALLS,
): { pieces: WallPiece[]; posts: WallPost[] } {
  const houses = new Map(housesFrom(walls).map((h) => [h.id, h]));
  const pieces: WallPiece[] = [];
  const posts = new Map<string, WallPost>();

  for (const w of walls) {
    const height = heightOf(
      sideOf(w, w.house_id ? houses.get(w.house_id) : undefined),
    );
    pieces.push(...cutWall(w, height, seed, sheets));
    for (const at of endsOf(w)) {
      const key = `${Math.round(at.x)},${Math.round(at.y)}`;
      const existing = posts.get(key);
      if (existing?.height === "back") continue;
      posts.set(key, {
        wallId: existing?.wallId ?? w.entity_id,
        sheet: `${sheets.prefix}post_${height}`,
        height,
        at,
      });
    }
  }
  return { pieces, posts: [...posts.values()] };
}

/**
 * The horizontal slice of a piece's frame to keep for a trimmed piece, in frame px.
 *
 * A wall runs diagonally on screen, but its length maps monotonically onto screen x: one tile
 * along world x is half a diamond right, along world y half a diamond left. So a trim is a cut
 * on one screen column, measured from the frame's anchor (the piece's centre).
 */
export function trimCrop(
  axis: WallAxis,
  keep: number,
  frame: { width: number; anchorX: number },
): { x: number; width: number } {
  if (keep >= 1) return { x: 0, width: frame.width };
  const origin = frame.width * frame.anchorX;
  const perTile = TILE_WIDTH / 2;
  if (axis === "x") return { x: 0, width: origin + (keep - 0.5) * perTile };
  const x = origin + (0.5 - keep) * perTile;
  return { x, width: frame.width - x };
}
