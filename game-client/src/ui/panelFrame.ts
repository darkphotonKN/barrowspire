/**
 * The party panel's outer frame, the one drawing every panel that opens over the world wears
 * (owner 2026-11-12: "menu跟道具欄跟角色欄的ui調整成跟party一樣外框"): the carved ground with its double
 * brass rule and corner studs (`carvedPanel`), and an × at its top right in the party panel's look
 * and place (FS-R82NV § Change C1). The party panel, the ESC menu's chrome (`showMenuPanel`,
 * FS-G4VMQ § Change: The menu wears the party panel's frame) and the gear overlay's inventory and
 * character panel (FS-HRH2J § Change C16) call it; none copies it.
 *
 * It draws only. What a press on the × does, and how it is hit, is each caller's: the party panel
 * makes the glyph interactive, the menu hangs a camera-fixed hit over it, the gear overlay
 * hit-tests it by hand with its other presses.
 */

import type Phaser from "phaser";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { carvedPanel } from "./carvedPanel";

export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How far the × box stands in from the panel's top and right edges: the party panel's padding. */
export const FRAME_PAD = 12;
/** The × box's side, and the glyph's size. */
export const FRAME_CLOSE = 24;
export const FRAME_CLOSE_PX = 22;

/** The × box of a panel at `panel` (FS-R82NV § Change C1). */
export function frameClose(panel: Pick<FrameRect, "x" | "y" | "width">): FrameRect {
  return {
    x: panel.x + panel.width - FRAME_PAD - FRAME_CLOSE,
    y: panel.y + FRAME_PAD,
    width: FRAME_CLOSE,
    height: FRAME_CLOSE,
  };
}

/** The × in its tone: amber, brighter while the pointer is over it. */
export function lightClose(glyph: Phaser.GameObjects.Text, lit: boolean): void {
  glyph.setColor(toCss(lit ? palette.interactableBright : palette.interactable));
}

/**
 * Draws the frame of a panel at `panel` on `g`, in `g`'s space, and its × glyph in the same
 * space; returns the × box and the glyph, for the caller to place, hit and take down.
 */
export function drawPanelFrame(
  scene: Pick<Phaser.Scene, "add">,
  g: Phaser.GameObjects.Graphics,
  panel: FrameRect,
): { close: FrameRect; glyph: Phaser.GameObjects.Text } {
  carvedPanel(g, panel.x, panel.y, panel.width, panel.height);
  const close = frameClose(panel);
  const glyph = scene.add
    .text(close.x + close.width / 2, close.y + close.height / 2, "×", {
      fontFamily: CANVAS_FONT.body,
      fontSize: `${FRAME_CLOSE_PX}px`,
      color: toCss(palette.interactable),
    })
    .setOrigin(0.5);
  return { close, glyph };
}
