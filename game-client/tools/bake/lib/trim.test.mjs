import { describe, it, expect } from "vitest";
import { TRIM_MARGIN, cropFrame, expandFrame, trimGrid, trimRect } from "./trim.mjs";

/** A blank `w × h` frame with the given px set (alpha, or a full RGBA). */
function frame(w, h, set = []) {
  const px = Buffer.alloc(w * h * 4);
  for (const [x, y, rgba = [200, 100, 50, 255]] of set) px.set(rgba, (y * w + x) * 4);
  return px;
}

describe("trimRect (a frame cut to its pixels)", () => {
  it("cuts to the pixels, grown by the margin each side", () => {
    const px = frame(20, 16, [
      [5, 4],
      [9, 10],
    ]);
    expect(TRIM_MARGIN).toBe(1);
    expect(trimRect(px, 20, 16)).toEqual({ x: 4, y: 3, w: 7, h: 9 });
  });

  it("keeps a pixel with colour under zero alpha, so nothing is lost", () => {
    const px = frame(20, 16, [
      [5, 4],
      [12, 4, [9, 0, 0, 0]],
    ]);
    expect(trimRect(px, 20, 16, { margin: 0 })).toEqual({ x: 5, y: 4, w: 8, h: 1 });
  });

  it("lands on whole screen px for a sheet baked at a scale: offset and size are multiples of it", () => {
    const px = frame(40, 32, [
      [7, 6],
      [20, 17],
    ]);
    // 7..20 grown to 6..22, out to even px: 6..22 → x 6, w 16; 6..17 grown to 5..19 → 4..20
    const rect = trimRect(px, 40, 32, { grid: 2 });
    expect(rect).toEqual({ x: 6, y: 4, w: 16, h: 16 });
    for (const v of Object.values(rect)) expect(v % 2).toBe(0);
  });

  it("lands on two screen px for a sheet baked at 1.5: offset and size multiples of 3 sheet px (§ Change: Class sheets at 1.5x R31)", () => {
    expect(trimGrid(1.5)).toBe(3);
    const px = frame(48, 36, [
      [7, 6],
      [20, 17],
    ]);
    // 7..20 grown to 6..22, out to multiples of 3: 6..24; 6..17 grown to 5..19, out to 3..21
    const rect = trimRect(px, 48, 36, { grid: trimGrid(1.5) });
    expect(rect).toEqual({ x: 6, y: 3, w: 18, h: 18 });
    for (const v of Object.values(rect)) expect(v % 3).toBe(0);
    expect(expandFrame(cropFrame(px, 48, rect), rect, 48, 36).equals(px)).toBe(true);
  });

  it("trimGrid is whole screen px at a whole scale and two screen px at 1.5 (ADR-0076 Decision 3)", () => {
    expect([1, 2, 3, 4].map(trimGrid)).toEqual([1, 2, 3, 4]);
    expect(trimGrid(1.5)).toBe(3);
  });

  it("stays inside the frame when the pixels touch its edge", () => {
    const px = frame(10, 8, [
      [0, 0],
      [9, 7],
    ]);
    expect(trimRect(px, 10, 8)).toEqual({ x: 0, y: 0, w: 10, h: 8 });
  });

  it("gives a blank frame one grid cell, so it still has a size", () => {
    expect(trimRect(frame(10, 8), 10, 8, { grid: 2 })).toEqual({ x: 0, y: 0, w: 2, h: 2 });
  });

  it("refuses a frame that is not a whole number of screen px", () => {
    expect(() => trimRect(frame(9, 8), 9, 8, { grid: 2 })).toThrow(/multiple/);
  });
});

describe("cropFrame and expandFrame", () => {
  it("round-trip a frame byte for byte", () => {
    const px = frame(24, 18, [
      [3, 2, [1, 2, 3, 4]],
      [11, 9],
      [20, 15, [255, 255, 255, 1]],
    ]);
    const rect = trimRect(px, 24, 18, { grid: 2 });
    const cut = cropFrame(px, 24, rect);
    expect(cut.length).toBe(rect.w * rect.h * 4);
    expect(expandFrame(cut, rect, 24, 18).equals(px)).toBe(true);
  });

  it("cuts the rows of the rect, nothing else", () => {
    const px = frame(4, 3, [
      [1, 1, [10, 11, 12, 13]],
      [2, 1, [20, 21, 22, 23]],
    ]);
    expect([...cropFrame(px, 4, { x: 1, y: 1, w: 2, h: 1 })]).toEqual([10, 11, 12, 13, 20, 21, 22, 23]);
  });
});
