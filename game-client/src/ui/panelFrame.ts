/**
 * The party panel's outer frame, the one drawing every panel that opens over the world wears
 * (owner 2026-11-12: "menu跟道具欄跟角色欄的ui調整成跟party一樣外框"): the carved ground with its double
 * brass rule and corner studs (`carvedPanel`), and an × at its top right in the party panel's look
 * and place (FS-R82NV § Change C1). The party panel, the ESC menu's chrome (`showMenuPanel`,
 * FS-G4VMQ § Change: The menu wears the party panel's frame), the gear overlay's inventory and
 * character panel (FS-HRH2J § Change C16) and the letter panel (FS-1GZGD § Change C5) call it;
 * none copies it.
 *
 * Every window's title is drawn here too (`drawPanelTitle`, FS-3EBCA R20): one place, size,
 * colour and case, so a later window takes it by calling it.
 *
 * It draws only. What a press on the × does, and how it is hit, is each caller's: the party panel
 * makes the glyph interactive, as the letter panel does, the menu hangs a camera-fixed hit over
 * it, the gear overlay hit-tests it by hand with its other presses.
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

/**
 * Every window's title (FS-3EBCA R20, R21; owner 2026-11-12: "每個ui視窗的標題都不同位置
 * 都統一放在中間的樣式好了 大小顏色也一樣", "全大寫也統一"): centred across the panel, its top this far below
 * the panel's top edge, in the body face at this size and spacing, in `palette.frameBright`.
 * The gear overlay's heading as it stood, the style most windows already wore.
 */
export const PANEL_TITLE_TOP = 14;
export const PANEL_TITLE_PX = 14;
export const PANEL_TITLE_SPACING = 4;
/**
 * The band at the panel's top that is the title's and the ×'s: what a window holds starts no
 * higher than this below the panel's top, the × box's foot (12 + 24), under the title's line.
 */
export const PANEL_TITLE_BAND = 36;

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
 *
 * Told `{ close: false }` it draws the frame alone, no ×, and returns nothing: for a window whose
 * one way out is elsewhere (the disconnect notice, its button: FS-R6EYZ R9, R13). Untold, every
 * window keeps its ×.
 */
export function drawPanelFrame(
  scene: Pick<Phaser.Scene, "add">,
  g: Phaser.GameObjects.Graphics,
  panel: FrameRect,
): { close: FrameRect; glyph: Phaser.GameObjects.Text };
export function drawPanelFrame(
  scene: Pick<Phaser.Scene, "add">,
  g: Phaser.GameObjects.Graphics,
  panel: FrameRect,
  options: { close: false },
): void;
export function drawPanelFrame(
  scene: Pick<Phaser.Scene, "add">,
  g: Phaser.GameObjects.Graphics,
  panel: FrameRect,
  options?: { close: false },
): { close: FrameRect; glyph: Phaser.GameObjects.Text } | void {
  carvedPanel(g, panel.x, panel.y, panel.width, panel.height);
  if (options?.close === false) return;
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

/**
 * Draws a window's title at the top of `panel`, in `panel`'s space: the words in capitals, centred
 * across it, in the one title style (FS-3EBCA R20, R21). The × keeps the top right; the title
 * stays centred between the edges. Returns the text, for the caller to place and take down.
 */
export function drawPanelTitle(
  scene: Pick<Phaser.Scene, "add">,
  panel: Pick<FrameRect, "x" | "y" | "width">,
  words: string,
): Phaser.GameObjects.Text {
  return scene.add
    .text(panel.x + panel.width / 2, panel.y + PANEL_TITLE_TOP, words.toUpperCase(), {
      fontFamily: CANVAS_FONT.body,
      fontSize: `${PANEL_TITLE_PX}px`,
      color: toCss(palette.frameBright),
      letterSpacing: PANEL_TITLE_SPACING,
    })
    .setOrigin(0.5, 0);
}
