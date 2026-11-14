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
}

/** The buttons the row holds, left to right. */
export function resolvedRow(state: RowState): RowButton[] {
  const row: RowButton[] = [];
  if (state.canWatch) row.push("watch");
  if (state.canLeave) row.push("leave");
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
/** The row's buttons' height, every run button's. */
export const ROW_BUTTON_H = 38;
/** The settlement record's bottom edge stands this far over the row's buttons. */
const RECORD_ROW_GAP = 12;

/** The row's line on the view: its buttons' centre y. */
export function resolvedRowY(view: { height: number }): number {
  return view.height - ROW_MARGIN - ROW_LIFT - ROW_BUTTON_H / 2;
}

/**
 * The settlement record's place: centred across, its bottom just over the row's buttons (FS-GV8WN
 * R21), so the SETTLEMENT button that toggles it stays reachable. One rule for the run's row and the UI
 * scene's record (FS-TQZ5J § Change: Phase 3, R57).
 */
export function recordAnchor(view: { centerX: number; height: number }): { x: number; bottom: number } {
  return { x: view.centerX, bottom: resolvedRowY(view) - ROW_BUTTON_H / 2 - RECORD_ROW_GAP };
}
