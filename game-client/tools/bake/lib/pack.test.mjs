import { describe, it, expect } from "vitest";
import { packAtlases, MAX_SIZE } from "./pack.mjs";

const sheet = (name, group, w, h, n) => ({ name, group, frameWidth: w, frameHeight: h, frameCount: n });

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("packAtlases", () => {
  it("packs each group onto its own page, never overlapping, within the page", () => {
    const sheets = [
      sheet("tree", "nature", 200, 230, 2),
      sheet("rock", "nature", 110, 70, 3),
      sheet("door", "props", 130, 140, 3),
    ];
    const pages = packAtlases(sheets);
    expect(pages.map((p) => p.key)).toEqual(["nature-0", "props-0"]);
    for (const p of pages) {
      const rects = Object.entries(p.placements).flatMap(([name, spots]) => {
        const s = sheets.find((x) => x.name === name);
        return spots.map((o) => ({ ...o, w: s.frameWidth, h: s.frameHeight }));
      });
      for (const r of rects) {
        expect(r.x + r.w).toBeLessThanOrEqual(p.width);
        expect(r.y + r.h).toBeLessThanOrEqual(p.height);
      }
      rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)));
    }
  });

  it("is deterministic: the same catalogue packs identically", () => {
    const sheets = [sheet("a", "g", 50, 60, 4), sheet("b", "g", 50, 60, 1), sheet("c", "g", 70, 20, 2)];
    expect(packAtlases(sheets)).toEqual(packAtlases([...sheets].reverse()));
  });

  it("spills onto a second page rather than exceed the size limit", () => {
    const sheets = Array.from({ length: 12 }, (_, i) => sheet(`s${i}`, "g", 1000, 1000, 2));
    const pages = packAtlases(sheets);
    expect(pages.length).toBeGreaterThan(1);
    for (const p of pages) {
      expect(p.width).toBeLessThanOrEqual(MAX_SIZE);
      expect(p.height).toBeLessThanOrEqual(MAX_SIZE);
    }
  });
});
