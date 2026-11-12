import { describe, expect, it } from "vitest";
import { FOREST_GATE, FOREST_SIZE, FOREST_WALLS } from "@/render/world/forest.fixture";
import { FieldChart } from "./fieldChart";
import { fieldMap } from "./fieldMap";

// FS-P0HSP §B.6, §B.7, §B.10, §C.16, §D.22 (I-P0HSP-4): a field's map, drawn only where charted.

const WALLS = FOREST_WALLS.map((r, i) => ({
  entity_id: `stand-${i}`,
  house_id: `stand-${i}`,
  position: { x: r.x, y: r.y },
  width: r.width,
  height: r.height,
}));
const ROAD_HOME = { entity_id: "road", destination: "hub" as const, position: FOREST_GATE, range: 80 };
const field = { walls: WALLS, gates: [ROAD_HOME] };

/** Whether world point p lies in one of the chart's runs. */
const inCharted = (chart: FieldChart, p: { x: number; y: number }) =>
  chart.runs().some((r) => p.x >= r.x - 1e-9 && p.x <= r.x + r.width + 1e-9 && p.y >= r.y - 1e-9 && p.y <= r.y + r.height + 1e-9);

describe("fieldMap (FS-P0HSP §B, §C.16, §D)", () => {
  it("should draw nothing at all while nothing is charted (§D.22)", () => {
    const map = fieldMap(new FieldChart(FOREST_SIZE), field, FOREST_SIZE);
    expect(map.ground).toEqual([]);
    expect(map.lines).toEqual([]);
    expect(map.solids!(0.05)).toEqual([]);
    expect(map.marks).toEqual([]);
  });

  it("should lay the charted ground as its merged runs (§B.6, §D.28)", () => {
    const chart = new FieldChart(FOREST_SIZE);
    chart.chartAround({ x: 1500, y: 1000 });
    const map = fieldMap(chart, field, FOREST_SIZE);
    expect(map.ground).toHaveLength(chart.runs().length);
    expect(map.ground[0]).toHaveLength(4);
  });

  it("should line the field's edge only where charted, open at the road home, and nowhere inside (§B.7, §D.22)", () => {
    const chart = new FieldChart(FOREST_SIZE);
    chart.chartAround({ x: 2900, y: 1480 });
    const { lines } = fieldMap(chart, field, FOREST_SIZE);
    expect(lines.length).toBeGreaterThan(0);
    const points = lines.flatMap((r) => r.points);
    // the east edge only, along charted cells, never across the road home's gap
    for (const p of points) {
      expect(p.x).toBe(FOREST_SIZE.width);
      expect(inCharted(chart, { x: p.x - 1, y: p.y })).toBe(true);
    }
    expect(lines.every((r) => !r.closed)).toBe(true);
    const ys = lines.map((r) => r.points.map((p) => p.y));
    expect(ys).toContainEqual(expect.arrayContaining([1400]));
    expect(ys).toContainEqual(expect.arrayContaining([1560]));
    for (const r of lines) {
      const [a, b] = [Math.min(...r.points.map((p) => p.y)), Math.max(...r.points.map((p) => p.y))];
      expect(b <= 1400 || a >= 1560).toBe(true);
    }
  });

  it("should fill each keep-out only where it lies on charted ground (§B.10)", () => {
    const chart = new FieldChart(FOREST_SIZE);
    chart.chartAround({ x: 1500, y: 1000 });
    const solids = fieldMap(chart, field, FOREST_SIZE).solids!(0.05);
    expect(solids.length).toBeGreaterThan(0);
    for (const polygon of solids) for (const p of polygon) expect(inCharted(chart, p)).toBe(true);
    // a stand nowhere near the charted ground draws nothing
    const far = fieldMap(chart, { walls: [{ ...WALLS[0], position: { x: 100, y: 100 }, width: 80, height: 80 }], gates: [] }, FOREST_SIZE);
    expect(far.solids!(0.05)).toEqual([]);
  });

  it("should mark the road home a teleport only once its cell is charted (§C.16)", () => {
    const chart = new FieldChart(FOREST_SIZE);
    chart.chartAround({ x: 1500, y: 1000 });
    expect(fieldMap(chart, field, FOREST_SIZE).marks).toEqual([]);
    chart.chartAround({ x: 2900, y: 1480 });
    expect(fieldMap(chart, field, FOREST_SIZE).marks).toEqual([{ kind: "teleport", at: FOREST_GATE }]);
  });

  it("should change its key with the charted ground and the walls, not otherwise", () => {
    const chart = new FieldChart(FOREST_SIZE);
    chart.chartAround({ x: 1500, y: 1000 });
    const key = fieldMap(chart, field, FOREST_SIZE).key;
    expect(fieldMap(chart, { walls: [...WALLS], gates: [ROAD_HOME] }, FOREST_SIZE).key).toBe(key);
    expect(fieldMap(chart, { walls: WALLS.slice(1), gates: [ROAD_HOME] }, FOREST_SIZE).key).not.toBe(key);
    chart.chartAround({ x: 2000, y: 1000 });
    expect(fieldMap(chart, field, FOREST_SIZE).key).not.toBe(key);
  });
});
