import { describe, expect, it } from "vitest";
import { palette } from "@/utils/canvasPalette";
import { MARKER_BAR } from "./markers";
import { TEAMMATE_BAR, paintTeammateBar, teammateBarTop } from "./teammateBar";

// FS-8AY7S req 27, FS-CH21F R14, FS-4EC7Z §G R29: one overhead bar for a teammate and an ally, the
// monsters' overhead style, health only

function painter() {
  const calls: { op: string; colour?: number; rect?: number[] }[] = [];
  let colour = 0;
  return {
    calls,
    fillStyle(c: number) {
      colour = c;
    },
    lineStyle(_w: number, c: number) {
      colour = c;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      calls.push({ op: "fill", colour, rect: [x, y, w, h] });
    },
    strokeRect(x: number, y: number, w: number, h: number) {
      calls.push({ op: "stroke", colour, rect: [x, y, w, h] });
    },
  };
}

describe("paintTeammateBar", () => {
  const { width, height } = TEAMMATE_BAR;

  it("should paint a pitch backing, a barrow rim and the health fill, at its own origin", () => {
    const g = painter();
    paintTeammateBar(g, 0.5);
    expect(g.calls).toEqual([
      { op: "fill", colour: MARKER_BAR.backing, rect: [-1, -1, width + 2, height + 2] },
      { op: "stroke", colour: MARKER_BAR.rim, rect: [-1, -1, width + 2, height + 2] },
      { op: "fill", colour: MARKER_BAR.hp, rect: [0, 0, Math.round(width * 0.5), height] },
    ]);
  });

  it("should paint at a given top-left, and a poisoned fill in the poison ink", () => {
    const g = painter();
    paintTeammateBar(g, 1, { poisoned: true, at: { x: 10, y: 20 } });
    expect(g.calls[0].rect).toEqual([9, 19, width + 2, height + 2]);
    expect(g.calls.at(-1)).toEqual({ op: "fill", colour: palette.poisoned, rect: [10, 20, width, height] });
  });

  it("should stand its top `gap` px over the marker base, on a whole px", () => {
    expect(teammateBarTop(100)).toBe(100 - TEAMMATE_BAR.gap - TEAMMATE_BAR.height);
    expect(teammateBarTop(100.6)).toBe(Math.round(100.6 - TEAMMATE_BAR.gap - TEAMMATE_BAR.height));
  });
});
