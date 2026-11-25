import { describe, expect, it } from "vitest";
import {
  CORNER_LABEL,
  CORNER_LABEL_GREYED_MAIL,
  CORNER_LABEL_GREYED_BOOK,
  CORNER_ROW_CLEARANCE,
  CORNER_ICONS,
  cornerIconFrame,
  cornerLabelAt,
  cornerRowLeft,
  CONTROLS_BADGE_LABEL,
  controlsBadgeFrame,
} from "./hudCornerLayout";

// FS-3EBCA §A R1, R2, R5; §C R13. I-3EBCA-1: the corner row's geometry and words, without a canvas.
describe("cornerIconFrame (FS-3EBCA R1, R2: the row from the right edge leftward)", () => {
  // the row of five, the owner's decision of 2026-11-12 (FS-3EBCA R1, R2). I-3EBCA-5.
  it.each([
    ["menu", 1010],
    ["inventory", 954],
    ["character", 898],
    ["party", 842],
    ["mail", 786],
    // FS-8RZ51 R32: the passive tree's sixth at the row's left end, none of the five moved
    ["tree", 730],
    // FS-X2CMM R36: the class book's seventh at the row's left end, after Tree, none of the six moved
    ["book", 674],
  ] as const)("should put %s at x %i, y 658, 54 x 46, in a 1080 x 720 view, 56 px from the next (FS-QHN87 round 2)", (icon, x) => {
    expect(cornerIconFrame(icon, { width: 1080, height: 720 })).toEqual({
      x,
      y: 658,
      width: 54,
      height: 46,
    });
  });

  it("should keep each icon 200 px further right in a 1280-wide view", () => {
    for (const icon of CORNER_ICONS)
      expect(cornerIconFrame(icon, { width: 1280, height: 720 }).x).toBe(
        cornerIconFrame(icon, { width: 1080, height: 720 }).x + 200,
      );
  });

  it("should leave 70 px from the bottom for what stands above the row, as before the row drew closer (R13)", () => {
    expect(CORNER_ROW_CLEARANCE).toBe(70);
    const top = cornerIconFrame("menu", { width: 1080, height: 720 }).y;
    expect(720 - CORNER_ROW_CLEARANCE).toBe(top - 8);
  });
});

// FS-77DVN §A.2: what stands left of the row keeps clear of its leftmost plate, whichever icon
// that is
describe("cornerRowLeft (FS-3EBCA R1, R2; FS-77DVN §A.2)", () => {
  it.each([1080, 1181, 1280])("should be the leftmost plate's left edge at %i", (width) => {
    const view = { width, height: 720 };
    const plates = CORNER_ICONS.map((icon) => cornerIconFrame(icon, view).x);
    expect(cornerRowLeft(view)).toBe(Math.min(...plates));
  });

  // FS-8RZ51 R43: the sixth icon moved the row's left edge with it; FS-X2CMM R36: the seventh, the book, does too
  it("should stand at 674 in a 1080-wide view and 874 in a 1280-wide one, the book's plate", () => {
    expect(cornerRowLeft({ width: 1080, height: 720 })).toBe(674);
    expect(cornerRowLeft({ width: 1280, height: 720 })).toBe(874);
    expect(cornerRowLeft({ width: 1080, height: 720 })).toBe(cornerIconFrame("book", { width: 1080, height: 720 }).x);
  });
});

describe("corner labels (FS-3EBCA R5)", () => {
  it("should name each icon and its key", () => {
    expect(CORNER_LABEL).toEqual({
      menu: "Menu (Esc)",
      inventory: "Inventory (I)",
      character: "Character (C)",
      party: "Party (T)",
      mail: "Mailbox",
      tree: "Tree (P)",
      book: "Book (K)",
    });
    expect(CORNER_LABEL_GREYED_MAIL).toBe("Mailbox · town only");
    expect(CORNER_LABEL_GREYED_BOOK).toBe("Book · runs only");
  });

  it("should centre a label 6 px over its icon, kept 8 px inside the right edge", () => {
    const view = { width: 1080, height: 720 };
    const party = cornerIconFrame("party", view);
    expect(cornerLabelAt(party, 60, view)).toEqual({ x: party.x + 27, bottom: 652 });
    const menu = cornerIconFrame("menu", view);
    // centred it would end at 1037 + 50 = 1087, past the edge
    expect(cornerLabelAt(menu, 100, view)).toEqual({ x: 1080 - 8 - 50, bottom: 652 });
  });
});

// FS-84N1G R3, R7 (the owner: 「幫我做一個徽章 放在 技能上方區塊」): the controls badge, a plate the corner
// icons' size, where it stood over the ability card; FS-Q18Q3 R42: the card is gone and the rect is kept
describe("the controls badge's place and words (FS-84N1G R3, R7; FS-Q18Q3 R42)", () => {
  it("should stand a 54 × 46 plate right-aligned with the row, where it stood 8 px over the 72 px card", () => {
    const view = { width: 1080, height: 720 };
    const row = cornerIconFrame("menu", view);
    const plate = controlsBadgeFrame(view);
    expect(plate).toEqual({ x: 1064 - 54, y: 650 - 72 - 8 - 46, width: 54, height: 46 });
    expect(plate.x + plate.width).toBe(row.x + row.width);
    expect(controlsBadgeFrame({ width: 1920, height: 1080 })).toEqual({ x: 1904 - 54, y: 1010 - 72 - 8 - 46, width: 54, height: 46 });
  });

  it("should name itself and its key as the corner row does", () => {
    expect(CONTROLS_BADGE_LABEL).toBe("Controls (H)");
  });
});
