import { describe, expect, it } from "vitest";
import { CORNER_ICON_H, CORNER_ICON_W } from "./hudCornerLayout";
import { BOOK } from "./knockoutBook";
import { CLASPED_BOOK, drawClaspedBookLines } from "./knockoutClaspedBook";
import { CUT_W } from "./knockout";

// FS-X2CMM §G R36 (I-X2CMM-10): the corner row's Book icon, a closed book shut by a strap and stud with a
// ribbon out of its head, distinct from the controls badge's book, and its line glyph.

describe("the corner row's clasped book (FS-X2CMM R36)", () => {
  const points = CLASPED_BOOK.silhouette.flat();

  it("should be the cover, the strap's tab and the ribbon, solid, with the spine, the strap and the ribbon's exit cut and the stud a hole, inside the plate", () => {
    expect(CLASPED_BOOK.silhouette).toHaveLength(3);
    expect(CLASPED_BOOK.cuts).toHaveLength(4);
    expect(CLASPED_BOOK.holes).toHaveLength(1);
    for (const [x, y] of points) {
      expect(Math.abs(x)).toBeLessThan(CORNER_ICON_W / 2 - 8);
      expect(Math.abs(y)).toBeLessThan(CORNER_ICON_H / 2);
    }
  });

  it("should keep stone either side of the stud's hole, in the strap between its two cuts", () => {
    const [top, foot] = [CLASPED_BOOK.cuts[1], CLASPED_BOOK.cuts[2]].map((c) => ("path" in c ? c.path[0][1] : NaN));
    const stud = CLASPED_BOOK.holes![0];
    expect(stud.y - stud.r - top - CUT_W / 2).toBeGreaterThanOrEqual(1.5);
    expect(foot - (stud.y + stud.r) - CUT_W / 2).toBeGreaterThanOrEqual(1.5);
  });

  it("should not be the controls badge's book: its ribbon rises out of the head, not the foot", () => {
    expect(CLASPED_BOOK).not.toEqual(BOOK);
    const tail = CLASPED_BOOK.silhouette[2];
    const cover = CLASPED_BOOK.silhouette[0];
    expect(Math.min(...tail.map(([, y]) => y))).toBeLessThan(Math.min(...cover.map(([, y]) => y)));
  });
});

describe("the clasped book's line glyph (ADR-0080 fallback)", () => {
  it("should stroke the book in the row's 2.25 px line, in the ink handed, filling nothing", () => {
    const calls: string[] = [];
    const g = new Proxy({}, { get: (_t, prop) => (...args: unknown[]) => void calls.push(prop === "lineStyle" ? `lineStyle ${args.join(",")}` : String(prop)) });
    drawClaspedBookLines(g as never, 100, 50, 0xabcdef, 0.85);
    expect(calls[0]).toBe(`lineStyle 2.25,${0xabcdef},0.85`);
    expect(calls.filter((c) => c === "strokePath")).toHaveLength(4);
    expect(calls).toContain("strokeCircle");
    expect(calls.some((c) => /^fill/.test(c))).toBe(false);
  });
});
