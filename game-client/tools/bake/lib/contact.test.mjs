import { describe, it, expect } from "vitest";
import { contactPages } from "./contact.mjs";

// a creature sheet as the bake hands it to the review: 8 facings, four clips of `n` frames
const sheet = (name, w = 100, h = 100, n = 6) => ({
  name,
  frameWidth: w,
  frameHeight: h,
  directions: 8,
  animations: Object.fromEntries(["idle", "walk", "attack", "death"].map((a) => [a, { fps: 8, loop: false, frames: Array.from({ length: 8 }, () => Array(n).fill("")) }])),
});

describe("the 1x contact sheet's pages (lib/contact.mjs)", () => {
  it("keeps a cast that fits on one page", () => {
    const cast = [sheet("a"), sheet("b")];
    expect(contactPages(cast, new Map())).toEqual([cast]);
  });

  it("runs on to further pages, in order, each within the budget, rather than one image Node cannot allocate", () => {
    const cast = Array.from({ length: 9 }, (_, i) => sheet(`s${i}`));
    // one sheet's block is about 2.5k x 0.85k px at 1x: a budget of three blocks' worth
    const pages = contactPages(cast, new Map(), 3 * 2500 * 900 * 4);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flat().map((s) => s.name)).toEqual(cast.map((s) => s.name));
    for (const p of pages) expect(p.length).toBeGreaterThan(0);
  });
});
