import { describe, expect, it } from "vitest";
import { fourPointStar } from "./star";

describe("fourPointStar (FS-MAMHR §G.34, §G.35)", () => {
  it("should run clockwise from the top arm, arms `r` long, waist `r / 4`, about `at`", () => {
    expect(fourPointStar({ x: 10, y: 20 }, 8)).toEqual([
      { x: 10, y: 12 },
      { x: 12, y: 18 },
      { x: 18, y: 20 },
      { x: 12, y: 22 },
      { x: 10, y: 28 },
      { x: 8, y: 22 },
      { x: 2, y: 20 },
      { x: 8, y: 18 },
    ]);
  });

  it("should draw about the origin when `at` is (0, 0)", () => {
    const points = fourPointStar({ x: 0, y: 0 }, 5);
    expect(points[0]).toEqual({ x: 0, y: -5 });
    expect(points[2]).toEqual({ x: 5, y: 0 });
    expect(points[1]).toEqual({ x: 1.25, y: -1.25 });
  });
});
