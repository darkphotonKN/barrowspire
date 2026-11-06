import { describe, expect, it } from "vitest";
import { FEATHER, featherField, fieldWindow, fogField, rasterize, type FieldShape } from "./fogField";

const T = FEATHER.texel;
/** An axis-aligned rect as a field shape, screen px. */
const rect = (x0: number, y0: number, x1: number, y1: number, alpha: number, equiv = alpha): FieldShape => ({
  alpha,
  equiv,
  points: [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ],
});
/** A row of a field, left to right. */
const row = (f: Float32Array, cols: number, r: number) => [...f.subarray(r * cols, (r + 1) * cols)];

describe("a fog field's texels (FS-SRA9J §C.13)", () => {
  it("takes each shape's alpha at the texels whose middles it covers, nothing elsewhere", () => {
    const win = { x: 0, y: 0, cols: 4, rows: 2 };
    const { sharp, equiv } = rasterize([rect(T, 0, 3 * T, 2 * T, 0.5, 0.7)], win);
    expect(row(sharp, 4, 0)).toEqual([0, 0.5, 0.5, 0]);
    expect(row(equiv, 4, 1).map((v) => +v.toFixed(3))).toEqual([0, 0.7, 0.7, 0]);
  });

  it("lays its texels on one lattice whatever window asks, so chunks side by side agree", () => {
    const a = fieldWindow({ x: 0, y: 0, width: 510, height: 300 });
    const b = fieldWindow({ x: 510, y: 0, width: 510, height: 300 });
    expect(a.x % T).toBe(0);
    expect(b.x % T).toBe(0);
    // the first chunk's texels end where the next one's begin
    expect(a.x + a.cols * T).toBe(b.x);
  });
});

describe("the feather at a fog edge (FS-SRA9J §C.13, owner playtest 2026-11-06)", () => {
  // fog of 0.8 right of x = 40 texels, clear left of it, over a strip 100 texels wide
  const cols = 100;
  const rows = 9;
  const sharp = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 40; c < cols; c++) sharp[r * cols + c] = 0.8;
  const out = featherField(sharp, sharp, cols, rows, FEATHER.radius);
  const mid = row(out, cols, 4);

  it("never darkens what the sharp veil leaves clear, so no head or wall it keeps clear is covered", () => {
    for (let c = 0; c < 40; c++) expect(mid[c]).toBe(0);
  });

  it("is never darker than the sharp veil anywhere", () => {
    for (let i = 0; i < out.length; i++) expect(out[i]).toBeLessThanOrEqual(sharp[i] + 1e-6);
  });

  it("rises from the edge into the fog, reaching the full veil within the feather's width", () => {
    const width = FEATHER.reach;
    expect(mid[40]).toBeLessThan(0.1);
    for (let c = 41; c < 40 + width; c++) expect(mid[c]).toBeGreaterThanOrEqual(mid[c - 1]);
    expect(mid[40 + width]).toBeCloseTo(0.8, 5);
    // a ramp, not a step: somewhere well between
    expect(mid.slice(40, 40 + width).some((v) => v > 0.15 && v < 0.65)).toBe(true);
  });

  it("leaves a uniform veil as it is", () => {
    const flat = new Float32Array(cols * rows).fill(0.55);
    expect(featherField(flat, flat, cols, rows, FEATHER.radius).every((v) => Math.abs(v - 0.55) < 1e-6)).toBe(true);
  });

  it("does not feather against a wall standing in the same veil: its tint already matches the floor's", () => {
    // a wall column (clear, standing as dark as the fog round it) in the middle of the fog
    const s = new Float32Array(cols * rows).fill(0.8);
    const e = new Float32Array(cols * rows).fill(0.8);
    for (let r = 0; r < rows; r++) for (let c = 45; c < 55; c++) s[r * cols + c] = 0;
    const f = featherField(s, e, cols, rows, FEATHER.radius);
    expect(f[4 * cols + 44]).toBeCloseTo(0.8, 5);
    expect(f[4 * cols + 50]).toBe(0);
  });

  it("ramps from the lighter veil into the darker one where explored meets unexplored", () => {
    const s = new Float32Array(cols * rows);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) s[r * cols + c] = c < 40 ? 0.5 : 0.8;
    const f = row(featherField(s, s, cols, rows, FEATHER.radius), cols, 4);
    for (let c = 0; c < 40; c++) expect(f[c]).toBeCloseTo(0.5, 5);
    expect(f[40]).toBeLessThan(0.6);
    expect(f[40 + FEATHER.reach]).toBeCloseTo(0.8, 5);
  });
});

describe("a chunk's fog field (FS-SRA9J §C.13)", () => {
  it("is computed with the shapes beyond its edge, so two chunks side by side meet without a seam", () => {
    // one fog edge at x = 600, across the boundary at 512 of two chunks
    const shapes = [rect(600, -100, 2000, 1000, 0.8)];
    const left = fogField(shapes, { x: 0, y: 0, width: 512, height: 64 });
    const right = fogField(shapes, { x: 512, y: 0, width: 512, height: 64 });
    const whole = fogField(shapes, { x: 0, y: 0, width: 1024, height: 64 });
    const lc = left.window.cols;
    for (let c = 0; c < whole.window.cols; c++) {
      const v = c < lc ? left.alpha[c] : right.alpha[c - lc];
      expect(v).toBeCloseTo(whole.alpha[c], 6);
    }
  });
});
