import { describe, expect, it } from "vitest";
import { palette } from "@/utils/canvasPalette";
import { HOUND_BAY, paintHoundBay, type BayBrush } from "./houndBay";

function brush() {
  const calls: [string, ...number[]][] = [];
  const g: BayBrush = {
    clear: () => void calls.splice(0),
    fillStyle: (c: number, a = 1) => void calls.push(["fillStyle", c, a]),
    lineStyle: (w: number, c: number, a = 1) => void calls.push(["lineStyle", w, c, a]),
    fillEllipse: (x: number, y: number, w: number, h: number) => void calls.push(["fillEllipse", x, y, w, h]),
    strokeEllipse: (x: number, y: number, w: number, h: number) => void calls.push(["strokeEllipse", x, y, w, h]),
  };
  return { g, calls };
}

const rings = (calls: [string, ...number[]][]) => calls.filter(([c]) => c === "strokeEllipse");

// FS-X2CMM §J R49: the hound's bay, a mark at what it bays at.
describe("paintHoundBay", () => {
  it("should ripple rings out in the hound's verdigris, growing as the bay goes on", () => {
    const early = brush();
    paintHoundBay(early.g, HOUND_BAY.ms * 0.1);
    const later = brush();
    paintHoundBay(later.g, HOUND_BAY.ms * 0.3);
    expect(rings(early.calls).length).toBeGreaterThan(0);
    expect(rings(later.calls)[0][3]).toBeGreaterThan(rings(early.calls)[0][3]);
    for (const [, , color] of later.calls.filter(([c]) => c === "lineStyle")) expect(color).toBe(palette.bookEffect.houndBay);
  });

  it("should paint nothing before a bay or once its ripple is done", () => {
    for (const since of [-1, HOUND_BAY.ms, HOUND_BAY.ms * 2]) {
      const { g, calls } = brush();
      paintHoundBay(g, since);
      expect(calls).toEqual([]);
    }
  });

  it("should stand one still ring with reduced motion", () => {
    const a = brush();
    paintHoundBay(a.g, 100, true);
    const b = brush();
    paintHoundBay(b.g, 900, true);
    expect(rings(a.calls)).toHaveLength(1);
    expect(rings(a.calls)[0][3]).toBe(rings(b.calls)[0][3]);
  });
});
