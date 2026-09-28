import { describe, it, expect } from "vitest";
import { crownHeight } from "./crown.mjs";

/** A `w`×`h` RGBA frame, clear except the given [x, y, alpha] pixels. */
function frame(w, h, ...opaque) {
  const px = Buffer.alloc(w * h * 4);
  for (const [x, y, a = 255] of opaque) px[(y * w + x) * 4 + 3] = a;
  return px;
}

describe("crownHeight", () => {
  it("measures from the anchor up to the top opaque row", () => {
    // anchor at row 8; the head's top pixel on row 3
    expect(crownHeight([frame(4, 10, [1, 3], [2, 7])], 4, 8)).toBe(5);
  });

  it("takes the tallest across every frame it is given (every facing, every idle frame)", () => {
    const low = frame(4, 10, [1, 5]);
    const tall = frame(4, 10, [3, 2]);
    expect(crownHeight([low, tall, low], 4, 8)).toBe(6);
  });

  it("ignores faint pixels: an antialiased fringe or a soft shadow is not the head", () => {
    const f = frame(4, 10, [0, 1, 40], [1, 4, 200]);
    expect(crownHeight([f], 4, 8)).toBe(4);
  });

  it("has no crown when nothing is opaque", () => {
    expect(crownHeight([frame(4, 10, [0, 0, 10])], 4, 8)).toBeUndefined();
  });
});
