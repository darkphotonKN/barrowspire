import { describe, expect, it } from "vitest";
import { FIELD_CHART, fieldChartKey, writeFieldChart, FieldChart } from "./fieldChart";
import { FieldChartKeeper } from "./fieldChartKeeper";

// FS-P0HSP §D.25, §D.28 (review round 1): a visit's charted ground, kept: the map's redraw at most
// every FIELD_CHART.redraw while new ground is charted, the browser's write at most every
// FIELD_CHART.save, and once more as the visit ends, for the character and field it was read for.

const FOREST = { width: 3120, height: 2000 };

/** One browser's store. */
function browser() {
  const held = new Map<string, string>();
  const writes: string[] = [];
  const reach = () => ({
    getItem: (k: string) => held.get(k) ?? null,
    setItem: (k: string, v: string) => void (writes.push(k), held.set(k, v)),
    removeItem: (k: string) => void held.delete(k),
  });
  return { held, writes, reach };
}

const open = (store = browser(), owner: string | null = "char-a", now = 0) => ({
  store,
  kept: new FieldChartKeeper(store.reach, owner, "forlorn_forest", FOREST, now),
});

describe("FieldChartKeeper (FS-P0HSP §D.25, §D.28)", () => {
  it("should open on the character's ground in the field, as this browser kept it (§D.25)", () => {
    const store = browser();
    const before = new FieldChart(FOREST);
    before.chartAround({ x: 600, y: 600 });
    writeFieldChart(store.reach, "char-a", "forlorn_forest", before);
    expect(open(store).kept.chart.charted(15, 15)).toBe(true);
    expect(open(store, "char-b").kept.chart.charted(15, 15)).toBe(false);
  });

  describe("the map's redraw (§D.28)", () => {
    it("should be due at once the first time", () => {
      expect(open().kept.redrawDue(0, 0)).toBe(true);
    });

    it("should not be due while nothing new is charted and the walls are as drawn", () => {
      const { kept } = open();
      kept.redrawDue(3, 0);
      expect(kept.redrawDue(3, 10_000)).toBe(false);
    });

    it("should be due for new ground only once the redraw wait has passed since the last", () => {
      const { kept } = open();
      kept.redrawDue(0, 0);
      kept.chart.chartAround({ x: 600, y: 600 });
      expect(kept.redrawDue(0, FIELD_CHART.redraw - 1)).toBe(false);
      expect(kept.redrawDue(0, FIELD_CHART.redraw)).toBe(true);
      expect(kept.redrawDue(0, FIELD_CHART.redraw * 3)).toBe(false);
    });

    it("should be due when the field's walls arrive, after the wait", () => {
      const { kept } = open();
      kept.redrawDue(0, 0);
      expect(kept.redrawDue(12, 100)).toBe(false);
      expect(kept.redrawDue(12, FIELD_CHART.redraw)).toBe(true);
    });
  });

  describe("the browser's write (§D.25)", () => {
    it("should write nothing while nothing new is charted", () => {
      const { kept, store } = open();
      kept.save(FIELD_CHART.save * 5);
      kept.saveLast();
      expect(store.writes).toEqual([]);
    });

    it("should write new ground no sooner than the save wait since the visit opened or the last write", () => {
      const { kept, store } = open(browser(), "char-a", 1000);
      kept.chart.chartAround({ x: 600, y: 600 });
      kept.save(1000 + FIELD_CHART.save - 1);
      expect(store.writes).toEqual([]);
      kept.save(1000 + FIELD_CHART.save);
      expect(store.writes).toEqual([fieldChartKey("char-a", "forlorn_forest")]);
      kept.chart.chartAround({ x: 2500, y: 1500 });
      kept.save(1000 + FIELD_CHART.save * 2 - 1);
      expect(store.writes).toHaveLength(1);
      kept.save(1000 + FIELD_CHART.save * 2);
      expect(store.writes).toHaveLength(2);
    });

    it("should write what is unwritten once more as the visit ends, whatever the time", () => {
      const { kept, store } = open();
      kept.chart.chartAround({ x: 600, y: 600 });
      kept.saveLast();
      expect(store.writes).toHaveLength(1);
      kept.saveLast();
      expect(store.writes).toHaveLength(1);
      expect(open(store).kept.chart.charted(15, 15)).toBe(true);
    });

    it("should keep nothing with no active character, the chart still charting (§D.26)", () => {
      const { kept, store } = open(browser(), null);
      kept.chart.chartAround({ x: 600, y: 600 });
      kept.save(FIELD_CHART.save);
      kept.saveLast();
      expect(store.writes).toEqual([]);
      expect(kept.chart.charted(15, 15)).toBe(true);
    });
  });
});
