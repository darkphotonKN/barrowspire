/**
 * The hub's stash chest (FS-VPD8Y §E R31–R33): where it stands in the Quartermaster's store and
 * how it is told apart from a run's coffer. Client-side dressing: nothing collides with it, so
 * the hub's obstacles stay the server's and game-service is not changed (R31). Everyone sees the
 * same chest; each player opens their own stash at it.
 *
 * Its look reuses the run chest's baked sheet (`CHEST`), drawn under a slight tint and stood on a
 * plate with a trim painted in code, every colour a palette token (R32; ADR-0013, ADR-0021). The
 * "Stash" nameplate is an FS-MRZH7 function marker, drawn by the scene.
 *
 * Pure data and maths, no Phaser.
 */

// by path, not the barrel: the barrel pulls in the Phaser drawing helpers
import type { Point } from "@/render/iso/projection";
import { palette } from "@/utils/canvasPalette";
import { CHEST } from "./chest";
import type { IndoorSpot } from "./hubInteriors";

/**
 * The chest, against the store's west wall between the shelf and the barrel: more than the talk
 * range and a margin from the Quartermaster (1280, 270), off the store's dressing and off the
 * walk in from the door (R31). It stands within talk range of the road past the west wall, so the
 * scene offers it only from inside the store (FS-B0H2D R14). `size` is its world footprint,
 * centred on `at`.
 */
export const HUB_STASH_CHEST: IndoorSpot = {
  sheet: CHEST.sheet,
  at: { x: 1180, y: 245 },
  r: 18,
  size: [36, 28],
};

/** The chest's nameplate (R33). */
export const STASH_NAME = "Stash";

/** The slight cast over the run chest's art (R32). */
export const STASH_CHEST_TINT = palette.stashChestTint;

/** World px the plate reaches past the chest's footprint on every side. */
const PLATE_MARGIN = 6;
/** The trim's width, in world px, and the plate's opacity over the floor. */
const TRIM_W = 1.5;
const PLATE_ALPHA = 0.7;

/** A world rect, top-left and size. */
export interface PlateRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The plate the chest stands on: its footprint grown by the margin (R32). */
export function stashPlate(spot: {
  at: Point;
  size: [number, number];
}): PlateRect {
  const [w, h] = spot.size;
  return {
    x: spot.at.x - w / 2 - PLATE_MARGIN,
    y: spot.at.y - h / 2 - PLATE_MARGIN,
    width: w + 2 * PLATE_MARGIN,
    height: h + 2 * PLATE_MARGIN,
  };
}

/** What the painter asks of a graphics object. */
export interface PlateBrush {
  fillStyle(color: number, alpha?: number): unknown;
  fillRect(x: number, y: number, width: number, height: number): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  strokeRect(x: number, y: number, width: number, height: number): unknown;
}

/**
 * Paints the plate in world coordinates, for a plane that carries the projection: a dark ground
 * and a brass trim inset from its edge.
 */
export function paintStashPlate(g: PlateBrush, plate: PlateRect): void {
  g.fillStyle(palette.stashChestPlate, PLATE_ALPHA);
  g.fillRect(plate.x, plate.y, plate.width, plate.height);
  g.lineStyle(TRIM_W, palette.stashChestTrim, 0.9);
  g.strokeRect(plate.x + 2, plate.y + 2, plate.width - 4, plate.height - 4);
}
