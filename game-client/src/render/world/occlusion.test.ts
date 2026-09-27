import { describe, expect, it } from "vitest";
import { FADED_ALPHA, occludes, stepAlpha } from "./occlusion";

const box = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});

describe("occludes", () => {
  const delver = { bounds: box(100, 100, 60, 60), depth: 500 };

  it("should fade a prop that overlaps the delver and stands nearer the viewer", () => {
    expect(
      occludes({ bounds: box(80, 40, 120, 200), depth: 520 }, delver),
    ).toBe(true);
  });

  it("should leave a prop behind the delver alone, however much it overlaps", () => {
    expect(
      occludes({ bounds: box(80, 40, 120, 200), depth: 480 }, delver),
    ).toBe(false);
  });

  it("should leave a nearer prop alone when it does not overlap", () => {
    expect(
      occludes({ bounds: box(170, 40, 50, 200), depth: 900 }, delver),
    ).toBe(false);
    expect(
      occludes({ bounds: box(100, 161, 60, 60), depth: 900 }, delver),
    ).toBe(false);
  });
});

describe("stepAlpha", () => {
  it("should ease toward the faded alpha and settle on it", () => {
    let a = 1;
    const seen: number[] = [];
    for (let i = 0; i < 60; i++) seen.push((a = stepAlpha(a, FADED_ALPHA, 16)));
    expect(seen[0]).toBeLessThan(1);
    expect(seen[0]).toBeGreaterThan(FADED_ALPHA);
    expect(seen.every((v, i) => i === 0 || v <= seen[i - 1])).toBe(true);
    expect(a).toBe(FADED_ALPHA);
  });

  it("should restore to fully opaque once clear", () => {
    let a = FADED_ALPHA;
    for (let i = 0; i < 60; i++) a = stepAlpha(a, 1, 16);
    expect(a).toBe(1);
  });

  it("should fade to about 40%", () => {
    expect(FADED_ALPHA).toBeCloseTo(0.4);
  });
});
