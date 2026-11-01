import { describe, expect, it } from "vitest";
import { FADED_ALPHA, coveredBy, covering, occludes, stepAlpha } from "./occlusion";

const box = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});

describe("occludes", () => {
  const player = { bounds: box(100, 100, 60, 60), depth: 500 };

  it("should fade a prop that overlaps the player and stands nearer the viewer", () => {
    expect(
      occludes({ bounds: box(80, 40, 120, 200), depth: 520 }, player),
    ).toBe(true);
  });

  it("should leave a prop behind the player alone, however much it overlaps", () => {
    expect(
      occludes({ bounds: box(80, 40, 120, 200), depth: 480 }, player),
    ).toBe(false);
  });

  it("should leave a nearer prop alone when it does not overlap", () => {
    expect(
      occludes({ bounds: box(170, 40, 50, 200), depth: 900 }, player),
    ).toBe(false);
    expect(
      occludes({ bounds: box(100, 161, 60, 60), depth: 900 }, player),
    ).toBe(false);
  });
});

describe("coveredBy (FS-9PN7X §E.1)", () => {
  const player = { bounds: box(100, 100, 60, 60), depth: 500 };
  const nearOver = { bounds: box(80, 40, 120, 200), depth: 520 };
  const nearAside = { bounds: box(300, 40, 120, 200), depth: 520 };
  const farOver = { bounds: box(80, 40, 120, 200), depth: 480 };

  it("should cover the player when any piece both overlaps them and sorts nearer", () => {
    expect(coveredBy(player, [nearAside, farOver, nearOver])).toBe(true);
  });

  it("should not cover the player with a piece that only overlaps, or is only nearer", () => {
    expect(coveredBy(player, [farOver])).toBe(false);
    expect(coveredBy(player, [nearAside])).toBe(false);
    expect(coveredBy(player, [nearAside, farOver])).toBe(false);
  });

  it("should not cover the player with no pieces at all", () => {
    expect(coveredBy(player, [])).toBe(false);
  });
});

describe("covering (FS-9PN7X §E.1, §E.3)", () => {
  const player = { bounds: box(100, 100, 60, 60), depth: 500 };
  const roof = { bounds: box(80, 40, 120, 80), depth: 520, part: "roof" };
  const wall = { bounds: box(90, 120, 40, 90), depth: 530, part: "wall" };
  const aside = { bounds: box(300, 40, 120, 200), depth: 520, part: "aside" };
  const behind = { bounds: box(80, 40, 120, 200), depth: 480, part: "behind" };

  it("should hand back exactly the pieces covering the player, in order, with what they carry", () => {
    expect(covering(player, [aside, roof, behind, wall]).map((c) => c.part)).toEqual(["roof", "wall"]);
  });

  it("should hand back nothing when nothing covers", () => {
    expect(covering(player, [aside, behind])).toEqual([]);
    expect(covering(player, [])).toEqual([]);
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
