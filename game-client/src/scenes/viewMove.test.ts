import { describe, expect, it } from "vitest";

import { ViewBaseline } from "./viewMove";

describe("ViewBaseline (FS-1D6BX §Change: The container view closes when its player moves, R26–R29, A1, M2–M4)", () => {
  const opened = (x: number, y: number) => {
    const baseline = new ViewBaseline();
    baseline.open({ x, y });
    return baseline;
  };

  it.each([
    ["5 px along x", { x: 105, y: 100 }, true],
    ["5 px on a diagonal (3, 4)", { x: 103, y: 104 }, true],
    ["exactly 4 px", { x: 100, y: 104 }, false],
    ["4 px on each axis, 5.66 px straight", { x: 104, y: 104 }, true],
    ["not at all", { x: 100, y: 100 }, false],
    ["a Blink's 120 px", { x: 220, y: 100 }, true],
  ])("should judge a position %s from the baseline: moved %s", (_what, at, moved) => {
    expect(opened(100, 100).observe(at)).toBe(moved);
  });

  it("should measure from the baseline, never from the state before: 2 px steps close on the first past 4 px", () => {
    const baseline = opened(100, 100);
    expect(baseline.observe({ x: 102, y: 100 })).toBe(false);
    expect(baseline.observe({ x: 104, y: 100 })).toBe(false);
    expect(baseline.observe({ x: 106, y: 100 })).toBe(true);
  });

  it("should take a new baseline on each open", () => {
    const baseline = opened(100, 100);
    baseline.open({ x: 200, y: 100 });
    expect(baseline.observe({ x: 202, y: 100 })).toBe(false);
    expect(baseline.observe({ x: 100, y: 100 })).toBe(true);
  });

  it("should keep its own copy of the position it opened at", () => {
    const at = { x: 100, y: 100 };
    const baseline = new ViewBaseline();
    baseline.open(at);
    at.x = 300;
    expect(baseline.observe({ x: 100, y: 100 })).toBe(false);
  });

  it("should judge nothing on a position-less state and keep the baseline (M4)", () => {
    const baseline = opened(100, 100);
    expect(baseline.observe(undefined)).toBe(false);
    expect(baseline.observe({ x: 105, y: 100 })).toBe(true);
  });

  it("should take its baseline from the next position when it opened with none seen yet (M4)", () => {
    const baseline = new ViewBaseline();
    baseline.open(undefined);
    expect(baseline.observe(undefined)).toBe(false);
    expect(baseline.observe({ x: 300, y: 300 })).toBe(false);
    expect(baseline.observe({ x: 304, y: 300 })).toBe(false);
    expect(baseline.observe({ x: 305, y: 300 })).toBe(true);
  });
});
