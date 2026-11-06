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

  it("is the identity at k = 1, and refuses a size that is not a multiple of k", () => {
    const px = rgba([1, 2, 3, 4]);
    expect([...downscale(px, 1, 1, 1)]).toEqual([1, 2, 3, 4]);
    expect(() => downscale(rgba([0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), 3, 1, 2)).toThrow(/multiple/);
  });
});
