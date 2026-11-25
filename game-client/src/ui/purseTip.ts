/**
 * The purse line's tip (FS-7TGZ3 R5–6): "Available X · Held in bids Y" on the item tip's own ground,
 * shown while the pointer is over a purse line, the gear overlay's and the wares panel's alike. The
 * caller stands it at its depth and its place.
 */

import type Phaser from "phaser";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { tipGround } from "./itemTip";

/** The tip's padding and text size, as the item tip's body (R6). */
const PURSE_TIP_PAD = 10;
const PURSE_TIP_SIZE = 12;

export interface PurseTip {
  container: Phaser.GameObjects.Container;
  width: number;
  height: number;
}

/** The tip of `words`, its ground and its line in a container at 0, 0, with its size. */
export function buildPurseTip(scene: Phaser.Scene, words: string): PurseTip {
  const text = scene.add.text(PURSE_TIP_PAD, PURSE_TIP_PAD, words, {
    fontFamily: CANVAS_FONT.body,
    fontSize: `${PURSE_TIP_SIZE}px`,
    color: toCss(palette.hudText),
    letterSpacing: 1,
  });
  const width = Math.round(text.width + PURSE_TIP_PAD * 2);
  const height = Math.round(text.height + PURSE_TIP_PAD * 2);
  const container = scene.add.container(0, 0, [tipGround(scene, width, height), text]);
  return { container, width, height };
}
