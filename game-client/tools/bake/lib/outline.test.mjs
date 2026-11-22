// The outline figure (FS-1J1CB §Change: Looks v2 R51): two looks' opaque masks laid on one anchor,
// XORed over their union, summed over the facings; and the bake's figures for each look against
// its base and its sibling.

import { describe, it, expect } from "vitest";
import { OUTLINE_FACINGS, opaqueMask, outlineFigure, outlineFigures } from "./outline.mjs";

/** A mask from rows of "#" (opaque) and "." (clear), anchored at (ax, ay). */
const grid = (rows, ax = 0, ay = 0) => ({
  w: rows[0].length,
  h: rows.length,
  ax,
  ay,
  mask: Uint8Array.from(rows.join("").split(""), (c) => (c === "#" ? 1 : 0)),
});

/** Straight RGBA for a mask, every opaque px at `alpha`. */
const rgbaOf = (m, alpha = 255) => {
  const px = Buffer.alloc(m.w * m.h * 4);
  m.mask.forEach((v, i) => (px[i * 4 + 3] = v ? alpha : 0));
  return px;
};

describe("opaqueMask", () => {
  it("counts a px opaque from half alpha up, as a black fill shows it", () => {
    const px = Buffer.alloc(3 * 4);
    [0, 127, 128].forEach((a, i) => (px[i * 4 + 3] = a));
    expect([...opaqueMask(px, 3, 1)]).toEqual([0, 0, 1]);
  });
});

describe("outlineFigure (R51)", () => {
  it("gives 0 for two identical masks", () => {
    const a = grid([".#.", "###", ".#."], 1, 2);
    expect(outlineFigure([[a, a]])).toBe(0);
  });

  it("gives 1 for two disjoint masks", () => {
    expect(outlineFigure([[grid(["##..", "##.."]), grid(["..##", "..##"])]])).toBe(1);
  });

  it("lays the two on one anchor before it compares them", () => {
    // the same figure, cut into frames of different sizes with the anchor under its feet
    const a = grid(["#.", "#."], 0, 2);
    const b = grid(["...", ".#.", ".#."], 1, 3);
    expect(outlineFigure([[a, b]])).toBe(0);
  });

  it("sums the differing px over the union across every pair (hand-computed)", () => {
    // pair 1 on one anchor: a covers 3 px, b 4, sharing 2 ((1,0) and (0,1)) → xor 3, union 5
    const a1 = grid(["##.", "#.."]);
    const b1 = grid([".#.", "###"]);
    // pair 2: b2 one row lower on the anchor than a2, so they share nothing: xor 2, union 2
    const a2 = grid(["#", "."], 0, 1);
    const b2 = grid(["#", "."], 0, 0);
    expect(outlineFigure([[a1, b1]])).toBeCloseTo(3 / 5, 10);
    expect(outlineFigure([[a2, b2]])).toBe(1);
    expect(outlineFigure([[a1, b1], [a2, b2]])).toBeCloseTo((3 + 2) / (5 + 2), 10);
  });

  it("is 0 when neither mask has a px", () => {
    expect(outlineFigure([[grid([".."]), grid([".."])]])).toBe(0);
  });
});

describe("outlineFigures: each look against its base and its sibling", () => {
  const facings = ["s", "sw", "w", "nw", "n", "ne", "e", "se"];
  /** A baked sheet (straight RGBA frames as base64) whose idle shows `m` in every facing. */
  const sheet = (name, m, scale = 1) => ({
    name,
    scale,
    frameWidth: m.w,
    frameHeight: m.h,
    anchor: { x: m.ax / m.w, y: m.ay / m.h },
    animations: { idle: { frames: facings.map(() => [rgbaOf(m).toString("base64")]) } },
  });

  it("measures over the n, e, s and w idles", () => {
    expect(OUTLINE_FACINGS).toEqual(["n", "e", "s", "w"]);
  });

  it("gives each look's figure against the base and against the other look", () => {
    const base = sheet("char_knight_base", grid(["##", "##"], 1, 2));
    const same = sheet("char_knight_guardian", grid(["##", "##"], 1, 2));
    const other = sheet("char_knight_berserker", grid(["##..", "##.."], 3, 2));
    const out = outlineFigures({ base, looks: [same, other] }, facings);
    expect(out).toEqual([
      { sheet: "char_knight_guardian", base: 0, siblings: [{ sheet: "char_knight_berserker", figure: 1 }] },
      { sheet: "char_knight_berserker", base: 1, siblings: [{ sheet: "char_knight_guardian", figure: 1 }] },
    ]);
  });

  it("brings a 1.5x sheet back to game scale before it compares", () => {
    // 3×3 at 1.5x is 2×2 at 1x; fully opaque stays fully opaque
    const big = sheet("char_knight_guardian", grid(["###", "###", "###"], 0, 0), 1.5);
    const small = sheet("char_knight_base", grid(["##", "##"], 0, 0));
    expect(outlineFigures({ base: small, looks: [big] }, facings)[0].base).toBe(0);
  });
});
