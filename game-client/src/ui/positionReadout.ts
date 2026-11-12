/**
 * The run's dev position readout (FS-56CKV §C): the player's x/y, a developer aid, never player
 * HUD. Small and dim with no backing, in the minimap's top-right corner where one is shown, out of
 * the map mode icon's way in the bottom-left (FS-56CKV §Change: Map mode icon, D8), else under the
 * top-right column. The scene makes and refreshes the text; this holds its look, where
 * it stands, and whether it is made at all.
 */

import type { Point, Rect } from "@/render/iso/projection";
import { palette } from "@/utils/canvasPalette";
import { MINIMAP } from "./minimap";

/**
 * Its look and place (§C.14–§C.16, §C.18): 10 px in `hudText` at a partial alpha, no backing, its
 * ink 3:1 or better over the vignetted backing; its right and top edges `inset` px inside the
 * minimap's panel, or its top `gap` px under the column's last line; drawn over both minimap layers.
 */
export const POSITION_READOUT = {
  fontSize: "10px",
  colour: palette.hudText,
  alpha: 0.6,
  inset: MINIMAP.inset,
  gap: 4,
  depth: MINIMAP.depth + 1,
} as const;

/** Where the readout stands: a point, and which corner of its box stands on it (Phaser's origin). */
export interface PositionReadoutPlace extends Point {
  origin: Point;
}

/**
 * Where the readout stands (§C.18; §Change: Map mode icon, D8, replacing §C.14's bottom-left), on
 * whole logical px: its top-right `inset` px inside the shown minimap's top-right corner, which the
 * floor's diamond leaves as empty as the bottom-left, being symmetric about its centre; with no
 * minimap shown (null), its top-right `gap` px under the column's last line, on the column's right
 * edge.
 */
export function positionReadoutPlace(minimap: Rect | null, column: { right: number; bottom: number }): PositionReadoutPlace {
  if (minimap)
    return {
      x: Math.round(minimap.x + minimap.width) - POSITION_READOUT.inset,
      y: Math.round(minimap.y) + POSITION_READOUT.inset,
      origin: { x: 1, y: 0 },
    };
  return { x: Math.round(column.right), y: Math.round(column.bottom) + POSITION_READOUT.gap, origin: { x: 1, y: 0 } };
}

/**
 * Whether the run scene draws its debug position readout. It is a developer aid, not player HUD: `next dev` shows it and `next build`
 * leaves it out, because Next.js inlines `process.env.NODE_ENV` at build time.
 *
 * `NEXT_PUBLIC_SHOW_POSITION_READOUT` overrides that either way ("true"/"1" shows it on a
 * production build, "false"/"0" hides it in dev). Like every `NEXT_PUBLIC_*` value it is
 * baked in at build time, so changing it means rebuilding.
 */
export function showsPositionReadout(): boolean {
  const override = process.env.NEXT_PUBLIC_SHOW_POSITION_READOUT?.trim().toLowerCase();
  if (override === "true" || override === "1") return true;
  if (override === "false" || override === "0") return false;
  return process.env.NODE_ENV !== "production";
}
