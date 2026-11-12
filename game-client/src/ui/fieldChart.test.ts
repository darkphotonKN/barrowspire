import { describe, expect, it } from "vitest";
import { FIELD_CHART, FieldChart } from "./fieldChart";

// FS-P0HSP §D.21–§D.24, §D.28 (I-P0HSP-4): a field's charted ground, round the player as they walk.

const FOREST = { width: 3120, height: 2000 };
/** Every cell whose centre lies within the radius of `p`, as "cx,cy". */
const within = (p: { x: number; y: number }, size = FOREST) => {
  const { cell, radius } = FIELD_CHART;
  const out = new Set<string>();
  for (let cy = 0; cy < Math.ceil(size.height / cell); cy++)
    for (let cx = 0; cx < Math.ceil(size.width / cell); cx++)
      if (Math.hypot((cx + 0.5) * cell - p.x, (cy + 0.5) * cell - p.y) <= radius) out.add(`${cx},${cy}`);
  return out;
};
const chartedOf = (chart: FieldChart) => {
  const out = new Set<string>();
  for (let cy = 0; cy < chart.rows; cy++) for (let cx = 0; cx < chart.cols; cx++) if (chart.charted(cx, cy)) out.add(`${cx},${cy}`);
  return out;
};

describe("FieldChart (FS-P0HSP §D)", () => {
  it("should name its cell, radius and cadences (§D.21, §D.25, §D.28)", () => {
    expect(FIELD_CHART).toEqual({ cell: 40, radius: 480, redraw: 250, save: 2000 });
  });

  it("should cover the field in 40 px cells, a part cell at the edge counted (§D.21)", () => {
    expect([new FieldChart(FOREST).cols, new FieldChart(FOREST).rows]).toEqual([78, 50]);
    expect([new FieldChart({ width: 900, height: 600 }).cols, new FieldChart({ width: 900, height: 600 }).rows]).toEqual([23, 15]);
  });

  it("should start uncharted (§D.21)", () => {
    expect(chartedOf(new FieldChart(FOREST)).size).toBe(0);
  });

  it("should chart the cells whose centres lie within 480 world px of the player, and no others (§D.21)", () => {
    const chart = new FieldChart(FOREST);
    expect(chart.chartAround({ x: 200, y: 1000 })).toBe(true);
    expect(chartedOf(chart)).toEqual(within({ x: 200, y: 1000 }));
  });

  it("should add only the new cells at a second position, and say when nothing is new (§D.21, §D.28)", () => {
    const chart = new FieldChart(FOREST);
    chart.chartAround({ x: 200, y: 1000 });
    const before = chart.version;
    expect(chart.chartAround({ x: 600, y: 1000 })).toBe(true);
    expect(chartedOf(chart)).toEqual(new Set([...within({ x: 200, y: 1000 }), ...within({ x: 600, y: 1000 })]));
    expect(chart.version).toBe(before + 1);
    // back where it was: nothing new, nothing to redraw
    expect(chart.chartAround({ x: 200, y: 1000 })).toBe(false);
    expect(chart.version).toBe(before + 1);
  });

  it("should do nothing while the player stays in one cell (§D.28: only the cells newly entered cost)", () => {
    const chart = new FieldChart(FOREST);
    chart.chartAround({ x: 205, y: 1005 });
    expect(chart.chartAround({ x: 215, y: 1015 })).toBe(false);
  });

  it("should keep to the field at its edges", () => {
    const chart = new FieldChart(FOREST);
    chart.chartAround({ x: 10, y: 10 });
    expect(chartedOf(chart)).toEqual(within({ x: 10, y: 10 }));
  });

  it("should give the charted ground as merged runs, not a rect a cell (§D.28)", () => {
    const chart = new FieldChart(FOREST);
    chart.chartAround({ x: 1500, y: 1000 });
    const runs = chart.runs();
    const cells = within({ x: 1500, y: 1000 }).size;
    expect(runs.length).toBeLessThan(cells / 5);
    // the runs cover the charted cells exactly, once each
    const covered = new Set<string>();
    for (const r of runs)
      for (let x = r.x; x < r.x + r.width; x += 40)
        for (let y = r.y; y < r.y + r.height; y += 40) {
          const k = `${x / 40},${y / 40}`;
          expect(covered.has(k)).toBe(false);
          covered.add(k);
        }
    expect(covered).toEqual(chartedOf(chart));
  });

  it("should clip a part cell's run to the field's edge", () => {
    const chart = new FieldChart({ width: 900, height: 600 });
    chart.chartAround({ x: 880, y: 580 });
    for (const r of chart.runs()) {
      expect(r.x + r.width).toBeLessThanOrEqual(900);
      expect(r.y + r.height).toBeLessThanOrEqual(600);
    }
  });
});
