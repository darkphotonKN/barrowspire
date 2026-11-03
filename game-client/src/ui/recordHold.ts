/**
 * Whether the settlement record holds the return to the town (FS-GV8WN R23). The run's end sends
 * the hub at once; while the record is open it waits behind it, so the record can be read. A Leave
 * is the player asking for the town, so while one is on its way the record holds nothing, even
 * reopened. Pure; the scene raises `ResultHold` when this says so.
 */
export interface RecordHoldState {
  /** The settlement record is on screen. */
  recordOpen: boolean;
  /** A `leave_run` is on its way and unanswered. */
  leavePending: boolean;
}

export function recordHoldsTown(state: RecordHoldState): boolean {
  return state.recordOpen && !state.leavePending;
}
