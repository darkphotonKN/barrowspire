/**
 * Server walls as baked wall pieces (FS-2325V §C.2).
 *
 * A server wall is an axis-aligned world rect. It is drawn as a run of one-tile pieces along its
 * centreline, each its own sprite sorted by its own footprint, with a corner post at each end.
 * A dungeon floor's walls are cut the same way along their wall edges instead (`planEdgeWalls`,
 * FS-XK2B6).
 * North- and west-facing house sides stand full height; south and east sides are the low
 * cut-away, so the fixed camera sees into a house. Variants are hashed per piece, never random.
 * The same geometry draws timber house walls or masonry partition walls (FS-8RBQY §B.2): only
 * the sheets and the variant tables change, so a world theme picks a {@link WallSheets}.
 *
 * The bake's facts this relies on (`tools/bake/page/models/architecture.js`): a piece is one
 * tile long, its origin is the centre of its footprint, and `_x` pieces run along world x.
 */

// by path, not the barrel: the barrel pulls in the Phaser drawing helpers, and this is pure maths
import { TILE_WIDTH, WORLD_PX_PER_TILE, type Point } from "@/render/iso/projection";
import type { WallState } from "@/types/gameState";
import { tileHash } from "./ground";
import { axisOf, housesFrom, type House } from "./houses";

export type WallHeight = "back" | "front";
export type WallAxis = "x" | "y";
export type HouseSide = "north" | "south" | "east" | "west";

export interface WallPiece {
  /** The server wall this piece is part of. */
  wallId: string;
  /**
   * Manifest sheet: `{prefix}wall_{back|front|exterior}_{kind}_{x|y}`, e.g. `wall_back_torch_x`.
   * An exterior piece (FS-9PN7X §B.2) is full height, so its `height` is `back`.
   */
  sheet: string;
  height: WallHeight;
  /** Variant frame; the art library wraps it. */
  index: number;
  axis: WallAxis;
  /** World position of the piece's origin (the centre of a whole tile of wall). */
  at: Point;
  /** How much of the tile is wall, 0..1. Below 1 the piece is trimmed at its far end. */
  keep: number;
  /**
   * What the piece sorts by: the back corner of the kept footprint; for a dungeon floor's piece
   * on an edge whose wall cell lies south or east of it, the front corner (ADR-0074).
   */
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

export { axisOf, onOutline } from "./houses";

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

/**
 * How a wall decides each piece by where it stands, in place of the side of a house: its height,
 * and whether it may carry a light (the Inn's partition, `INTERIOR_PARTITION`; a dungeon floor's
 * fog reads its per-cell rule, FS-KE075 §H.46, until it follows the wall edges, FS-XK2B6 §F).
 */
export interface PieceRule {
  height(at: Point): WallHeight;
  /** Whether a piece here may be a kind that carries a light; when not, it is the plain kind. */
  lit(at: Point): boolean;
}

/** Share of whole pieces of each kind, cumulative, in percent. The first kind is the plain one. */
export type VariantTable = readonly (readonly [number, string])[];

/** The sheets one material draws server walls with, and how often each kind turns up. */
export interface WallSheets {
  /** Before every piece and post sheet name: `""` for timber, `"tower_"` for masonry. */
  prefix: string;
  /**
   * How thick the material's wall is, in tiles (FS-XK2B6 §A.2): the one place the client holds it.
   * It mirrors the bake model the sheets are rendered from, which also makes the post that square.
   */
  thickness: number;
  /** Kinds a full-height piece may be. */
  back: VariantTable;
  /** Kinds a cut-away piece may be. */
  front: VariantTable;
  /**
   * Kinds a building exterior's south or east piece may be (FS-9PN7X §B.2, §F.2): the outward
   * face, full height, so no interior dressing and no light.
   */
  outward: VariantTable;
  /** The stone cap laid over the building (FS-9PN7X §F.3); absent, the building has a roof. */
  cap?: string;
  /**
   * The kinds whose sheets carry a light (their manifest entries declare one): where a piece rule
   * lets no light stand, these are drawn plain (FS-KE075 §H.47).
   */
  lit?: readonly string[];
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
  // tools/bake/page/models/architecture.js `THICK`
  thickness: 0.18,
  back: KINDS,
  front: KINDS,
  // the outward face: a shuttered or dark window, never a torch (FS-9PN7X §F.2)
  outward: [
    [62, "plain"],
    [86, "brace"],
    [100, "window"],
  ],
  lit: ["torch", "window"],
};

/**
 * Masonry partition walls (FS-8RBQY §B.2): no window indoors, and the low cut-away side is plain
 * or pillared. These are the `middle` floor band's shares; the band table varies them per floor.
 */
export const MASONRY_WALLS: WallSheets = {
  prefix: "tower_",
  // tools/bake/page/models/tower.js `P_THICK`
  thickness: 0.24,
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
  outward: [
    [70, "plain"],
    [100, "pillar"],
  ],
  cap: "tower_cap",
  lit: ["sconce"],
};

/** A material's wall thickness in world px: 9.6 for the tower's masonry, 7.2 for timber. */
export const thicknessPx = (sheets: WallSheets): number => sheets.thickness * T;

/** Cuts one wall rect into pieces along its centreline, trimmed at the far end if it must be. */
export function cutWall(
  w: WallState,
  height: WallHeight,
  seed: number,
  sheets: WallSheets = TIMBER_WALLS,
): WallPiece[] {
  const look = { height, stem: `${sheets.prefix}wall_${height}`, kinds: sheets[height] };
  return cut(w, seed, () => look);
}

/**
 * A building exterior's south or east wall (FS-9PN7X §B.2): the same pieces `cutWall` gives its
 * cut-away, on exactly the same footprint (centreline, span, trim, sort corner), but full height
 * in the type's outward face.
 */
export function cutExterior(
  w: WallState,
  seed: number,
  sheets: WallSheets = TIMBER_WALLS,
): WallPiece[] {
  const look = { height: "back" as const, stem: `${sheets.prefix}wall_exterior`, kinds: sheets.outward };
  return cut(w, seed, () => look);
}

/**
 * One wall rect cut by a piece rule: each piece takes the rule's height where it stands, and
 * where the rule lets no light stand, a lit kind is the plain kind instead, so the share of every
 * other kind is kept.
 */
export function cutByRule(
  w: WallState,
  seed: number,
  sheets: WallSheets,
  rule: PieceRule,
): WallPiece[] {
  return cut(w, seed, (at) => lookOf(sheets, rule.height(at), rule.lit(at)));
}

/** A piece of a height as a material draws it; where no light may stand, its lit kinds plain. */
const lookOf = (sheets: WallSheets, height: WallHeight, lit: boolean): PieceLook => ({
  height,
  stem: `${sheets.prefix}wall_${height}`,
  kinds: lit ? sheets[height] : unlit(sheets[height], sheets.lit ?? []),
});

/** A variant table with each lit kind turned to the plain kind, its share and all. */
const unlit = (kinds: VariantTable, lit: readonly string[]): VariantTable =>
  kinds.map(([share, kind]) => [share, lit.includes(kind) ? kinds[0][1] : kind] as const);

/**
 * A material's sheets with no lit kind inside: every torch or lit window a back or cut-away piece
 * could be is its plain kind instead, the other kinds' shares kept. The outward face is never lit,
 * so it stays. The Inn's walls (hubInteriors `townHouseLook`).
 */
export function unlitSheets(sheets: WallSheets): WallSheets {
  const lit = sheets.lit ?? [];
  return { ...sheets, back: unlit(sheets.back, lit), front: unlit(sheets.front, lit), lit: [] };
}

/**
 * A partition across a town building (the Inn's, between its great hall and taproom), drawn with
 * MASONRY_WALLS: low everywhere, so the camera sees over it into whichever hall lies behind, and
 * carrying no light. It is interior masonry, never one of the building's cut-away outer walls.
 */
export const INTERIOR_PARTITION: PieceRule = {
  height: () => "front",
  lit: () => false,
};

/** What a piece standing at a place is drawn as: its height, sheet stem and kinds. */
type PieceLook = { height: WallHeight; stem: string; kinds: VariantTable };

/** A whole or trimmed tile of wall standing at `at`, its kind and variant hashed from that place. */
function pieceAt(
  wallId: string,
  axis: WallAxis,
  at: Point,
  keep: number,
  depthAt: Point,
  seed: number,
  { height, stem, kinds }: PieceLook,
): WallPiece {
  const h = tileHash(Math.round(at.x), Math.round(at.y), seed);
  const kind = keep < 1 ? kinds[0][1] : kinds.find(([cut]) => h % 100 < cut)![1];
  return { wallId, sheet: `${stem}_${kind}_${axis}`, height, index: h >>> 8, axis, at, keep, depthAt };
}

function cut(w: WallState, seed: number, lookAt: (at: Point) => PieceLook): WallPiece[] {
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
    pieces.push(pieceAt(w.entity_id, axis, at, keep, depthAt, seed, lookAt(at)));
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
 * walls meet, as tall as the tallest wall it joins. With a piece rule, each piece and post takes
 * the rule's height where it stands instead of its house side's.
 */
export function planWalls(
  walls: readonly WallState[],
  seed: number,
  sheets: WallSheets = TIMBER_WALLS,
  rule?: PieceRule,
): { pieces: WallPiece[]; posts: WallPost[] } {
  const houses = new Map(housesFrom(walls).map((h) => [h.id, h]));
  const pieces: WallPiece[] = [];
  const posts = new Map<string, WallPost>();

  for (const w of walls) {
    const side = heightOf(sideOf(w, w.house_id ? houses.get(w.house_id) : undefined));
    const ends = endsOf(w);
    pieces.push(...(rule ? cutByRule(w, seed, sheets, rule) : cutWall(w, side, seed, sheets)));
    for (const at of ends) {
      const height = rule ? rule.height(at) : side;
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
 * An edge run as its pieces are cut from it (a dungeon floor's wall plan, FS-XK2B6 §I.27): the
 * wall's face towards the cells it faces stands on the line from `from` to `to`, a whole number
 * of tiles long, and its thickness lies on the `wallSide` of that line.
 */
export interface EdgeLine {
  wallId: string;
  axis: WallAxis;
  from: Point;
  to: Point;
  /** The side of the line the wall's thickness, and its wall cells, lie on. */
  wallSide: HouseSide;
  height: WallHeight;
  /** World px. */
  thickness: number;
}

/**
 * Walls drawn on their edges (a dungeon floor, FS-XK2B6 §A–§D): each run's pieces lie end to end
 * along its line, none trimmed and none past its two ends, each piece's centre half a thickness
 * to the wall side, so its face stands on the line. Every piece takes its run's height; `lit`
 * says, of a run and the place a piece of it stands, whether that piece may be a kind that
 * carries a light. A post stands where the plan puts one.
 *
 * A piece sorts by the corner of its footprint away from the cells its edge faces (ADR-0074): the
 * front corner when its wall's thickness lies south or east of the line, so a body pressed
 * against that wall is drawn behind it; the back corner otherwise, as every other wall piece.
 */
export function planEdgeWalls<R extends EdgeLine>(
  plan: { runs: readonly R[]; posts: readonly Pick<WallPost, "wallId" | "at" | "height">[] },
  seed: number,
  sheets: WallSheets,
  lit: (run: R, at: Point) => boolean,
): { pieces: WallPiece[]; posts: WallPost[] } {
  const pieces: WallPiece[] = [];
  for (const run of plan.runs) {
    const { axis, wallSide } = run;
    const across = axis === "x" ? "y" : "x";
    // towards the wall cells: world +x and +y run towards the camera
    const out = wallSide === "south" || wallSide === "east" ? 1 : -1;
    const centre = run.from[across] + (out * run.thickness) / 2;
    const count = Math.round((run.to[axis] - run.from[axis]) / T);
    for (let k = 0; k < count; k++) {
      const along = run.from[axis] + (k + 0.5) * T;
      const place = (a: number, b: number): Point => (axis === "x" ? { x: a, y: b } : { x: b, y: a });
      const at = place(along, centre);
      const depthAt = place(along + (out * T) / 2, centre + (out * run.thickness) / 2);
      pieces.push(pieceAt(run.wallId, axis, at, 1, depthAt, seed, lookOf(sheets, run.height, lit(run, at))));
    }
  }
  const posts = plan.posts.map(({ wallId, at, height }) => ({ wallId, sheet: `${sheets.prefix}post_${height}`, height, at }));
  return { pieces, posts };
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
