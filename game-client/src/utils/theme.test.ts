import { describe, expect, it } from "vitest";
import { palette } from "./canvasPalette";
import { BARROW, BARROW_HEX } from "./theme";

// FS-PQ2TW §Change: Ash, the owner's "火的顏色有辦法擬真一點嗎" (2026-11-12): fire runs a temperature
// ramp, hottest first, around `ember`: a pale white-yellow core, orange, ember, a deep red. For fire
// effects only; amber stays the interactable channel (design guideline, "Gameplay accent").

const rgb = (hex: number) => [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

const RAMP = ["fireCore", "fireHot", "ember", "fireDeep"] as const;

describe("fire's ramp (FS-PQ2TW, ADR-0013)", () => {
  it("should be tokens, each the same colour in BARROW and BARROW_HEX", () => {
    for (const key of RAMP) expect(Number.parseInt(BARROW[key].slice(1), 16), key).toBe(BARROW_HEX[key]);
  });

  it("should run hottest first: each step darker and redder than the one before", () => {
    const cs = RAMP.map((key) => rgb(BARROW_HEX[key]));
    for (let n = 1; n < cs.length; n++) {
      expect(lum(cs[n]), RAMP[n]).toBeLessThan(lum(cs[n - 1]));
      // green to red falls: white-yellow, orange, red
      expect(cs[n][1] / cs[n][0], RAMP[n]).toBeLessThan(cs[n - 1][1] / cs[n - 1][0]);
    }
  });

  it("should stay apart from amber, the interactable channel, and from oxblood, damage", () => {
    for (const key of RAMP) {
      for (const other of ["amber", "amberBright", "oxblood"] as const)
        expect(dist(rgb(BARROW_HEX[key]), rgb(BARROW_HEX[other])), `${key} / ${other}`).toBeGreaterThan(30);
    }
  });

  it("should be named for the canvas as fire, hottest first", () => {
    expect(palette.fire).toEqual({
      core: BARROW_HEX.fireCore,
      hot: BARROW_HEX.fireHot,
      ember: BARROW_HEX.ember,
      deep: BARROW_HEX.fireDeep,
    });
  });
});
