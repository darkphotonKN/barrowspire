import { describe, expect, it } from "vitest";
import { WARES_PANEL_WIDTH, waresLayout } from "./waresLayout";

const inside = (inner: { x: number; y: number; width: number; height: number }, outer: typeof inner) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

// FS-9JV5K §F R22 (I-9JV5K-5)
describe("waresLayout: where the wares panel's pieces stand (FS-9JV5K §F R22)", () => {
  it("should centre the panel on the view and grow it a row per ware", () => {
    const two = waresLayout({ x: 640, y: 360 }, 2);
    const three = waresLayout({ x: 640, y: 360 }, 3);
    expect(two.panel.width).toBe(WARES_PANEL_WIDTH);
    expect(two.panel.x + two.panel.width / 2).toBe(640);
    expect(two.panel.y + two.panel.height / 2).toBe(360);
    expect(three.panel.height - two.panel.height).toBe(three.rows[1].y - three.rows[0].y);
  });

  it("should stack the rows under the title band, each with its icon and Buy inside the panel, the Buy at the right", () => {
    const { panel, rows } = waresLayout({ x: 640, y: 360 }, 3);
    expect(rows[0].y).toBeGreaterThanOrEqual(panel.y + 36);
    for (const row of rows) {
      expect(inside(row.icon, panel)).toBe(true);
      expect(inside(row.buy, panel)).toBe(true);
      expect(row.buy.x).toBeGreaterThan(row.textX);
      expect(row.icon.x + row.icon.width).toBeLessThan(row.textX);
    }
  });

  it("should put the refusal line and the purse line under the rows, inside the panel", () => {
    const { panel, rows, line, purse } = waresLayout({ x: 640, y: 360 }, 3);
    const lastRow = rows[2];
    expect(line.y).toBeGreaterThan(lastRow.y);
    expect(purse.y).toBeGreaterThan(line.y);
    expect(purse.y).toBeLessThan(panel.y + panel.height);
  });

  it("should give the purse line a band inside the panel, its hover's rect (FS-7TGZ3 R5)", () => {
    const { panel, purse } = waresLayout({ x: 640, y: 360 }, 3);
    expect(purse.width).toBeGreaterThan(0);
    expect(purse.height).toBeGreaterThan(0);
    expect(inside(purse, panel)).toBe(true);
  });
});
