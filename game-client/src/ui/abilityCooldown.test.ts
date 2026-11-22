import { describe, expect, it } from "vitest";
import { cooldownSwept, sweepPolygon } from "./abilityCooldown";

// FS-Q18Q3 §D R18, R19: the sweep's pure half, the fraction still covered and the wedge that covers it

describe("cooldownSwept (FS-Q18Q3 R19: the server's numbers, run on with real time since they were heard)", () => {
  const cd = (remaining: number, total: number) => ({ remaining, total });

  it("should run down with the real time since the state arrived", () => {
    expect(cooldownSwept(cd(1.2, 1.2), 1000, 1600)).toBeCloseTo(0.5);
  });

  it("should never go below 0, however long the next state takes", () => {
    expect(cooldownSwept(cd(1.2, 1.2), 1000, 2500)).toBe(0);
  });

  it("should be remaining / total on the state itself", () => {
    expect(cooldownSwept(cd(0.3, 1.2), 1000, 1000)).toBeCloseTo(0.25);
  });

  it("should be taken from the next state, which corrects it", () => {
    // heard at 0.6 s after 300 ms: the server says 0.9 s still runs
    expect(cooldownSwept(cd(0.9, 1.2), 1300, 1300)).toBeCloseTo(0.75);
  });

  it("should never pass full, nor run backwards before its arrival", () => {
    expect(cooldownSwept(cd(2, 1.2), 1000, 1000)).toBe(1);
    expect(cooldownSwept(cd(0.6, 1.2), 1000, 900)).toBeCloseTo(0.5);
  });

  it.each([
    ["{0, 0}", cd(0, 0)],
    ["total 0 with remaining > 0", cd(0.5, 0)],
    ["a NaN remaining", cd(Number.NaN, 1)],
    ["none (an older server, or held)", null],
  ])("should sweep nothing for %s", (_name, cooldown) => {
    expect(cooldownSwept(cooldown, 0, 0)).toBe(0);
  });
});

describe("sweepPolygon (FS-Q18Q3 R18: from 12 o'clock, receding clockwise)", () => {
  const well = { x: 100, y: 200, width: 44, height: 44 };
  const [cx, cy, top, right, bottom, left] = [122, 222, 200, 144, 244, 100];
  const close = (points: { x: number; y: number }[]) =>
    points.map(({ x, y }) => [
      Math.round(x * 1000) / 1000,
      Math.round(y * 1000) / 1000,
    ]);

  it("should cover the whole well at 1: the centre, 12 o'clock, every corner clockwise, back to 12", () => {
    expect(close(sweepPolygon(well, 1))).toEqual([
      [cx, cy],
      [cx, top],
      [right, top],
      [right, bottom],
      [left, bottom],
      [left, top],
      [cx, top],
    ]);
  });

  it("should leave the first quarter clear at 0.75: from 3 o'clock round to 12", () => {
    expect(close(sweepPolygon(well, 0.75))).toEqual([
      [cx, cy],
      [right, cy],
      [right, bottom],
      [left, bottom],
      [left, top],
      [cx, top],
    ]);
  });

  it("should cover the last eighth at 0.125: the top-left corner's half of the top edge", () => {
    expect(close(sweepPolygon(well, 0.125))).toEqual([
      [cx, cy],
      [left, top],
      [cx, top],
    ]);
  });

  it("should draw nothing at 0, nor past its ends", () => {
    expect(sweepPolygon(well, 0)).toEqual([]);
    expect(sweepPolygon(well, -1)).toEqual([]);
    expect(sweepPolygon(well, 2)).toHaveLength(7);
  });
});
