import { describe, expect, it } from "vitest";
import { abilityBarFrame } from "./abilityBarLayout";
import { BOOK_LAYOUT, bookLayout, pageAt } from "./classBookLayout";
import { PANEL_TITLE_BAND } from "./panelFrame";
import { PAGE_ROUNDEL_SIZE } from "./pageRoundel";

// FS-X2CMM §G R36, R37, R39 (I-X2CMM-10): where the book stands and its roundels in it. Over the ability
// bar, centred, clear of the player in the middle of the view, so walking stays free with it open.

const VIEW = { width: 1080, height: 720 };

describe("the class book's layout (FS-X2CMM R37)", () => {
  it("should stand centred over the ability bar, its foot clear of the bar's top", () => {
    const { panel } = bookLayout(VIEW, 5);
    expect(panel.x + panel.width / 2).toBeCloseTo(VIEW.width / 2, 0);
    expect(panel.y + panel.height).toBe(abilityBarFrame(VIEW).top - BOOK_LAYOUT.overBar);
    // the player stands in the view's middle: the book stays under them
    expect(panel.y).toBeGreaterThan(VIEW.height / 2);
  });

  it("should lay a page's roundel at the book's size in one row, in book order, under the title band", () => {
    const { panel, pages } = bookLayout(VIEW, 5);
    expect(pages).toHaveLength(5);
    for (const p of pages) {
      expect(p.width).toBe(PAGE_ROUNDEL_SIZE.book);
      expect(p.height).toBe(PAGE_ROUNDEL_SIZE.book);
      expect(p.y).toBeGreaterThanOrEqual(panel.y + PANEL_TITLE_BAND);
      expect(p.x).toBeGreaterThanOrEqual(panel.x);
      expect(p.x + p.width).toBeLessThanOrEqual(panel.x + panel.width);
    }
    const xs = pages.map((p) => p.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(new Set(pages.map((p) => p.y)).size).toBe(1);
  });

  it("should centre a short book's row in its leaf, and wrap past a row's pages", () => {
    const three = bookLayout(VIEW, 3);
    const mid = (three.pages[0].x + three.pages[2].x + three.pages[2].width) / 2;
    expect(mid).toBeCloseTo(three.leaf.x + three.leaf.width / 2, 0);
    const seven = bookLayout(VIEW, BOOK_LAYOUT.columns + 2);
    expect(new Set(seven.pages.map((p) => p.y)).size).toBe(2);
  });

  it("should put each page's caption under its roundel, inside the leaf", () => {
    const { pages, captions, leaf } = bookLayout(VIEW, 3);
    captions.forEach((c, i) => {
      expect(c.x).toBe(pages[i].x + pages[i].width / 2);
      expect(c.y).toBeGreaterThan(pages[i].y + pages[i].height);
      expect(c.y).toBeLessThan(leaf.y + leaf.height);
    });
  });

  it("should keep an empty book's panel at its least width, its line in the leaf's middle", () => {
    const { panel, pages, empty, leaf } = bookLayout(VIEW, 0);
    expect(pages).toEqual([]);
    expect(panel.width).toBe(BOOK_LAYOUT.minWidth);
    expect(empty).toEqual({ x: leaf.x + leaf.width / 2, y: leaf.y + leaf.height / 2 });
  });

  it("should find the page under a point, and none off every roundel", () => {
    const layout = bookLayout(VIEW, 3);
    const p = layout.pages[1];
    expect(pageAt(layout, p.x + p.width / 2, p.y + p.height / 2)).toBe(1);
    expect(pageAt(layout, layout.panel.x + 2, layout.panel.y + 2)).toBe(-1);
  });
});
