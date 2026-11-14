import { describe, expect, it } from "vitest";
import { CORNER_ICON_H, CORNER_ICON_W } from "./hudCornerLayout";
import { bookPicture } from "./knockoutBook";

// FS-84N1G R6 (the owner: 「幫助圖示 畫一本書的樣子」): the controls badge's picture, a closed tome with spine
// bands, one function a later pick replaces
describe("the controls badge's book (FS-84N1G R6)", () => {
  const book = bookPicture();
  const points = book.silhouette.flat();

  it("should be one solid tome with its cuts, inside its plate with room to spare", () => {
    expect(book.silhouette.length).toBeGreaterThan(0);
    expect(book.cuts.length).toBeGreaterThanOrEqual(4);
    for (const [x, y] of points) {
      expect(Math.abs(x)).toBeLessThan(CORNER_ICON_W / 2 - 8);
      expect(Math.abs(y)).toBeLessThan(CORNER_ICON_H / 2 - 4);
    }
  });

  it("should stand taller than it is wide, as a closed book upright", () => {
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(Math.max(...xs) - Math.min(...xs));
  });
});
