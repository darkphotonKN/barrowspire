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
