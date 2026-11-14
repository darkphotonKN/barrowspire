import { describe, expect, it } from "vitest";
import { CORNER_ICON_H, CORNER_ICON_W } from "./hudCornerLayout";
import { BOOK, drawBookLines } from "./knockoutBook";

// FS-84N1G R6 (the owner: 「幫助圖示 畫一本書的樣子」, and his pick of the previews, 「Ｄ」): the controls badge's
// picture, a closed book with a title band, the page block and a ribbon, and its line glyph
describe("the controls badge's book (FS-84N1G R6)", () => {
  const book = BOOK;
  const points = book.silhouette.flat();

  it("should be the book and its ribbon's tail, solid, with their cuts, inside the plate", () => {
    expect(book.silhouette.length).toBeGreaterThan(0);
    expect(book.silhouette).toHaveLength(2);
    expect(book.cuts.length).toBe(4);
    for (const [x, y] of points) {
      expect(Math.abs(x)).toBeLessThan(CORNER_ICON_W / 2 - 8);
      expect(Math.abs(y)).toBeLessThan(CORNER_ICON_H / 2);
    }
  });

  it("should stand taller than it is wide, as a closed book upright", () => {
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(Math.max(...xs) - Math.min(...xs));
  });
});

describe("the book's line glyph (ADR-0080 fallback)", () => {
  it("should stroke the book in the row's 2.25 px line, in the ink handed, filling nothing", () => {
    const calls: string[] = [];
    const g = new Proxy({}, { get: (_t, prop) => (...args: unknown[]) => void calls.push(prop === "lineStyle" ? `lineStyle ${args.join(",")}` : String(prop)) });
    drawBookLines(g as never, 100, 50, 0xabcdef, 0.85);
    expect(calls[0]).toBe(`lineStyle 2.25,${0xabcdef},0.85`);
    expect(calls.filter((c) => c === "strokePath")).toHaveLength(5);
    expect(calls.some((c) => /^fill/.test(c))).toBe(false);
  });
});
