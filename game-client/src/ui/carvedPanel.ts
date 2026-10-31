/**
 * The in-world panel house style (design guideline "Panels in the world"): dark vellum on carved
 * stone, a soft drop shadow, a lit top edge, a double brass rule and a brass stud at each corner.
 * First drawn for the NPC dialogue; the chat window wears it too (FS-WJGFJ, asked 2026-10-31).
 */

import type Phaser from "phaser";
import { shade, tint } from "@/utils/canvasPalette";
import { BARROW_HEX as hex } from "@/utils/theme";

export interface CarvedPanelOptions {
  /**
   * How much of the world shows through: scales the shadow's and the grounds' alpha, never the
   * brass, so the frame stays crisp over a see-through panel. 1 is the dialogue's solid card.
   */
  opacity?: number;
}

export function carvedPanel(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  { opacity = 1 }: CarvedPanelOptions = {},
): void {
  g.fillStyle(hex.pitch, 0.55 * opacity);
  g.fillRoundedRect(x - 2, y + 3, w + 4, h + 4, 7);
  g.fillStyle(shade(hex.charcoal, 0.2), 0.97 * opacity);
  g.fillRoundedRect(x, y, w, h, 6);
  g.fillStyle(hex.umber, 0.9 * opacity);
  g.fillRoundedRect(x + 1, y + 1, w - 2, h - 4, 5);
  g.lineStyle(1, tint(hex.umber, 0.12), 0.7);
  g.lineBetween(x + 6, y + 1.5, x + w - 6, y + 1.5);
  g.lineStyle(1, hex.brass, 0.75);
  g.strokeRoundedRect(x + 0.5, y + 0.5, w - 1, h - 1, 6);
  g.lineStyle(1, hex.brass, 0.22);
  g.strokeRoundedRect(x + 4.5, y + 4.5, w - 9, h - 9, 3);
  for (const [cx, cy] of [
    [x + 4.5, y + 4.5],
    [x + w - 4.5, y + 4.5],
    [x + 4.5, y + h - 4.5],
    [x + w - 4.5, y + h - 4.5],
  ]) {
    g.fillStyle(hex.brass, 1);
    g.fillCircle(cx, cy, 2);
    g.fillStyle(hex.brassBright, 0.9);
    g.fillCircle(cx - 0.5, cy - 0.5, 0.9);
  }
}
