import { describe, expect, it } from "vitest";
import {
  CORNER_LABEL,
  CORNER_LABEL_GREYED_MAIL,
  CORNER_ROW_CLEARANCE,
  cornerIconFrame,
  cornerLabelAt,
} from "./hudCornerLayout";

// FS-3EBCA §A R1, R2, R5; §C R13. I-3EBCA-1: the corner row's geometry and words, without a canvas.
describe("cornerIconFrame (FS-3EBCA R1, R2: the row from the right edge leftward)", () => {
  it.each([
    ["menu", 1006],
    ["character", 940],
    ["party", 874],
    ["mail", 808],
  ] as const)("should put %s at x %i, y 658, 58 x 46, in a 1080 x 720 view", (icon, x) => {
    expect(cornerIconFrame(icon, { width: 1080, height: 720 })).toEqual({
      x,
      y: 658,
      width: 58,
      height: 46,
    });
  });

  it("should keep each icon 200 px further right in a 1280-wide view", () => {
    for (const icon of ["menu", "character", "party", "mail"] as const)
      expect(cornerIconFrame(icon, { width: 1280, height: 720 }).x).toBe(
        cornerIconFrame(icon, { width: 1080, height: 720 }).x + 200,
      );
  });

  it("should leave 70 px from the bottom for what stands above the row (R13)", () => {
    expect(CORNER_ROW_CLEARANCE).toBe(70);
    const top = cornerIconFrame("menu", { width: 1080, height: 720 }).y;
    expect(720 - CORNER_ROW_CLEARANCE).toBe(top - 8);
  });
});

describe("corner labels (FS-3EBCA R5)", () => {
  it("should name each icon and its key", () => {
    expect(CORNER_LABEL).toEqual({
      menu: "Menu (Esc)",
      character: "Character (I)",
      party: "Party (T)",
      mail: "Mailbox",
    });
    expect(CORNER_LABEL_GREYED_MAIL).toBe("Mailbox · town only");
  });

  it("should centre a label 6 px over its icon, kept 8 px inside the right edge", () => {
    const view = { width: 1080, height: 720 };
    const party = cornerIconFrame("party", view);
    expect(cornerLabelAt(party, 60, view)).toEqual({ x: party.x + 29, bottom: 652 });
    const menu = cornerIconFrame("menu", view);
    // centred it would end at 1035 + 50 = 1085, past the edge
    expect(cornerLabelAt(menu, 100, view)).toEqual({ x: 1080 - 8 - 50, bottom: 652 });
  });
});
