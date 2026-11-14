/**
 * The row of buttons along the bottom centre of a resolved player's screen: Watch the delve
 * (FS-QPDKN req 3, amended 2026-11-02), Leave the barrow for an escaped player (FS-GV8WN R25),
 * and Settlement, which toggles the settlement record (FS-GV8WN R21). Which buttons stand, and in what order, is decided here; the scene draws them.
 *
 * To add a button: a name in {@link RowButton}, the fact that decides it in {@link RowState}, and
 * its place in {@link resolvedRow}. The scene maps each name to its button, sizes each by its label
 * ({@link buttonWidth}) and lays the row out with {@link rowLefts} (FS-TQZ5J § Change: Batch 6, R122,
 * R123).
 */

import { CHAT_WINDOW_W, CHAT_WINDOW_X } from "./chatWindowLayout";
import { RUN_BUTTON_H, type Rect } from "./hudCornerLayout";

export type RowButton = "watch" | "leave" | "settlement";

export interface RowState {
  /** An escaped player with a teammate still in play, not yet watching (FS-QPDKN req 3). */
  canWatch: boolean;
  /**
   * An escaped player still in the run (FS-GV8WN R25). The dead player's Leave is not here: it
   * stands on their card, then in its corner while they watch (FS-QPDKN req 2, 10).
   */
  canLeave: boolean;
  /** A `settlement` has arrived in this run (FS-GV8WN R21). */
  hasRecord: boolean;
  /**
   * This player fell in the run: their record first, then their card, so no row until they watch (FS-QPDKN
   * § Change: The party death flow and the spectate switcher, R151, R154).
   */
  fell: boolean;
  /** This player watches a teammate (FS-QPDKN req 7). */
  watching: boolean;
}

/** The buttons the row holds, left to right. */
export function resolvedRow(state: RowState): RowButton[] {
  if (state.fell && !state.watching) return [];
  const row: RowButton[] = [];
  if (state.canWatch) row.push("watch");
  // a fallen spectator's LEAVE is the row's: the corner button folds in (FS-QPDKN § Change: The party death
  // flow and the spectate switcher, R158)
  if (state.canLeave || state.fell) row.push("leave");
  if (state.hasRecord) row.push("settlement");
  return row;
}

/** The run's buttons' padding each side of their label (the design guideline's ~1.5 rem; R122). */
export const ROW_BUTTON_PAD = 24;
/** The gap between the row's buttons, and between the card's (R123, R124). */
export const ROW_GAP = 8;
/** How far the row keeps right of the open chat window where centring would bring it closer (R123). */
const ROW_CHAT_CLEARANCE = 12;
/** The left edge the row never goes under: 12 right of the open chat window, the same at every width (442). */
const ROW_MIN_LEFT = CHAT_WINDOW_X + CHAT_WINDOW_W + ROW_CHAT_CLEARANCE;

/** A run button's width: its label's, as Phaser measures it, plus its padding each side (R122). */
export function buttonWidth(labelWidth: number): number {
  return Math.ceil(labelWidth) + ROW_BUTTON_PAD * 2;
}

/** The left edges of buttons `widths` wide, left to right `gap` apart, centred on `centreX` (R124). */
export function centredLefts(widths: readonly number[], centreX: number, gap = ROW_GAP): number[] {
  const total = widths.reduce((sum, w) => sum + w, 0) + gap * Math.max(0, widths.length - 1);
  return leftsFrom(widths, Math.round(centreX - total / 2), gap);
}

/**
 * The row's left edges on `view` (layout B, R123): centred, unless that would bring it within 12 of
 * the open chat window at the bottom left; then from 12 right of the window. The row and the window
 * are both seated on the view's bottom, so they share their height at every view: only x keeps them
 * apart.
 */
export function rowLefts(widths: readonly number[], view: { width: number }): number[] {
  const centred = centredLefts(widths, view.width / 2);
  const left = Math.max(centred[0] ?? ROW_MIN_LEFT, ROW_MIN_LEFT);
  return leftsFrom(widths, left, ROW_GAP);
}

function leftsFrom(widths: readonly number[], left: number, gap: number): number[] {
  let x = left;
  return widths.map((w) => {
    const at = x;
    x += w + gap;
    return at;
  });
}

/** The row's bottom margin: the dead spectator's corner button's (`LEAVE_BUTTON_MARGIN`). */
const ROW_MARGIN = 16;
/** How far the row stands above that bottom margin (asked 2026-11-02, Nick: about 200 px). */
const ROW_LIFT = 200;
/** The settlement record's bottom edge stands this far over the row's buttons. */
const RECORD_ROW_GAP = 12;

/** The row's line on the view: its buttons' centre y. */
export function resolvedRowY(view: { height: number }): number {
  return view.height - ROW_MARGIN - ROW_LIFT - RUN_BUTTON_H / 2;
}

/**
 * The settlement record's place: centred across, its bottom just over the row's buttons (FS-GV8WN
 * R21), so the SETTLEMENT button that toggles it stays reachable. One rule for the run's row and the UI
 * scene's record (FS-TQZ5J § Change: Phase 3, R57).
 */
export function recordAnchor(view: { centerX: number; height: number }): { x: number; bottom: number } {
  return { x: view.centerX, bottom: resolvedRowY(view) - RUN_BUTTON_H / 2 - RECORD_ROW_GAP };
}

/**
 * How far the spectate row's bottom stands above the view's bottom (FS-QPDKN § Change: The party death flow
 * and the spectate switcher, R158; the owner, 「settlement跟leave低一點」): lower than the resolved row, clear
 * above the corner row's hover labels' line and the chat window's sides. At 720 tall its buttons span y 612–650.
 */
export const SPECTATE_ROW_BOTTOM = 70;

/** The spectate row's line: its buttons' centre y (R158). */
export function spectateRowY(view: { height: number }): number {
  return view.height - SPECTATE_ROW_BOTTOM - RUN_BUTTON_H / 2;
}

/** The left and right edges of a row of buttons laid out by {@link rowLefts}, or none for no buttons. */
export interface RowSpan {
  left: number;
  right: number;
}

/** The span of buttons `widths` wide standing from `lefts`; none for an empty row. */
export function rowSpan(lefts: readonly number[], widths: readonly number[]): RowSpan | null {
  if (lefts.length === 0) return null;
  const last = lefts.length - 1;
  return { left: lefts[0], right: lefts[last] + widths[last] };
}

/** The switcher's height, and each arrow's square box (R159). */
export const SWITCHER_H = 28;
export const SWITCHER_ARROW_W = 28;
/** The switcher's words' padding each side, between them and the arrows (R159). */
export const SWITCHER_PAD = 10;
/** How far the switcher stands above the spectate row (the owner, 「切換箭頭就放在上方一些」; R159). */
export const SWITCHER_GAP = 8;

/** The switcher's width: its two arrows and its words `labelWidth` wide with their padding (R159). */
export function switcherWidth(labelWidth: number): number {
  return 2 * SWITCHER_ARROW_W + Math.ceil(labelWidth) + 2 * SWITCHER_PAD;
}

/**
 * Where the switcher "◄ Watching <name> ►" stands (R159): `SWITCHER_GAP` over the spectate row, centred on
 * the row (on the view with no row), its left edge never under 442, 12 right of the open chat window (R123's
 * rule). Whole px.
 */
export function switcherRect(labelWidth: number, row: RowSpan | null, view: { width: number; height: number }): Rect {
  const width = switcherWidth(labelWidth);
  const centre = row ? (row.left + row.right) / 2 : view.width / 2;
  const x = Math.max(Math.round(centre - width / 2), ROW_MIN_LEFT);
  const bottom = spectateRowY(view) - RUN_BUTTON_H / 2 - SWITCHER_GAP;
  return { x, y: bottom - SWITCHER_H, width, height: SWITCHER_H };
}
