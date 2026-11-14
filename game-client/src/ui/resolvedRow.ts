/**
 * The row of buttons along the bottom centre of a resolved player's screen: Watch the delve
 * (FS-QPDKN req 3, amended 2026-11-02), Leave the barrow for an escaped player (FS-GV8WN R25),
 * and Settlement, which toggles the settlement record (FS-GV8WN R21). Which buttons stand, and in what order, is decided here; the scene draws them.
 *
 * To add a button: a name in {@link RowButton}, the fact that decides it in {@link RowState}, and
 * its place in {@link resolvedRow}. The scene maps each name to its button and lays the row out
 * with {@link rowSlotX}.
 */

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

/** The centre x of button `index` of `count`, spread `gap` apart about `centreX`. */
export function rowSlotX(
  index: number,
  count: number,
  centreX: number,
  buttonW: number,
  gap: number,
): number {
  return centreX + (index - (count - 1) / 2) * (buttonW + gap);
}

/** The row's bottom margin: the dead spectator's corner button's (`LEAVE_BUTTON_MARGIN`). */
const ROW_MARGIN = 16;
/** How far the row stands above that bottom margin (asked 2026-11-02, Nick: about 200 px). */
const ROW_LIFT = 200;
/** The row's buttons' height, the run's `BUTTON_H`. */
const ROW_BUTTON_H = 38;
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
