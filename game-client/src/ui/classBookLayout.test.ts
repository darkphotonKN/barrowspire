import { describe, expect, it } from "vitest";
import { abilityBarFrame } from "./abilityBarLayout";
import { CHAT_WINDOW_MARGIN, CHAT_WINDOW_X, chatWindowFrame } from "./chatWindowLayout";
import { TOME_LAYOUT, bookLayout, rowAt } from "./classBookLayout";
import { cornerRowLeft, cornerIconFrame } from "./hudCornerLayout";
import { MINIMAP } from "./minimap";
import { PAGE_ROUNDEL_SIZE } from "./pageRoundel";
import { TOP_RIGHT_LINE, topRightCorner } from "./topRightColumn";

// FS-X2CMM §G R36, R39 and §Change: Illuminated pages and the open tome C3–C5, Edge States (I-X2CMM-25):
// where the open tome stands and what is on its two pages. At the view's right side, clear of the
// player in the middle, the ability bar, the chat, the corner row and the top-right column.

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe("the open tome's place (C3, Edge States: small viewports)", () => {
  it.each([1080, 1280])("should stand at the right side of a view %i wide, clear of everything the run keeps on screen", (width) => {
    const view = { width, height: 720 };
    const { panel } = bookLayout(view, 5);
    // to one side: the player in the view's middle stays clear of it
    expect(panel.x).toBeGreaterThan(view.width / 2 + 40);
    expect(panel.x + panel.width).toBeLessThanOrEqual(view.width - 10);
    expect(overlaps(panel, abilityBarFrame(view).row)).toBe(false);
    expect(overlaps(panel, chatWindowFrame(CHAT_WINDOW_X, view.height - CHAT_WINDOW_MARGIN).panel)).toBe(false);
    // over the corner row, with room for its hover label (about 20 px over a plate)
    const corner = cornerIconFrame("menu", view);
    expect(panel.y + panel.height).toBeLessThan(corner.y - 24);
    expect(panel.x + panel.width).toBeGreaterThan(cornerRowLeft(view));
    // under the top-right column: the minimap, the floor line and the escaped count
    const column = topRightCorner(view, { ...MINIMAP, mode: "normal" });
    const line = 12 + 2 * TOP_RIGHT_LINE.padding.y;
    expect(panel.y).toBeGreaterThanOrEqual(column.below + 2 * line + TOP_RIGHT_LINE.gap);
  });
});

describe("the open tome's pages (C4, C5)", () => {
  const VIEW = { width: 1080, height: 720 };

  it("should put two pages of one size side by side in the binding, the spine between them", () => {
    const { panel, left, right, spine } = bookLayout(VIEW, 3);
    expect(left.width).toBe(right.width);
    expect(right.x).toBe(left.x + left.width);
    expect(spine).toBe(right.x);
    expect(left.x - panel.x).toBe(TOME_LAYOUT.border);
    expect(panel.x + panel.width - (right.x + right.width)).toBe(TOME_LAYOUT.border);
  });

  it("should centre the title over its rule on the left page", () => {
    const { title, rule, left } = bookLayout(VIEW, 3);
    expect(title.x).toBe(Math.round((rule.x1 + rule.x2) / 2));
    expect(title.y).toBeLessThan(rule.y);
    expect(rule.x1).toBeGreaterThan(left.x);
    expect(rule.x2).toBeLessThan(left.x + left.width);
  });

  it("should lay one row per page under the rule in book order, a 28 px roundel, the name after it, the mark right-aligned", () => {
    const { rows, rule, left } = bookLayout(VIEW, 5);
    expect(rows).toHaveLength(5);
    rows.forEach((row, i) => {
      expect(row.roundel.width).toBe(PAGE_ROUNDEL_SIZE.tomeRow);
      expect(row.box.y).toBeGreaterThan(rule.y);
      if (i > 0) expect(row.box.y).toBe(rows[i - 1].box.y + rows[i - 1].box.height);
      expect(row.name.x).toBeGreaterThan(row.roundel.x + row.roundel.width);
      expect(row.mark.x).toBeGreaterThan(row.name.x + 80);
      expect(row.box.y + row.box.height).toBeLessThanOrEqual(left.y + left.height);
      expect(row.box.x + row.box.width).toBeLessThanOrEqual(left.x + left.width);
    });
  });

  it("should stand the right page's 64 px roundel at its top, centred over its words", () => {
    const { leaf, right } = bookLayout(VIEW, 3);
    expect(leaf.roundel.width).toBe(PAGE_ROUNDEL_SIZE.tomePage);
    expect(leaf.roundel.x + leaf.roundel.width / 2).toBe(leaf.x);
    expect(leaf.top).toBeGreaterThan(leaf.roundel.y + leaf.roundel.height);
    expect(leaf.x - leaf.wrap / 2).toBeGreaterThan(right.x);
    expect(leaf.x + leaf.wrap / 2).toBeLessThan(right.x + right.width);
  });

  it("should put the × in the right page's top corner", () => {
    const { close, right } = bookLayout(VIEW, 3);
    expect(close.x + close.width).toBeLessThanOrEqual(right.x + right.width);
    expect(close.x).toBeGreaterThan(right.x + right.width / 2);
    expect(close.y).toBeGreaterThanOrEqual(right.y);
  });

  it("should find the row under a point, and none off every row", () => {
    const layout = bookLayout(VIEW, 3);
    const { box } = layout.rows[1];
    expect(rowAt(layout, box.x + 4, box.y + box.height / 2)).toBe(1);
    expect(rowAt(layout, layout.right.x + 20, box.y + 4)).toBe(-1);
    expect(rowAt(layout, layout.panel.x + 2, layout.panel.y + 2)).toBe(-1);
  });
});
