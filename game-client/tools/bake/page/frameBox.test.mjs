import { describe, it, expect } from "vitest";
import { frameBox, wholeStep } from "./frameBox.js";
import { K1 } from "./projection.js";

/** View-space bounds whose sides fall `left`, `top`, `right`, `bottom` 1x px from the origin, before rounding up. */
const bounds = (left, top, right, bottom) => ({ minX: -left / K1, maxY: top / K1, maxX: right / K1, minY: -bottom / K1 });

describe("frameBox (a sheet's frame and anchor, FS-HF0WW R1, § Change: Class sheets at 1.5x R30)", () => {
  // each side rounds up to 69, 113, 97 and 37 1x px: an odd px on every side of the anchor
  const odd = bounds(68.5, 112.2, 96.4, 36.9);

  it("at a whole scale: the 1x box rounded up to whole px, the frame `scale` times it", () => {
    for (const scale of [1, 2, 3, 4]) {
      const box = frameBox(odd, { pad: 0, scale });
      expect([box.ax, box.ay, box.w1, box.h1]).toEqual([69, 113, 69 + 97, 113 + 37]);
      expect([box.frameWidth, box.frameHeight]).toEqual([box.w1 * scale, box.h1 * scale]);
      expect(box.anchorPx).toEqual([69 * scale, 113 * scale]);
    }
  });

  it("at 1.5: each side of the anchor rounded up to two 1x px, so the frame and the anchor are whole px", () => {
    const box = frameBox(odd, { pad: 0, scale: 1.5 });
    expect([box.ax, box.ay, box.w1, box.h1]).toEqual([70, 114, 70 + 98, 114 + 38]);
    expect([box.frameWidth, box.frameHeight]).toEqual([252, 228]);
    expect(box.anchorPx).toEqual([105, 171]);
    for (const v of [box.frameWidth, box.frameHeight, ...box.anchorPx]) expect(Number.isInteger(v), String(v)).toBe(true);
    // the frame is exactly 1.5 times the 1x box, the anchor the same fraction of it
    expect(box.frameWidth / box.w1).toBe(1.5);
    expect(box.anchorPx[0] / box.frameWidth).toBe(box.ax / box.w1);
    expect(box.anchorPx[1] / box.frameHeight).toBe(box.ay / box.h1);
  });

  it("at 1.5 a side already on an even px is not grown", () => {
    const box = frameBox(bounds(67.5, 111.2, 95.4, 35.9), { pad: 0, scale: 1.5 });
    expect([box.ax, box.ay, box.w1 - box.ax, box.h1 - box.ay]).toEqual([68, 112, 96, 36]);
  });

  it("takes the pad on every side before rounding", () => {
    const box = frameBox(bounds(68.5 - 0.1 * K1, 112.2 - 0.1 * K1, 96.4 - 0.1 * K1, 36.9 - 0.1 * K1), { pad: 0.1, scale: 1.5 });
    expect([box.ax, box.ay, box.w1, box.h1]).toEqual([70, 114, 168, 152]);
  });
});

describe("wholeStep (ADR-0076 Decision 2: the least whole number of 1x px that is whole at the scale)", () => {
  it("is 1 at a whole scale and 2 at 1.5", () => {
    expect([1, 2, 3, 4].map(wholeStep)).toEqual([1, 1, 1, 1]);
    expect(wholeStep(1.5)).toBe(2);
  });

  it.each([1.25, 2.4, 0])("refuses a scale that is not a whole number of halves above 0: %s", (scale) => {
    expect(() => wholeStep(scale)).toThrow(/scale/);
  });
});
