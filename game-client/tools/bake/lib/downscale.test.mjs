import { describe, it, expect } from "vitest";
import { downscale } from "./downscale.mjs";

const rgba = (...pixels) => Buffer.from(pixels.flat());

describe("downscale (a 2× frame back to 1× for screen-px measures)", () => {
  it("averages each k × k block in premultiplied alpha", () => {
    // one opaque red pixel and three clear: a quarter-alpha red, not a darkened one
    const out = downscale(rgba([255, 0, 0, 255], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), 2, 2, 2);
    expect([...out]).toEqual([255, 0, 0, 64]);
  });

  it("keeps an opaque block's colour and alpha", () => {
    const out = downscale(rgba([10, 20, 30, 255], [30, 20, 10, 255], [10, 20, 30, 255], [30, 20, 10, 255]), 2, 2, 2);
    expect([...out]).toEqual([20, 20, 20, 255]);
  });

  it("brings a 1.5x frame back to 1x as an exact area filter (§ Change: Class sheets at 1.5x R32)", () => {
    // 3 × 3 at 1.5x is 2 × 2 at 1x: each 1x px covers 1.5 × 1.5 of them, so the corner px weighs
    // 1, an edge px ½ and the middle ¼ (in ninths of 2.25: 4, 2, 2, 1), averaged in premultiplied
    // alpha, alpha over the 9 quarters. Worked by hand:
    //   (0,0) A·4 B·2 D·2 E·1: a = 2168, r = 292740, g = b = 162690 → 135, 75, 75, 241
    //   (1,0) B·2 C·4 E·1 F·2: a = 1148, r = 37740, g = 42840, b = 177990 → 33, 37, 155, 128
    //   (0,1) D·2 E·1 G·4 H·2: a = 1148, r = 78540, g = 208590, b = 78540 → 68, 182, 68, 128
    //   (1,1) E·1 F·2 H·2 I·4: a = 2168, r = 287640, g = 190740, b = 93840 → 133, 88, 43, 241
    const A = [255, 0, 0, 255];
    const B = [0, 0, 255, 255];
    const C = [0, 0, 0, 0];
    const D = [0, 255, 0, 255];
    const E = [255, 255, 255, 128];
    const F = [10, 20, 30, 255];
    const G = [0, 0, 0, 0];
    const H = [90, 90, 90, 255];
    const I = [200, 100, 0, 255];
    const out = downscale(rgba(A, B, C, D, E, F, G, H, I), 3, 3, 1.5);
    expect([...out]).toEqual([135, 75, 75, 241, 33, 37, 155, 128, 68, 182, 68, 128, 133, 88, 43, 241]);
  });

  it("refuses a 1.5x frame that is not a whole number of 1x px", () => {
    expect(() => downscale(Buffer.alloc(4 * 3 * 4), 4, 3, 1.5)).toThrow(/multiple/);
  });

  it("is the identity at k = 1, and refuses a size that is not a multiple of k", () => {
    const px = rgba([1, 2, 3, 4]);
    expect([...downscale(px, 1, 1, 1)]).toEqual([1, 2, 3, 4]);
    expect(() => downscale(rgba([0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), 3, 1, 2)).toThrow(/multiple/);
  });
});
