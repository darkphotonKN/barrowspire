/**
 * The overhead health bar of a teammate (FS-8AY7S req 27, while FS-CH21F R14's switch is on) and of
 * an ally (FS-4EC7Z §G R29): the monsters' overhead style, health only. A pitch backing with a barrow
 * rim, and the health fill, in the poison ink while poisoned (FS-5FZ4J §J R55).
 */

import type { Point } from "@/render/iso/projection";
import { palette } from "@/utils/canvasPalette";
import { MARKER_BAR } from "./markers";

/** The bar's size, and the px it stands over the marker base. */
export const TEAMMATE_BAR = { width: 38, height: 4, gap: 2 } as const;

/** What the bar is painted on: a Phaser Graphics, or a test's recorder. */
export interface TeammateBarPainter {
  fillStyle(color: number, alpha?: number): unknown;
  fillRect(x: number, y: number, w: number, h: number): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  strokeRect(x: number, y: number, w: number, h: number): unknown;
}

/** The bar's top over marker base `base`, on a whole px. */
export const teammateBarTop = (base: number): number => Math.round(base - TEAMMATE_BAR.gap - TEAMMATE_BAR.height);

/** The bar `fill` full (0–1), its fill's top-left at `at` (the painter's own origin by default). */
export function paintTeammateBar(
  g: TeammateBarPainter,
  fill: number,
  { poisoned = false, at = { x: 0, y: 0 } }: { poisoned?: boolean; at?: Point } = {},
): void {
  const { width, height } = TEAMMATE_BAR;
  const { x, y } = at;
  g.fillStyle(MARKER_BAR.backing, 0.9);
  g.fillRect(x - 1, y - 1, width + 2, height + 2);
  g.lineStyle(1, MARKER_BAR.rim, 0.9);
  g.strokeRect(x - 1, y - 1, width + 2, height + 2);
  g.fillStyle(poisoned ? palette.poisoned : MARKER_BAR.hp, 1);
  g.fillRect(x, y, Math.round(width * fill), height);
}
