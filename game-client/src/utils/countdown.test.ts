import { describe, expect, it } from "vitest";
import { countdownFraction } from "./countdown";

describe("countdownFraction (FS-B3NDZ R6, R7: remaining over total)", () => {
  it.each([
    [15_000, 30_000, 0.5],
    [30_000, 30_000, 1],
    [45_000, 30_000, 1],
    [-200, 30_000, 0],
    [1_000, 0, 0],
    [1_000, -5, 0],
  ])("should read %s ms left of %s as %s", (remaining, total, fraction) => {
    expect(countdownFraction(remaining, total)).toBe(fraction);
  });
});
