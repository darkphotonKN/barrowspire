/**
 * The run's dev position readout (FS-56CKV §C): the player's x/y, a developer aid, never player
 * HUD. Small vellum on the map name's faint plate (FS-56CKV §Change: Map name, E8 as amended
 * 2026-11-12): inside the map's bottom-right ("有小地圖時 x y座標不是要顯示在地圖框框內右下角嗎"), normal
 * or enlarged (「小地圖1.5倍時 區域名稱跟座標也要放在地圖內跟1倍時的位置一樣」, 2026-11-14, §Change: The
 * enlarged map keeps its labels inside, F2), under the top-right column in the overlay and with no
 * map. The scene makes and refreshes the text; this holds its look, where it stands, when it gives
 * way, and whether it is made at all.
 */

import type { Point, Rect } from "@/render/iso/projection";
import { palette } from "@/utils/canvasPalette";
import { MINIMAP } from "./minimap";
import { MINIMAP_NAME } from "./minimapName";

/**
 * Its look and place (§C.15, §C.16, §C.18; §Change: Map name, E8; F2): 10 px `hudText` at full ink
 * on the map name's plate (`hudPanel` at 0.75, padded 4 × 2), its ink 4.5:1 or better over the
 * plate; `inset` px inside the map's bottom-right, normal or enlarged, or `gap` px under the
 * column's last line; drawn over both minimap layers.
 */
export const POSITION_READOUT = {
  fontSize: "10px",
  colour: palette.hudText,
  plate: MINIMAP_NAME.plate,
  plateAlpha: MINIMAP_NAME.plateAlpha,
  padding: MINIMAP_NAME.padding,
  inset: MINIMAP.inset,
  gap: 4,
  depth: MINIMAP.depth + 1,
} as const;

/** Where the readout stands: a point, and which corner of its box stands on it (Phaser's origin). */
export interface PositionReadoutPlace extends Point {
  origin: Point;
}

/** What of the top-right corner the readout stands by. */
export interface ReadoutCorner {
  /** The minimap's panel where one is in the corner, normal or enlarged; null in the overlay or with none. */
  minimap: Rect | null;
  /** The column's right edge and its last line's bottom. */
  column: { right: number; bottom: number };
}

/**
 * Where the readout stands, on whole logical px (§C.18; §Change: Map name, E8; F2): its plate's
 * bottom-right `inset` px inside the map's, by one rule for the normal and the enlarged map,
 * measured against that map's own rect; otherwise its top-right `gap` px under the column's last
 * line.
 */
export function positionReadoutPlace(corner: ReadoutCorner): PositionReadoutPlace {
  const { minimap: map, column } = corner;
  const { inset, gap } = POSITION_READOUT;
  if (map) return { x: Math.round(map.x + map.width) - inset, y: Math.round(map.y + map.height) - inset, origin: { x: 1, y: 1 } };
  return { x: Math.round(column.right), y: Math.round(column.bottom) + gap, origin: { x: 1, y: 0 } };
}

/** The readout's box at `at` for a text of `size`. */
export function positionReadoutBox(at: PositionReadoutPlace, size: { width: number; height: number }): Rect {
  return { x: at.x - at.origin.x * size.width, y: at.y - at.origin.y * size.height, width: size.width, height: size.height };
}

/** Whether the readout's box meets one of `covers`, what stands at the top centre now: it is hidden while it does (as the name's E7; F4). */
export function readoutGivesWay(box: Rect, covers: readonly (Rect | null | undefined)[]): boolean {
  return covers.some((r) => !!r && box.x < r.x + r.width && r.x < box.x + box.width && box.y < r.y + r.height && r.y < box.y + box.height);
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
