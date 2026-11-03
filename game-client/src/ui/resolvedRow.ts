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
