/**
 * Roofs laid from baked slope and ridge pieces (FS-2325V §C.3).
 *
 * A roof is rows of one-tile slope pieces climbing from each eave to a ridge over the house's
 * middle, along its longer side. A slope piece's origin is the centre of its footprint at its low
 * edge's height, so row k is lifted k rises above the eave, and the eave sits on the back walls'
 * tops. Rows are laid outward from the ridge, so the two halves meet exactly under it and any
 * part-tile goes to the eave overhang instead.
 */

import { WORLD_PX_PER_TILE, type Point } from "@/render/iso";
import { BAKE } from "./bake";
import { tileHash } from "./ground";
import type { House } from "./houses";

export interface RoofPiece {
  sheet: "roof_slope" | "roof_ridge";
  /** The slope's downhill side (n/e/s/w), or the ridge's axis (x/y). */
  animation: string;
  /** World position of the piece's footprint centre; also what it sorts by. */
  at: Point;
  /** Screen px above the ground the piece is drawn. */
  lift: number;
}

const T = WORLD_PX_PER_TILE;
/** How far the roof reaches past the walls, at least, in world px. */
export const ROOF_EAVE = 10;

export function planRoof(house: House): RoofPiece[] {
  const alongX = house.width >= house.height;
  // "along" runs with the ridge, "across" climbs from one eave to the other
  const alongLength = (alongX ? house.width : house.height) + 2 * ROOF_EAVE;
  const halfAcross = (alongX ? house.height : house.width) / 2 + ROOF_EAVE;
  const cols = Math.ceil(alongLength / T - 1e-6);
  const rows = Math.ceil(halfAcross / T - 1e-6);
  const midAlong = alongX
    ? house.x + house.width / 2
    : house.y + house.height / 2;
  const midAcross = alongX
    ? house.y + house.height / 2
    : house.x + house.width / 2;
  const base = BAKE.WALL_BACK * BAKE.VPX;
  const rise = BAKE.ROOF_RISE * BAKE.VPX;
  const [downhillFar, downhillNear] = alongX ? ["s", "n"] : ["e", "w"];
  const point = (along: number, across: number): Point =>
    alongX ? { x: along, y: across } : { x: across, y: along };

  const pieces: RoofPiece[] = [];
  for (let i = 0; i < cols; i++) {
    const along = midAlong + (i + 0.5 - cols / 2) * T;
    for (let j = 0; j < rows; j++) {
      // j counts from the ridge outward; the eave row (j = rows - 1) sits on the walls
      const lift = base + (rows - 1 - j) * rise;
      const out = (j + 0.5) * T;
      pieces.push({
        sheet: "roof_slope",
        animation: downhillFar,
        at: point(along, midAcross + out),
        lift,
      });
      pieces.push({
        sheet: "roof_slope",
        animation: downhillNear,
        at: point(along, midAcross - out),
        lift,
      });
    }
    pieces.push({
      sheet: "roof_ridge",
      animation: alongX ? "x" : "y",
      at: point(along, midAcross),
      lift: base + rows * rise,
    });
  }
  return pieces;
}

/**
 * How far above a gable piece's origin (its foot) its top edge starts, in screen px: one back
 * wall's height (`tools/bake/page/models/building.js#timberGable`). Lifted to meet the roof, the
 * piece's foot hangs that far below the roof's line, in the end wall's plane, hidden by the wall
 * in front of it, so a piece closes the gable from the walls' tops up to the roof whichever row it
 * stands under. Its foot reaches the walls' tops while a roof has at most six rows (a house's
 * shorter side up to 460 world px; the run's large building, 400, is the deepest today).
 */
export const GABLE_FOOT = BAKE.WALL_BACK * BAKE.VPX;

export interface GablePiece {
  /** `roof_gable_{x|y}`, named for the ridge it closes the ends of, as `roof_ridge`'s animations. */
  sheet: "roof_gable_x" | "roof_gable_y";
  /** The roof half it closes, by that half's downhill side: n/s on an x ridge, e/w on a y ridge. */
  animation: string;
  /** World position of its footprint centre, on the end wall's centreline. */
  at: Point;
  /**
   * Screen px above the ground the piece is drawn (its origin, at its foot). Its top edge's low
   * (eave-side) end stands GABLE_FOOT higher, on the roof's line under the slope over it.
   */
  lift: number;
  /**
   * What it sorts by: a hair behind every end wall piece it rises from (which hides its foot) and
   * every roof piece over it (which hides its top edge). Nothing behind it shows above the walls.
   */
  depthAt: Point;
}

/**
 * The timber gables that close a roof's two ends (FS-9PN7X, ADR-0036): the triangle between an end
 * wall's top and the roof's slopes, so a closed block never shows its inside under the roof.
 *
 * Each half of each end is a run of one-tile pieces on the end wall's centreline, laid outward
 * from the ridge in step with `planRoof`'s rows, so a piece's top edge climbs one rise across its
 * tile under that row's slope piece, from that row's lift. The last piece is pulled in to end
 * on the side wall's centreline, where the corner post stands, so none pokes out under the eave.
 * `wallThickness` is the server's (20 world px for the hub and runs alike).
 */
export function planGables(house: House, wallThickness: number): GablePiece[] {
  const alongX = house.width >= house.height;
  const across = alongX ? house.height : house.width;
  // planRoof's rows: the roof line falls one rise a tile from the ridge to the eave
  const rows = Math.ceil((across / 2 + ROOF_EAVE) / T - 1e-6);
  const base = BAKE.WALL_BACK * BAKE.VPX;
  const rise = BAKE.ROOF_RISE * BAKE.VPX;
  const midAcross = alongX
    ? house.y + house.height / 2
    : house.x + house.width / 2;
  const half = wallThickness / 2;
  // from the ridge to the side walls' centreline
  const reach = across / 2 - half;
  const count = Math.max(1, Math.ceil(reach / T - 1e-6));
  const ends = alongX
    ? [house.x + half, house.x + house.width - half]
    : [house.y + half, house.y + house.height - half];
  const [downhillFar, downhillNear] = alongX ? ["s", "n"] : ["e", "w"];
  const point = (along: number, acrossAt: number): Point =>
    alongX ? { x: along, y: acrossAt } : { x: acrossAt, y: along };

  const pieces: GablePiece[] = [];
  for (const end of ends)
    for (const [animation, sign] of [
      [downhillFar, 1],
      [downhillNear, -1],
    ] as const)
      for (let k = 0; k < count; k++) {
        // the tile's edge nearer the ridge; the last tile ends on the side wall's centreline
        const inner = Math.min(k * T, Math.max(0, reach - T));
        const centre = midAcross + sign * (inner + T / 2);
        pieces.push({
          sheet: alongX ? "roof_gable_x" : "roof_gable_y",
          animation,
          at: point(end, centre),
          lift: base + (rows - (inner + T) / T) * rise - GABLE_FOOT,
          // the end wall's back face, a tile before the piece's low corner: behind the wall
          // pieces under it and the roof pieces over it, which all sort from there on
          depthAt: point(end - half, centre - T / 2 - T),
        });
      }
  return pieces;
}

/**
 * The chimney's pot rim above the roof it stands on, in tile edges: `tools/bake/page/models/
 * town.js#chimney` (stack, cap and a clay pot to 1.70). Where its smoke leaves.
 */
export const CHIMNEY_POT = 1.7;

/** A chimney on a roof (FS-KYPQ9 §A.6): part of the drawn roof, not a ground prop. */
export interface ChimneySpot {
  /** World position of its footprint: the middle of the roof piece it stands on. */
  at: Point;
  /** Screen px above the ground of the roof's surface there, where the stack stands. */
  lift: number;
  /** Screen px above the ground of its pot, where the smoke leaves. */
  top: number;
}

/**
 * Where a house's one chimney stands: on the slope facing the camera (downhill to the south on
 * an x ridge, to the east on a y ridge), in the row against the ridge, a tile clear of the gable
 * ends, chosen among those spots by `tileHash` of the house's corner. The same walls give the
 * same spot on every client. A house too small for that falls back to any piece of that row.
 *
 * The camera is fixed in the south-east and the back slope is all but edge-on to it, so a stack
 * standing there shows only above the ridge, its foot hidden, and reads as a pillar standing on
 * the ground behind the house. On the camera-facing slope it visibly rises out of the shingles
 * (FS-KYPQ9 §A.6, as revised).
 */
export function planChimney(house: House, seed: number): ChimneySpot {
  const alongX = house.width >= house.height;
  const front = alongX ? "s" : "e";
  const slopes = planRoof(house).filter(
    (p) => p.sheet === "roof_slope" && p.animation === front,
  );
  const top = Math.max(...slopes.map((p) => p.lift));
  const row = slopes.filter((p) => p.lift === top);
  const [lo, hi] = alongX
    ? [house.x, house.x + house.width]
    : [house.y, house.y + house.height];
  const fits = row.filter((p) => {
    const along = alongX ? p.at.x : p.at.y;
    return along - T / 2 >= lo && along + T / 2 <= hi;
  });
  const choices = fits.length > 0 ? fits : row;
  const pick =
    choices[
      tileHash(Math.round(house.x), Math.round(house.y), seed) % choices.length
    ];
  // a piece stands at its low edge's height: the surface at its middle is half a rise above
  const lift = pick.lift + (BAKE.ROOF_RISE * BAKE.VPX) / 2;
  return { at: pick.at, lift, top: lift + CHIMNEY_POT * BAKE.VPX };
}
