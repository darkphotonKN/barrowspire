import { describe, expect, it } from "vitest";

import { recordHoldsTown } from "./recordHold";

// FS-GV8WN R23: the settlement record holds the return to the town while it is open, but never
// the town a Leave asked for.

describe("recordHoldsTown", () => {
  it.each([
    [{ recordOpen: true, leavePending: false }, true],
    [{ recordOpen: false, leavePending: false }, false],
    // the hub a Leave asks for is the player's choice: reopening the record does not hold it
    [{ recordOpen: true, leavePending: true }, false],
    [{ recordOpen: false, leavePending: true }, false],
  ] as const)("should give %o a hold of %s", (state, holds) => {
    expect(recordHoldsTown(state)).toBe(holds);
  });
});
