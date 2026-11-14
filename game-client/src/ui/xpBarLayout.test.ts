import { describe, expect, it } from "vitest";
import {
  LOGICAL_HEIGHT,
  LOGICAL_MAX_WIDTH,
  LOGICAL_MIN_WIDTH,
  anchorAt,
} from "@/render/viewport";
import {
  CHAT_WINDOW_MARGIN,
  CHAT_WINDOW_X,
  chatPickerList,
  chatWindowFrame,
} from "./chatWindowLayout";
import {
  ABILITY_CARD_H,
  ABILITY_CARD_PLACE,
  CORNER_ICONS,
  controlsBadgeFrame,
  cornerIconFrame,
  cornerLabelAt,
  cornerRowLeft,
} from "./hudCornerLayout";
import { rectsMeet } from "./partyPanelLayout";
import {
  XP_BAR_CLEARANCE,
  XP_BAR_H,
  XP_BAR_MAX_W,
  XP_END_SLOT_W,
  XP_NUMERAL_GAP,
  XP_NUMERAL_H,
  XP_STUD_OFFSET,
  xpBarFrame,
} from "./xpBarLayout";

// FS-77DVN §A.1–§A.3, §B.7–§B.8: the XP bar piece's place along the bottom middle, a pure
// function of the view.

const view = (width: number) => ({ width, height: LOGICAL_HEIGHT });

/** The chat window's right edge and the corner row's left edge, folded or not, from their layouts. */
function neighbours(width: number) {
  const bottom = LOGICAL_HEIGHT - CHAT_WINDOW_MARGIN;
  const open = chatWindowFrame(CHAT_WINDOW_X, bottom, false).panel;
  const folded = chatWindowFrame(CHAT_WINDOW_X, bottom, true).panel;
  return {
    chatRight: Math.max(open.x + open.width, folded.x + folded.width),
    rowLeft: cornerRowLeft(view(width)),
  };
}

const WIDTHS = Array.from(
  { length: LOGICAL_MAX_WIDTH - LOGICAL_MIN_WIDTH + 1 },
  (_, i) => LOGICAL_MIN_WIDTH + i,
);

describe("xpBarFrame: the piece's place (FS-77DVN §A)", () => {
  it("should name the cap and the gap as 480 and 16", () => {
    expect(XP_BAR_MAX_W).toBe(480);
    expect(XP_BAR_CLEARANCE).toBe(16);
  });

  it("should centre a 188 px piece on 540 at 1080 and a 388 px one on 640 at 1280 (A.2)", () => {
    const narrow = xpBarFrame(view(1080)).piece;
    expect(narrow.width).toBe(188);
    expect(narrow.x + narrow.width / 2).toBe(540);

    const wide = xpBarFrame(view(1280)).piece;
    expect(wide.width).toBe(388);
    expect(wide.x + wide.width / 2).toBe(640);
  });

  it.each(WIDTHS)(
    "should keep the rule at %i: centred, whole and even, capped, 16 px clear of both neighbours, drawn",
    (width) => {
      const { piece, bar } = xpBarFrame(view(width));
      const { chatRight, rowLeft } = neighbours(width);

      expect(
        Math.abs(piece.x + piece.width / 2 - width / 2),
      ).toBeLessThanOrEqual(1);
      expect(Number.isInteger(piece.x)).toBe(true);
      expect(Number.isInteger(piece.width)).toBe(true);
      expect(piece.width % 2).toBe(0);
      expect(piece.width).toBeLessThanOrEqual(XP_BAR_MAX_W);
      const rule = Math.min(
        XP_BAR_MAX_W,
        2 * Math.min(width / 2 - (chatRight + 16), rowLeft - 16 - width / 2),
      );
      expect(piece.width).toBe(Math.floor(rule / 2) * 2);

      expect(piece.x).toBeGreaterThanOrEqual(chatRight + 16);
      expect(piece.x + piece.width).toBeLessThanOrEqual(rowLeft - 16);
      // shrinks, never hides (A.3)
      expect(bar.width).toBeGreaterThan(0);
    },
  );

  it.each(WIDTHS.filter((w) => w % 20 === 0))(
    "should stand its lowest point within 2 px of 704 and never below it at %i (A.1)",
    (width) => {
      const f = xpBarFrame(view(width));
      const lowest = Math.max(
        f.piece.y + f.piece.height,
        f.numerals.left.y + XP_NUMERAL_H / 2,
        f.numerals.right.y + XP_NUMERAL_H / 2,
        f.bar.y + f.bar.height,
      );
      expect(lowest).toBeLessThanOrEqual(LOGICAL_HEIGHT - 16);
      expect(lowest).toBeGreaterThanOrEqual(LOGICAL_HEIGHT - 16 - 2);
    },
  );
});

describe("xpBarFrame: the bar, the studs and the numerals (FS-77DVN §B)", () => {
  it("should draw a 5 px bar on whole px, its studs 6 px beyond each end on its centre line (B.6, B.7)", () => {
    const { bar, studs } = xpBarFrame(view(1080));
    expect(XP_BAR_H).toBe(5);
    expect(bar.height).toBe(5);
    expect(Number.isInteger(bar.x) && Number.isInteger(bar.y)).toBe(true);
    const centre = bar.y + bar.height / 2;
    expect(XP_STUD_OFFSET).toBe(6);
    expect(studs.left).toEqual({ x: bar.x - 6, y: centre });
    expect(studs.right).toEqual({ x: bar.x + bar.width + 6, y: centre });
  });

  it("should anchor the numerals 6 px beyond the studs' centres, their middles on the bar's centre line (B.8)", () => {
    const { bar, studs, numerals } = xpBarFrame(view(1280));
    const centre = bar.y + bar.height / 2;
    expect(XP_NUMERAL_GAP).toBe(6);
    expect(numerals.left).toEqual({ x: studs.left.x - 6, y: centre });
    expect(numerals.right).toEqual({ x: studs.right.x + 6, y: centre });
  });

  it("should give each end a fixed slot inside the piece, the bar the span between (B.8; 116 px at 1080)", () => {
    const { piece, bar, numerals } = xpBarFrame(view(1080));
    expect(numerals.left.x).toBe(piece.x + XP_END_SLOT_W);
    expect(numerals.right.x).toBe(piece.x + piece.width - XP_END_SLOT_W);
    expect(bar.width).toBe(116);
  });

  it("should centre the bar under the piece", () => {
    for (const width of [1080, 1181, 1280]) {
      const { piece, bar } = xpBarFrame(view(width));
      expect(bar.x - piece.x).toBe(piece.x + piece.width - (bar.x + bar.width));
    }
  });
});

// The owner, 2026-11-14 (「經驗條在底部 如果會重疊 就把其他往上移動一些」): the XP bar keeps its place and
// whatever would meet it moves up. Merged onto the UI scene (FS-TQZ5J § Change: Merge with main,
// 2026-11-14), nothing at the bottom meets it at any logical width, so nothing moved; this pins it. The
// run's end row and the spectate row and switcher are swept in `resolvedRow.test.ts`.
describe("xpBarFrame against the other bottom pieces (FS-77DVN §A; the owner, 2026-11-14)", () => {
  /** A hover label as wide as the corner's widest and more, 12 px words with 3 px padding (cornerLabel.ts). */
  const LABEL_W = 160;
  const LABEL_H = 22;
  /** The run's ability card (`AbilityHud`): 280 wide, its bottom-right corner at its place. */
  const CARD_W = 280;

  it("should meet neither the chat window open or folded nor its picker list, the corner row or its labels, the ability card nor the controls badge, at every width", () => {
    const bottom = LOGICAL_HEIGHT - CHAT_WINDOW_MARGIN;
    const open = chatWindowFrame(CHAT_WINDOW_X, bottom);
    const folded = chatWindowFrame(CHAT_WINDOW_X, bottom, true);
    const chat = [open.panel, chatPickerList(open).box, folded.panel, chatPickerList(folded).box];
    for (let width = LOGICAL_MIN_WIDTH; width <= LOGICAL_MAX_WIDTH; width++) {
      const v = view(width);
      const { piece } = xpBarFrame(v);
      const plates = CORNER_ICONS.map((icon) => cornerIconFrame(icon, v));
      const labels = plates.map((plate) => {
        const at = cornerLabelAt(plate, LABEL_W, v);
        return { x: at.x - LABEL_W / 2, y: at.bottom - LABEL_H, width: LABEL_W, height: LABEL_H };
      });
      const corner = anchorAt(ABILITY_CARD_PLACE, v);
      const card = { x: corner.x - CARD_W, y: corner.y - ABILITY_CARD_H, width: CARD_W, height: ABILITY_CARD_H };
      for (const other of [...chat, ...plates, ...labels, card, controlsBadgeFrame(v)]) {
        expect(rectsMeet(piece, other), `at ${width}`).toBe(false);
      }
    }
  });
});
