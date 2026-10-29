import { describe, it, expect } from "vitest";
import { decodePng, encodePng } from "./png.mjs";

/** A small RGBA image with every row different, so each PNG filter gets used. */
function sample(width, height) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 37 + Math.floor(i / 7) * 11) & 0xff;
  return rgba;
}

describe("decodePng", () => {
  it.each([false, true])("reads back exactly what encodePng wrote (fast: %s)", (fast) => {
    const rgba = sample(13, 9);
    const img = decodePng(encodePng(13, 9, rgba, { fast }));
    expect(img.width).toBe(13);
    expect(img.height).toBe(9);
    expect(Buffer.compare(img.rgba, rgba)).toBe(0);
  });

  it("refuses a file that is not a PNG", () => {
    expect(() => decodePng(Buffer.from("not a png at all"))).toThrow();
  });
});
