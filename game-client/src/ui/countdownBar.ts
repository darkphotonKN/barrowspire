/**
 * The one countdown look in the game canvas (FS-B3NDZ): a bar along the bottom of its panel, edge
 * to edge, in the XP bar's bright brass on its charcoal track (`drawXpBar`'s look), draining
 * smoothly from the right toward the left, the left end anchored; and the whole seconds left as a
 * larger "<n>s" just above it. Every countdown in the canvas draws through here (the design
 * guideline, UI Chrome → Countdowns): the ready check, the party invite, the field's fallen state.
 *
 * The bar is redrawn every frame its panel shows, so its fill is never rounded to whole pixels.
 */

import type Phaser from "phaser";
import { palette } from "@/utils/canvasPalette";
import type { Rect } from "./partyPanelLayout";

/** The bar's height: thick enough to read, thicker than the XP bar's 5 px (R2). */
export const COUNTDOWN_BAR_H = 7;
/** The seconds' size, up from the popups' old 12 px (R8). */
export const COUNTDOWN_SECONDS_PX = 18;

/** The bar along a panel's foot: its full width, its bottom edge, never inset in its padding (R1). */
export function countdownBarRect(panel: Rect): Rect {
  return {
    x: panel.x,
    y: panel.y + panel.height - COUNTDOWN_BAR_H,
    width: panel.width,
    height: COUNTDOWN_BAR_H,
  };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** The fill: anchored at the bar's left edge, `fraction` of its width, so the right end recedes (R3). */
export function countdownBarFill(bar: Rect, fraction: number): Rect {
  return { ...bar, width: bar.width * clamp01(fraction) };
}

/** The whole seconds left as the countdown shows them (R8). */
export function countdownSecondsText(seconds: number): string {
  return `${seconds}s`;
}

/** The slice of a Phaser graphics the bar is drawn with. */
type BarGraphics = Pick<
  Phaser.GameObjects.Graphics,
  "fillStyle" | "fillRect" | "lineStyle" | "strokeRect"
>;

/** The bar, `fraction` full: the XP bar's charcoal track, bright-brass fill and brass rim (R5). */
export function drawCountdownBar(
  g: BarGraphics,
  bar: Rect,
  fraction: number,
): void {
  g.fillStyle(palette.xpTrack, 0.9);
  g.fillRect(bar.x, bar.y, bar.width, bar.height);
  const fill = countdownBarFill(bar, fraction);
  if (fill.width > 0) {
    g.fillStyle(palette.xpFill, 1);
    g.fillRect(fill.x, fill.y, fill.width, fill.height);
  }
  g.lineStyle(1, palette.frame, 0.6);
  g.strokeRect(bar.x, bar.y, bar.width, bar.height);
}
