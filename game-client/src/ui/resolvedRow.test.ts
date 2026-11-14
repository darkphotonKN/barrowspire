import { describe, expect, it } from "vitest";

import { CHAT_WINDOW_MARGIN, CHAT_WINDOW_W, CHAT_WINDOW_X, chatPickerList, chatWindowFrame } from "./chatWindowLayout";
import { rectsMeet } from "./partyPanelLayout";
import {
  ROW_BUTTON_H,
  buttonWidth,
  centredLefts,
  resolvedRow,
  resolvedRowY,
  rowLefts,
  type RowButton,
} from "./resolvedRow";

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

// FS-TQZ5J § Change: Batch 6, R122, R123, R136: each button its label's width plus 24 a side, the row
// 8 apart, centred unless that comes within 12 of the open chat window, then from 442; never meeting it

/** The labels' widths as Phaser measures them in the game's EB Garamond, 13 px bold, letter-spaced 1 (R122). */
const LABEL = { watch: 56, leave: 46, settlement: 96 } as const;
const W = { watch: buttonWidth(LABEL.watch), leave: buttonWidth(LABEL.leave), settlement: buttonWidth(LABEL.settlement) };

/** Each set of buttons the row can hold, in its order, from `resolvedRow`. */
const ROWS: RowButton[][] = [
  ["watch"],
  ["leave"],
  ["settlement"],
  ["watch", "leave"],
  ["leave", "settlement"],
  ["watch", "settlement"],
  ["watch", "leave", "settlement"],
];

/** The row's buttons as x spans, at a logical width (720 tall). */
const spans = (names: RowButton[], width: number) => {
  const widths = names.map((n) => W[n]);
  const lefts = rowLefts(widths, { width, height: 720 });
  return lefts.map((left, i) => [left, left + widths[i]]);
};

describe("the row's buttons (FS-TQZ5J § Change: Batch 6, R122)", () => {
  it("should make each button its label's width plus 24 a side", () => {
    expect(W).toEqual({ watch: 104, leave: 94, settlement: 144 });
    expect(buttonWidth(55.2)).toBe(104);
  });
});

describe("rowLefts (FS-TQZ5J § Change: Batch 6, R123: layout B)", () => {
  it.each([
    [["watch"], [[488, 592]]],
    [["leave"], [[493, 587]]],
    [["settlement"], [[468, 612]]],
    [["watch", "leave"], [[442, 546], [554, 648]]],
    [["leave", "settlement"], [[442, 536], [544, 688]]],
    [["watch", "settlement"], [[442, 546], [554, 698]]],
    [["watch", "leave", "settlement"], [[442, 546], [554, 648], [656, 800]]],
  ] as const)("should stand %o at 1080 as %o", (names, at) => {
    expect(spans([...names], 1080)).toEqual(at);
  });

  it.each([
    [["watch"], [[588, 692]]],
    [["leave"], [[593, 687]]],
    [["settlement"], [[568, 712]]],
    [["watch", "leave"], [[537, 641], [649, 743]]],
    [["leave", "settlement"], [[517, 611], [619, 763]]],
    [["watch", "settlement"], [[512, 616], [624, 768]]],
    [["watch", "leave", "settlement"], [[461, 565], [573, 667], [675, 819]]],
  ] as const)("should stand %o at 1280 as %o, centred", (names, at) => {
    expect(spans([...names], 1280)).toEqual(at);
  });

  it("should never meet the open chat window or its open list, at any logical width from 1080 to 1280 (R123, R136)", () => {
    const bottom = 720 - CHAT_WINDOW_MARGIN;
    const open = chatWindowFrame(CHAT_WINDOW_X, bottom);
    const folded = chatWindowFrame(CHAT_WINDOW_X, bottom, true);
    const chat = [open.panel, chatPickerList(open).box, folded.panel, chatPickerList(folded).box];
    const y = resolvedRowY({ height: 720 });
    for (let width = 1080; width <= 1280; width++) {
      for (const names of ROWS) {
        for (const [left, right] of spans(names, width)) {
          const button = { x: left, y: y - ROW_BUTTON_H / 2, width: right - left, height: ROW_BUTTON_H };
          for (const piece of chat) expect(rectsMeet(button, piece), `${names} at ${width}`).toBe(false);
          // 12 clear of the window's right edge, whole px
          expect(left).toBeGreaterThanOrEqual(CHAT_WINDOW_X + CHAT_WINDOW_W + 12);
          expect(Number.isInteger(left)).toBe(true);
        }
      }
    }
  });

  it("should lay the buttons left to right 8 apart", () => {
    // 100 + 8 + 50 + 8 + 70 = 236, centred on 640
    expect(rowLefts([100, 50, 70], { width: 1280, height: 720 })).toEqual([522, 630, 688]);
  });
});

describe("centredLefts (FS-TQZ5J § Change: Batch 6, R124: the card's buttons)", () => {
  it("should centre the buttons on a point, 8 apart", () => {
    expect(centredLefts([104, 94], 0)).toEqual([-103, 9]);
  });
});
