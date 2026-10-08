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
