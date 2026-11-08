import { describe, it, expect } from "vitest";
import { BARROW } from "../../../../src/utils/theme";
import { DEMON_BLOOD_HIDE, DEMON_HIDE, hideTone } from "./demonTone.js";

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

/** WCAG relative luminance, 0..1. */
function luminance(c) {
  const [r, g, b] = rgb(c).map((v) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two colours. */
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

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

describe("the blood demon's hide (FS-VHGE7 §E R36, guideline blood-hide clause)", () => {
  const hide = hideTone(mix, shade, DEMON_BLOOD_HIDE);

  it("is mixed from oxblood toward charcoal and umber, never oxblood as-is", () => {
    expect(DEMON_BLOOD_HIDE.base).toBe("oxblood");
    const toward = Object.fromEntries(DEMON_BLOOD_HIDE.steps);
    expect(toward.charcoal).toBeGreaterThan(0);
    expect(toward.umber).toBeGreaterThan(0);
  });

  it("is never more saturated than oxblood", () => {
    expect(hsl(hide).s).toBeLessThan(hsl("oxblood").s);
  });

  it("is always darker than oxblood, so it never sits at a player's red's value", () => {
    expect(hsl(hide).l).toBeLessThan(hsl("oxblood").l);
    // the knight's cloak and shield take oxblood as-is: the hide stays clearly below it
    expect(luminance(hide)).toBeLessThan(0.8 * luminance("oxblood"));
  });

  it("is still a red, pulled toward brown-black rather than toward magenta", () => {
    const [r, g, b] = hide;
    expect(r).toBeGreaterThan(2 * g);
    expect(r).toBeGreaterThan(2 * b);
    expect(g).toBeGreaterThanOrEqual(b);
  });

  it("lets the ember emissives lift off it by value at least as far as off the green hide", () => {
    expect(contrast("ember", hide)).toBeGreaterThanOrEqual(contrast("ember", hideTone(mix, shade)));
  });

  it("mixes only BARROW tokens", () => {
    for (const token of [DEMON_BLOOD_HIDE.base, ...DEMON_BLOOD_HIDE.steps.map(([t]) => t)]) expect(BARROW).toHaveProperty(token);
  });
});
