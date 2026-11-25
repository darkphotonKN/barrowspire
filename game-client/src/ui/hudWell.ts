/**
 * The HUD's well (FS-Q18Q3 §C R13, R17, §D R18): a square of the HUD panel with a carved line inside it, in a
 * 1 px brass rim, or lit 2 px bright brass, and swept by a dark wedge while it cools. The ability bar's squares
 * wear it, and the roll pip beside them (FS-7P736 R16), from here, so the two never drift apart. Colours from
 * `palette`.
 */

import type Phaser from "phaser";
import { palette } from "@/utils/canvasPalette";
import type { Rect } from "./hudCornerLayout";

/** The well's fill, and its 1 px rim (R13). A tooltip's ground and a plaque's rim are worn the same. */
export const WELL_ALPHA = 0.85;
export const RIM_ALPHA = 0.6;
/** The carved line, this far inside the well's edge. */
export const CARVE_INSET = 3;
export const CARVE_ALPHA = 0.5;
/** The lit rim, an active square's or a ready pip's (R17). */
export const LIT_RIM_W = 2;
/** The sweep's wedge over a cooling well (R18). */
export const SWEEP_ALPHA = 0.55;

export type WellGraphics = Pick<Phaser.GameObjects.Graphics, "fillStyle" | "fillRect" | "lineStyle" | "strokeRect">;

/** The well's ground on `g`, under the sweep: the HUD panel, and its carved line. */
export function drawWellGround(g: WellGraphics, well: Rect): void {
  g.fillStyle(palette.hudPanel, WELL_ALPHA);
  g.fillRect(well.x, well.y, well.width, well.height);
  g.lineStyle(1, palette.hudPanelDeep, CARVE_ALPHA);
  g.strokeRect(well.x + CARVE_INSET, well.y + CARVE_INSET, well.width - CARVE_INSET * 2, well.height - CARVE_INSET * 2);
}

/** The well's rim on `g`, over the sweep: lit, bright brass and 2 px; else the faint 1 px frame. */
export function drawWellRim(g: WellGraphics, well: Rect, lit: boolean): void {
  if (lit) g.lineStyle(LIT_RIM_W, palette.frameBright, 1);
  else g.lineStyle(1, palette.frame, RIM_ALPHA);
  g.strokeRect(well.x, well.y, well.width, well.height);
}
