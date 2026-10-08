import { describe, it, expect } from "vitest";
import { BARROW } from "../../../../src/utils/theme";
import { DEMON_HIDE, hideTone } from "./demonTone.js";

// palette.js's mix and shade, over BARROW, without the browser-only "/theme.js" import
const rgb = (c) => {
  if (typeof c !== "string") return c;
  const n = parseInt(BARROW[c].slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a, b, t) => rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t);
const shade = (c, v) => rgb(c).map((x) => x * v);

/** HSL saturation and lightness, 0..1. */
function hsl(c) {
  const [r, g, b] = rgb(c).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

describe("the demon's hide (FS-Q14EV §B.4, guideline green-hide clause)", () => {
  const hide = hideTone(mix, shade);

  it("is less saturated than the arcane token", () => {
    expect(hsl(hide).s).toBeLessThan(hsl("arcane").s);
  });

  it("is darker than arcaneDeep", () => {
    expect(hsl(hide).l).toBeLessThan(hsl("arcaneDeep").l);
  });

  it("is still a green: green leads red and blue", () => {
    const [r, g, b] = hide;
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it("never uses the arcane token, as-is or as a blend step", () => {
    expect(DEMON_HIDE.base).not.toBe("arcane");
    for (const [token] of DEMON_HIDE.steps) expect(token).not.toBe("arcane");
  });

  it("mixes only BARROW tokens", () => {
    for (const token of [DEMON_HIDE.base, ...DEMON_HIDE.steps.map(([t]) => t)]) expect(BARROW).toHaveProperty(token);
  });
});
