/**
 * The player's own XP bar piece along the bottom middle of the canvas (FS-77DVN §A, §B): the two
 * level numerals, the two brass studs and the bar between them, centred on the canvas and kept
 * clear of the chat window on its left and the corner row on its right. Pure, so every width is
 * tested without a scene; `ProgressHud` draws into these places.
 */

import {
  CHAT_WINDOW_MARGIN,
  CHAT_WINDOW_X,
  chatWindowFrame,
  type Rect,
} from "./chatWindowLayout";
import { cornerRowLeft } from "./hudCornerLayout";

export interface XpBarView {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** The widest the piece grows (§A.2). */
export const XP_BAR_MAX_W = 480;
/** The clear gap kept from the chat window's right edge and the corner row's left edge (§A.2). */
export const XP_BAR_CLEARANCE = 16;
/** The bar's height (§B.6). */
export const XP_BAR_H = 5;
/** A stud's centre stands this far beyond its end of the bar (§B.7). */
export const XP_STUD_OFFSET = 6;
/** A numeral's near edge stands this far beyond its stud's centre (§B.8). */
export const XP_NUMERAL_GAP = 6;
/**
 * Each end numeral's fixed slot, wide enough for "Cap" at 12 px, so the bar's length never changes
 * with the level (§B.8). The stud and its two gaps stand between the slot and the bar.
 */
export const XP_END_SLOT_W = 24;
/** A numeral's text box at the 12 px body serif with its 2 px stroke: the piece's height. */
export const XP_NUMERAL_H = 16;

export interface XpBarFrame {
  /** The whole piece: both numerals' slots, both studs and the bar. */
  piece: Rect;
  bar: Rect;
  studs: { left: Point; right: Point };
  /**
   * The numerals' anchors, each on the bar's centre line: the left one's right edge (it is
   * right-aligned), the right one's left edge (left-aligned).
   */
  numerals: { left: Point; right: Point };
}

/**
 * The piece's place in `view` (§A.1–§A.3): centred on `W / 2`, its lowest point 16 px up, as wide
 * as a centred span can be while keeping `XP_BAR_CLEARANCE` from both neighbours, capped at
 * `XP_BAR_MAX_W`, a whole even px. The neighbours' edges come from their own layouts; the chat
 * window's right edge is the same folded or not.
 */
export function xpBarFrame(view: XpBarView): XpBarFrame {
  const bottom = view.height - CHAT_WINDOW_MARGIN;
  const chat = chatWindowFrame(CHAT_WINDOW_X, bottom).panel;
  const chatRight = chat.x + chat.width;
  const rowLeft = cornerRowLeft(view);
  const mid = view.width / 2;
  const half = Math.min(
    mid - (chatRight + XP_BAR_CLEARANCE),
    rowLeft - XP_BAR_CLEARANCE - mid,
  );
  const width = Math.floor(Math.min(XP_BAR_MAX_W, 2 * half) / 2) * 2;
  // floored: the centred span's left edge is never left of the chat window's gap, nor its right
  // edge past the row's
  const x = Math.floor(mid - width / 2);
  const piece = { x, y: bottom - XP_NUMERAL_H, width, height: XP_NUMERAL_H };

  const inset = XP_END_SLOT_W + XP_NUMERAL_GAP + XP_STUD_OFFSET;
  // the bar's top on a whole px, its centre line half a px above the piece's middle at most
  const barY = Math.floor(bottom - XP_NUMERAL_H / 2 - XP_BAR_H / 2);
  const bar = {
    x: x + inset,
    y: barY,
    width: width - inset * 2,
    height: XP_BAR_H,
  };
  const centre = barY + XP_BAR_H / 2;
  const studs = {
    left: { x: bar.x - XP_STUD_OFFSET, y: centre },
    right: { x: bar.x + bar.width + XP_STUD_OFFSET, y: centre },
  };
  return {
    piece,
    bar,
    studs,
    numerals: {
      left: { x: studs.left.x - XP_NUMERAL_GAP, y: centre },
      right: { x: studs.right.x + XP_NUMERAL_GAP, y: centre },
    },
  };
}
