import { describe, it, expect } from "vitest";
import { bodyLength, SIDE_ON } from "./length.mjs";

/** A `w`×`h` RGBA frame, clear except the given [x, y, alpha] pixels. */
function frame(w, h, ...opaque) {
  const px = Buffer.alloc(w * h * 4);
  for (const [x, y, a = 255] of opaque) px[(y * w + x) * 4 + 3] = a;
  return px;
}

describe("bodyLength (a quadruped's size measure, FS-X2F2H §H R61)", () => {
  it("measures the opaque silhouette's width, end to end, in screen px", () => {
    // snout at column 2, rump at column 8
    expect(bodyLength([frame(12, 4, [2, 1], [5, 2], [8, 3])], 12)).toBe(7);
  });

  it("takes the longest across every frame it is given (both side-on facings, every idle frame)", () => {
    const short = frame(12, 4, [4, 1], [6, 1]);
    const long = frame(12, 4, [1, 2], [10, 2]);
    expect(bodyLength([short, long, short], 12)).toBe(10);
  });

  it("ignores faint pixels: an antialiased fringe or the soft ground shadow is not the body", () => {
    const f = frame(12, 4, [0, 3, 60], [3, 1], [7, 1], [11, 3, 90]);
    expect(bodyLength([f], 12)).toBe(5);
  });

  it("ignores the ground shadow at its full half alpha, which lies along the body side-on", () => {
    const f = frame(12, 4, [3, 1], [7, 1], [1, 3, 128], [11, 3, 128]);
    expect(bodyLength([f], 12)).toBe(5);
  });

  it("has no length when nothing is opaque", () => {
    expect(bodyLength([frame(4, 4, [0, 0, 10])], 4)).toBeUndefined();
  });

  it("is taken side-on: the facings whose world axis runs along the screen", () => {
    expect(SIDE_ON).toEqual(["sw", "ne"]);
  });
});
