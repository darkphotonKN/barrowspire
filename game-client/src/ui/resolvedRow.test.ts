import { describe, expect, it } from "vitest";

import { CHAT_WINDOW_MARGIN, CHAT_WINDOW_W, CHAT_WINDOW_X, chatPickerList, chatWindowFrame } from "./chatWindowLayout";
import { CORNER_ICONS, RUN_BUTTON_H, cornerIconFrame, cornerLabelAt } from "./hudCornerLayout";
import { rectsMeet } from "./partyPanelLayout";
import {
  buttonWidth,
  centredLefts,
  resolvedRow,
  resolvedRowY,
  rowLefts,
  rowSpan,
  spectateRowY,
  switcherRect,
  switcherWidth,
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
    expect(resolvedRow({ ...state, fell: false, watching: false })).toEqual(row);
  });

  // FS-QPDKN § Change: The party death flow and the spectate switcher, R151, R154: a fallen player's record
  // comes first, then their card; no row until they watch
  it.each([
    [{ hasRecord: false, watching: false }, []],
    [{ hasRecord: true, watching: false }, []],
    // the corner LEAVE folds into the spectate row (R158)
    [{ hasRecord: false, watching: true }, ["leave"]],
    [{ hasRecord: true, watching: true }, ["leave", "settlement"]],
  ] as const)("should give a fallen player %o the buttons %o", (state, row) => {
    expect(resolvedRow({ canWatch: false, canLeave: false, fell: true, ...state })).toEqual(row);
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
  const lefts = rowLefts(widths, { width });
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
          const button = { x: left, y: y - RUN_BUTTON_H / 2, width: right - left, height: RUN_BUTTON_H };
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
    expect(rowLefts([100, 50, 70], { width: 1280 })).toEqual([522, 630, 688]);
  });
});

describe("centredLefts (FS-TQZ5J § Change: Batch 6, R124: the card's buttons)", () => {
  it("should centre the buttons on a point, 8 apart", () => {
    expect(centredLefts([104, 94], 0)).toEqual([-103, 9]);
  });
});

// FS-QPDKN § Change: The party death flow and the spectate switcher, R158, R159, R167: the spectate row, LEAVE
// and SETTLEMENT, their bottom 70 above the view's; the switcher 8 over it, centred on it, never under 442
describe("the spectate row and the switcher (FS-QPDKN § Change: The party death flow and the spectate switcher)", () => {
  const SPECTATE_ROWS: RowButton[][] = [["leave"], ["leave", "settlement"]];
  const row = (names: RowButton[], width: number) => {
    const widths = names.map((n) => W[n]);
    const lefts = rowLefts(widths, { width });
    return { widths, lefts, span: rowSpan(lefts, widths) };
  };
  const view = (width: number) => ({ width, height: 720 });

  it("should stand the row's buttons y 612–650 at 720 tall, the switcher y 576–604", () => {
    expect(spectateRowY({ height: 720 }) - RUN_BUTTON_H / 2).toBe(612);
    expect(spectateRowY({ height: 720 }) + RUN_BUTTON_H / 2).toBe(650);
    const sw = switcherRect(100, row(["leave", "settlement"], 1080).span, view(1080));
    expect([sw.y, sw.y + sw.height]).toEqual([576, 604]);
  });

  it.each([
    [1080, ["leave", "settlement"], 477],
    [1280, ["leave", "settlement"], 552],
    [1080, ["leave"], 452],
    [1280, ["leave"], 552],
  ] as const)("should centre a 176-wide switcher on the row at %i over %o, from %i", (width, names, x) => {
    const sw = switcherRect(100, row([...names], width).span, view(width));
    expect([sw.x, sw.width]).toEqual([x, 176]);
  });

  it("should keep the switcher's left edge at 442 or right of it, and centre it on the view with no row", () => {
    expect(switcherRect(400, row(["leave"], 1080).span, view(1080)).x).toBe(442);
    expect(switcherRect(100, null, view(1280)).x).toBe(640 - 88);
    expect(switcherWidth(99.2)).toBe(28 * 2 + 100 + 20);
  });

  it("should meet neither the open chat window nor its list, nor the corner row or its labels, at every width 1080–1280", () => {
    const bottom = 720 - CHAT_WINDOW_MARGIN;
    const open = chatWindowFrame(CHAT_WINDOW_X, bottom);
    const folded = chatWindowFrame(CHAT_WINDOW_X, bottom, true);
    const chat = [open.panel, chatPickerList(open).box, folded.panel, chatPickerList(folded).box];
    const y = spectateRowY({ height: 720 }) - RUN_BUTTON_H / 2;
    // a hover label as wide as the widest the corner shows ("Mailbox · town only" measures about 126) and more,
    // 12 px words with 3 px padding (cornerLabel.ts)
    const LABEL_W = 160;
    const LABEL_H = 22;
    for (let width = 1080; width <= 1280; width++) {
      const v = view(width);
      const plates = CORNER_ICONS.map((icon) => cornerIconFrame(icon, v));
      const labels = plates.map((plate) => {
        const at = cornerLabelAt(plate, LABEL_W, v);
        return { x: at.x - LABEL_W / 2, y: at.bottom - LABEL_H, width: LABEL_W, height: LABEL_H };
      });
      const others = [...chat, ...plates, ...labels];
      for (const names of SPECTATE_ROWS) {
        const r = row(names, width);
        const buttons = r.lefts.map((left, i) => ({ x: left, y, width: r.widths[i], height: RUN_BUTTON_H }));
        for (const labelWidth of [60, 100, 160, 240]) {
          const sw = switcherRect(labelWidth, r.span, v);
          for (const piece of [...buttons, sw]) {
            for (const other of others) expect(rectsMeet(piece, other), `${names} at ${width}`).toBe(false);
            expect(piece.x).toBeGreaterThanOrEqual(CHAT_WINDOW_X + CHAT_WINDOW_W + 12);
            expect(Number.isInteger(piece.x)).toBe(true);
          }
          for (const button of buttons) expect(rectsMeet(sw, button)).toBe(false);
        }
      }
    }
  });
});
