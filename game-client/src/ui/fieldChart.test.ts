import { describe, expect, it } from "vitest";
import { FIELD_CHART, FieldChart, fieldChartKey, readFieldChart, writeFieldChart } from "./fieldChart";

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

  it("should chart on each state: a cell the circle reaches while the player stays in one cell is charted (§D.21)", () => {
    const { cell, radius } = FIELD_CHART;
    const from = { x: 205, y: 1005 };
    const to = { x: 235, y: 1035 };
    expect([Math.floor(to.x / cell), Math.floor(to.y / cell)]).toEqual([Math.floor(from.x / cell), Math.floor(from.y / cell)]);
    const chart = new FieldChart(FOREST);
    chart.chartAround(from);
    // the cells whose centres the circle reaches only from the second point
    const within = (p: { x: number; y: number }, cx: number, cy: number) => Math.hypot((cx + 0.5) * cell - p.x, (cy + 0.5) * cell - p.y) <= radius;
    const reached: [number, number][] = [];
    for (let cy = 0; cy < chart.rows; cy++)
      for (let cx = 0; cx < chart.cols; cx++) if (within(to, cx, cy) && !within(from, cx, cy)) reached.push([cx, cy]);
    expect(reached.length).toBeGreaterThan(0);
    for (const [cx, cy] of reached) expect(chart.charted(cx, cy)).toBe(false);
    expect(chart.chartAround(to)).toBe(true);
    for (const [cx, cy] of reached) expect(chart.charted(cx, cy)).toBe(true);
  });

  it("should say nothing is new on a state at the same place (§D.28: no redraw while nothing new is charted)", () => {
    const chart = new FieldChart(FOREST);
    chart.chartAround({ x: 205, y: 1005 });
    const { version } = chart;
    expect(chart.chartAround({ x: 205, y: 1005 })).toBe(false);
    expect(chart.version).toBe(version);
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

// FS-P0HSP §D.25–§D.27 (I-P0HSP-5): charted ground kept per character and field in this browser.
describe("the stored chart (FS-P0HSP §D.25–§D.27)", () => {
  /** A browser store in memory, and what was written to it. */
  function fakeStore(over: Partial<{ getItem: () => string | null; setItem: () => void }> = {}) {
    const held = new Map<string, string>();
    const writes: string[] = [];
    const store = {
      getItem: (k: string) => held.get(k) ?? null,
      setItem: (k: string, v: string) => {
        writes.push(k);
        held.set(k, v);
      },
      removeItem: (k: string) => void held.delete(k),
      ...over,
    };
    return { held, writes, reach: () => store };
  }
  const MEADOWS = { width: 2000, height: 1000 };

  it("should key a chart by character and field (§D.25)", () => {
    expect(fieldChartKey("char-a", "forlorn_forest")).toBe("barrowspire_field_chart:char-a:forlorn_forest");
  });

  it("should write {v, cell, cols, rows, bits} with the bits base64, row by row, lowest bit first (§D.25)", () => {
    const { held, reach } = fakeStore();
    const chart = new FieldChart({ width: 120, height: 80 });
    chart.chartAround({ x: 20, y: 20 });
    writeFieldChart(reach, "a", "dev_test_room", chart);
    const value = JSON.parse(held.get(fieldChartKey("a", "dev_test_room"))!);
    expect(value).toEqual({ v: 1, cell: 40, cols: 3, rows: 2, bits: expect.any(String) });
    const bytes = Uint8Array.from(atob(value.bits), (c) => c.charCodeAt(0));
    expect([...bytes]).toEqual([...chart.bits]);
  });

  it("should read back for the same character in the same field, and not for another character or field (§D.25, §D.27)", () => {
    const { reach } = fakeStore();
    const chart = new FieldChart(FOREST);
    chart.chartAround({ x: 600, y: 600 });
    writeFieldChart(reach, "a", "forlorn_forest", chart);
    expect(chartedOf(readFieldChart(reach, "a", "forlorn_forest", FOREST))).toEqual(chartedOf(chart));
    expect(chartedOf(readFieldChart(reach, "b", "forlorn_forest", FOREST)).size).toBe(0);
    expect(chartedOf(readFieldChart(reach, "a", "gentle_meadows", MEADOWS)).size).toBe(0);
  });

  it("should union what it writes with what is stored, so two tabs never lose each other's ground (§D.25)", () => {
    const { reach } = fakeStore();
    const one = new FieldChart(FOREST);
    one.chartAround({ x: 600, y: 600 });
    writeFieldChart(reach, "a", "forlorn_forest", one);
    const two = new FieldChart(FOREST);
    two.chartAround({ x: 2500, y: 1500 });
    writeFieldChart(reach, "a", "forlorn_forest", two);
    const both = new Set([...within({ x: 600, y: 600 }), ...within({ x: 2500, y: 1500 })]);
    expect(chartedOf(readFieldChart(reach, "a", "forlorn_forest", FOREST))).toEqual(both);
    // and the writer's own chart takes the other tab's ground in
    expect(chartedOf(two)).toEqual(both);
  });

  it.each([
    ["cols", { v: 1, cell: 40, cols: 78, rows: 25 }],
    ["rows", { v: 1, cell: 40, cols: 50, rows: 24 }],
    ["cell", { v: 1, cell: 80, cols: 50, rows: 25 }],
    ["v", { v: 2, cell: 40, cols: 50, rows: 25 }],
  ])("should drop a stored chart whose %s does not fit the field now, and start empty (§D.25)", (_what, shape) => {
    const { held, reach } = fakeStore();
    const bits = btoa(String.fromCharCode(...new Uint8Array(Math.ceil((50 * 25) / 8)).fill(255)));
    held.set(fieldChartKey("a", "gentle_meadows"), JSON.stringify({ ...shape, bits }));
    expect(chartedOf(readFieldChart(reach, "a", "gentle_meadows", MEADOWS)).size).toBe(0);
  });

  it.each([
    ["an unparsable value", () => fakeStore({ getItem: () => "{not json" }).reach],
    ["bits that are not base64", () => fakeStore({ getItem: () => JSON.stringify({ v: 1, cell: 40, cols: 50, rows: 25, bits: "%%%" }) }).reach],
    ["a throwing read", () => fakeStore({ getItem: () => { throw new Error("blocked"); } }).reach],
    ["no store", () => () => null],
    ["a store that throws to reach", () => () => { throw new Error("SecurityError"); }],
  ])("should start empty and throw nothing on %s (§D.26)", (_what, reach) => {
    expect(() => readFieldChart(reach(), "a", "gentle_meadows", MEADOWS)).not.toThrow();
    expect(chartedOf(readFieldChart(reach(), "a", "gentle_meadows", MEADOWS)).size).toBe(0);
  });

  it("should keep the chart and throw nothing where the write throws (storage full or blocked) (§D.26)", () => {
    const { reach } = fakeStore({ setItem: () => { throw new Error("QuotaExceededError"); } });
    const chart = new FieldChart(FOREST);
    chart.chartAround({ x: 600, y: 600 });
    const before = chartedOf(chart);
    expect(() => writeFieldChart(reach, "a", "forlorn_forest", chart)).not.toThrow();
    expect(chartedOf(chart)).toEqual(before);
  });

  it("should keep nothing and read nothing with no active character (§D.26)", () => {
    const { writes, reach } = fakeStore();
    const chart = new FieldChart(FOREST);
    chart.chartAround({ x: 600, y: 600 });
    writeFieldChart(reach, null, "forlorn_forest", chart);
    expect(writes).toEqual([]);
    expect(chartedOf(readFieldChart(reach, null, "forlorn_forest", FOREST)).size).toBe(0);
  });
});
