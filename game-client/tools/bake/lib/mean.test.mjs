import { describe, it, expect } from "vitest";
import { meanColour } from "./mean.mjs";

/** RGBA pixels as one frame buffer. */
const frame = (...px) => Buffer.from(px.flat());

describe("meanColour", () => {
  it("averages the pixels of every frame, in sRGB", () => {
    expect(meanColour([frame([10, 20, 30, 255], [30, 40, 50, 255]), frame([20, 30, 40, 255])])).toEqual({
      r: 20,
      g: 30,
      b: 40,
    });
  });

  it("ignores transparent pixels and weights the rest by their alpha", () => {
    // a tile's clear corners must not darken its mean; a half-covered edge pixel counts half
    const f = frame([0, 0, 0, 0], [100, 100, 100, 255], [250, 250, 250, 0], [40, 40, 40, 255]);
    expect(meanColour([f])).toEqual({ r: 70, g: 70, b: 70 });
    const edge = frame([90, 90, 90, 255], [0, 0, 0, 128]);
    expect(meanColour([edge]).r).toBe(Math.round((90 * 255) / (255 + 128)));
  });

  it("rounds to whole channel values", () => {
    expect(meanColour([frame([1, 2, 3, 255], [2, 3, 5, 255])])).toEqual({ r: 2, g: 3, b: 4 });
  });

  it("has no mean for a fully transparent sheet", () => {
    expect(meanColour([frame([9, 9, 9, 0])])).toBeUndefined();
  });
});
