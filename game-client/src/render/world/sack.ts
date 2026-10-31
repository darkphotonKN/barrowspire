/**
 * A sack on the canvas (FS-1D6BX §Requirements 13, 17): the stingier container that may stand
 * where a chest would, in a run and in a field, drawn the same way in both. Like the chest it has
 * two frames, `closed` and `open`, chosen from the server's `is_open` on every state, and an
 * opened sack stays drawn open, emptied or not (D3). Its baked sheet is `sack`, one frame per
 * state named as the chest's are (guideline "Props"); until the bake lands, a placeholder texture
 * per state, built in code (ADR-0021), stands in.
 *
 * Phaser-free: it paints through {@link SackBrush}, the slice of `Phaser.GameObjects.Graphics`
 * it uses. A scene bakes both placeholders to textures once.
 */

import type { Point } from "@/render/iso/projection";
import { palette } from "@/utils/canvasPalette";

export type SackFrame = "closed" | "open";

/** The sack's baked sheet, and its placeholder textures' keys and size. */
export const SACK = {
  sheet: "sack",
  width: 32,
  height: 30,
  placeholder: { closed: "sack_closed", open: "sack_open" } as Record<SackFrame, string>,
} as const;

/** The frame a sack shows for its server state. */
export function sackFrame(isOpen: boolean): SackFrame {
  return isOpen ? "open" : "closed";
}

/** What the painter asks of a graphics object. */
export interface SackBrush {
  fillStyle(color: number, alpha?: number): unknown;
  fillRect(x: number, y: number, width: number, height: number): unknown;
  fillEllipse(x: number, y: number, width: number, height: number): unknown;
  fillPoints(points: Point[], closeShape?: boolean): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  lineBetween(x1: number, y1: number, x2: number, y2: number): unknown;
}

/**
 * Paints one placeholder frame into a {@link SACK}-sized texture, lit from screen-left: a bulging
 * burlap body on a contact shadow. Closed, its neck is gathered and tied with a cord; open, the
 * neck is slumped wide around a dark mouth. The open frame carries no amber loot glint: an opened
 * sack stays drawn emptied too, and amber the player cannot act on is a defect (guideline
 * "Gameplay accent").
 */
export function paintSack(g: SackBrush, frame: SackFrame): void {
  const { width: w, height: h } = SACK;
  const foot = h - 4;

  // contact shadow, falling screen-right like the baked props'
  g.fillStyle(palette.inkDeep, 0.55);
  g.fillEllipse(w / 2 + 2, foot + 1, w - 6, 6);

  // the body, and its lit left shoulder
  g.fillStyle(palette.floorShade, 1);
  g.fillEllipse(w / 2, foot - 8, w - 6, 18);
  g.fillStyle(palette.floor, 1);
  g.fillEllipse(w / 2 - 2, foot - 9, w - 12, 14);

  if (frame === "closed") {
    // the gathered neck, tied off, and its frayed top
    g.fillStyle(palette.floor, 1);
    g.fillPoints(
      [
        { x: w / 2 - 6, y: foot - 15 },
        { x: w / 2 + 6, y: foot - 15 },
        { x: w / 2 + 3, y: 6 },
        { x: w / 2 - 3, y: 6 },
      ],
      true,
    );
    g.fillStyle(palette.floorShade, 1);
    g.fillEllipse(w / 2, 5, 10, 5);
    g.lineStyle(2, palette.frameBright, 1);
    g.lineBetween(w / 2 - 4, 9, w / 2 + 4, 9);
    g.lineBetween(w / 2 + 3, 9, w / 2 + 6, 13);
  } else {
    // the neck slumped wide, its lit rim, the dark mouth, and the loosed cord at its foot
    g.fillStyle(palette.floor, 1);
    g.fillEllipse(w / 2, foot - 16, w - 8, 9);
    g.lineStyle(1, palette.hudLabel, 1);
    g.lineBetween(w / 2 - 11, foot - 17, w / 2 - 4, foot - 20);
    g.fillStyle(palette.inkDeep, 1);
    g.fillEllipse(w / 2, foot - 16, w - 14, 5);
    g.fillStyle(palette.frameBright, 1);
    g.fillRect(4, foot - 6, 3, 2);
  }
}
