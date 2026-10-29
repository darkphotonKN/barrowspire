/**
 * A chest on the canvas: a run's coffer, and a field's clearing chest (FS-3QHQZ §Requirements 19),
 * drawn the same way in both. Its baked sheet has one frame per state, `closed` and `open`
 * (guideline "Props"), chosen from the server's `is_open` on every state; without the sheet, a
 * placeholder texture per state, built in code (ADR-0021), stands in.
 *
 * Phaser-free: it paints through {@link ChestBrush}, the slice of `Phaser.GameObjects.Graphics`
 * it uses. A scene bakes both placeholders to textures once.
 */

import { palette } from "@/utils/canvasPalette";

export type ChestFrame = "closed" | "open";

/** The chest's baked sheet, and its placeholder textures' keys and size. */
export const CHEST = {
  sheet: "chest",
  width: 40,
  height: 32,
  placeholder: { closed: "chest_closed", open: "chest_open" } as Record<ChestFrame, string>,
} as const;

/** The frame a chest shows for its server state. */
export function chestFrame(isOpen: boolean): ChestFrame {
  return isOpen ? "open" : "closed";
}

/** What the painter asks of a graphics object. */
export interface ChestBrush {
  fillStyle(color: number, alpha?: number): unknown;
  fillRect(x: number, y: number, width: number, height: number): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  strokeRect(x: number, y: number, width: number, height: number): unknown;
}

/** Paints one placeholder frame into a {@link CHEST}-sized texture. */
export function paintChest(g: ChestBrush, frame: ChestFrame): void {
  const { width, height } = CHEST;
  if (frame === "closed") {
    g.fillStyle(palette.floor, 1);
    g.fillRect(0, 10, width, height - 10);
    g.fillStyle(palette.ground, 1);
    g.fillRect(0, 0, width, 12);
    g.fillStyle(palette.frameBright, 1);
    g.fillRect(0, 10, width, 3);
    g.fillRect(16, 6, 8, 10);
  } else {
    g.fillStyle(palette.floor, 1);
    g.fillRect(0, 16, width, height - 16);
    g.fillStyle(palette.ground, 1);
    g.fillRect(0, 0, width, 10);
    g.fillStyle(palette.hudText, 1);
    g.fillRect(4, 18, width - 8, height - 22);
    g.fillStyle(palette.frameBright, 1);
    g.fillRect(0, 16, width, 3);
  }
  g.lineStyle(2, palette.playerCloak, 1);
  g.strokeRect(0, 0, width, height);
}
