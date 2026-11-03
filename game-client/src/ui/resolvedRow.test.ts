import { describe, expect, it } from "vitest";

import { resolvedRow, rowSlotX } from "./resolvedRow";

// FS-QPDKN req 3 (amended) and FS-GV8WN R21, R25: the buttons along the bottom centre of a
// resolved player's screen.

describe("resolvedRow", () => {
  it.each([
    [{ canWatch: false, canLeave: false, hasRecord: false }, []],
    [{ canWatch: true, canLeave: false, hasRecord: false }, ["watch"]],
    [{ canWatch: false, canLeave: false, hasRecord: true }, ["settlement"]],
    [
      { canWatch: true, canLeave: false, hasRecord: true },
      ["watch", "settlement"],
    ],
    // R25: an escaped player's Leave stands beside Watch, and alone with no teammate to watch
    [{ canWatch: true, canLeave: true, hasRecord: false }, ["watch", "leave"]],
    [{ canWatch: false, canLeave: true, hasRecord: false }, ["leave"]],
    [
      { canWatch: false, canLeave: true, hasRecord: true },
      ["leave", "settlement"],
    ],
    [
      { canWatch: true, canLeave: true, hasRecord: true },
      ["watch", "leave", "settlement"],
    ],
  ] as const)("should give %o the buttons %o, in that order", (state, row) => {
    expect(resolvedRow(state)).toEqual(row);
  });
});

describe("rowSlotX", () => {
  it("should centre one button on the screen's centre", () => {
    expect(rowSlotX(0, 1, 400, 200, 16)).toBe(400);
  });

  it("should spread buttons evenly about the centre, a gap apart", () => {
    expect([0, 1].map((i) => rowSlotX(i, 2, 400, 200, 16))).toEqual([292, 508]);
    expect([0, 1, 2].map((i) => rowSlotX(i, 3, 400, 200, 16))).toEqual([
      184, 400, 616,
    ]);
  });
});
