import { describe, expect, it } from "vitest";
import { PAGE_IDS } from "@/ui/pageIcons";
import { PAGE_ROUNDEL_SIZE } from "@/ui/pageRoundel";
import { SHEET_LOOKS, lookOf, sheetLayout } from "./pageRoundels";

// FS-X2CMM §I R46 (I-X2CMM-9): the art gate's contact sheet holds all 14 roundels in their four looks.

describe("the Page roundels sheet (FS-X2CMM R46)", () => {
  it("should show every page once, in ready, locked, recovering and hovered, at 44 and 28 px", () => {
    const rows = sheetLayout().blocks.flatMap((b) => b.rows);
    expect(rows.map((r) => r.id)).toEqual([...PAGE_IDS]);
    for (const row of rows) {
      const shown = row.cells.map((c) => `${c.look}@${c.size}`);
      expect(shown).toEqual(
        [PAGE_ROUNDEL_SIZE.book, PAGE_ROUNDEL_SIZE.castBar].flatMap((size) => SHEET_LOOKS.map((look) => `${look}@${size}`)),
      );
      for (const c of row.cells) expect(c.box.width).toBe(c.size);
    }
  });

  it("should keep every roundel inside its panel and the sheet, none overlapping another", () => {
    const layout = sheetLayout();
    const boxes = layout.blocks.flatMap((b) =>
      b.rows.flatMap((r) =>
        r.cells.map((c) => {
          expect(c.box.x).toBeGreaterThanOrEqual(b.panel.x);
          expect(c.box.x + c.box.width).toBeLessThanOrEqual(b.panel.x + b.panel.width);
          expect(c.box.y + c.box.height).toBeLessThanOrEqual(b.panel.y + b.panel.height);
          return c.box;
        }),
      ),
    );
    for (const b of layout.blocks) expect(b.panel.x + b.panel.width).toBeLessThanOrEqual(layout.width);
    for (const [i, a] of boxes.entries())
      for (const c of boxes.slice(i + 1))
        expect(a.x + a.width <= c.x || c.x + c.width <= a.x || a.y + a.height <= c.y || c.y + c.height <= a.y).toBe(true);
  });

  it("should sweep a recovering page 40 % and lift only the hovered one", () => {
    expect(lookOf("recovering")).toEqual({ state: "recovering", hovered: false, swept: 0.4 });
    expect(lookOf("hovered")).toEqual({ state: "ready", hovered: true, swept: 0 });
    expect(lookOf("locked")).toEqual({ state: "locked", hovered: false, swept: 0 });
  });
});
