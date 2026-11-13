import { describe, it, expect } from "vitest";
import { BARROW } from "../../../../src/utils/theme";
import { FAMILY_BASE, VARIANT_TONES, toneOf, variantTones } from "./variantTones.js";

// palette.js's mix and shade, over BARROW, without the browser-only "/theme.js" import
const rgb = (c) => {
  if (typeof c !== "string") return c;
  const n = parseInt(BARROW[c].slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a, b, t) => rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t);
const shade = (c, v) => rgb(c).map((x) => x * v);

/** WCAG relative luminance, 0..1. */
function luminance(c) {
  const [r, g, b] = rgb(c).map((v) => {
    const x = Math.min(255, Math.max(0, v)) / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** HSL saturation, 0..1. */
function saturation(c) {
  const [r, g, b] = rgb(c).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  return max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
}

const distance = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));

/** An archetype's body tone: its family's first key, as the variant or the step-0 look paints it. */
const bodyOf = (id) => {
  const family = VARIANT_TONES[id]?.family ?? id;
  const key = Object.keys(FAMILY_BASE[family])[0];
  return toneOf(mix, shade, (VARIANT_TONES[id]?.tones ?? FAMILY_BASE[id])[key]);
};

const VARIANTS = Object.keys(VARIANT_TONES);
const recipes = [
  ...Object.values(FAMILY_BASE).flatMap((f) => Object.values(f)),
  ...Object.values(VARIANT_TONES).flatMap((v) => Object.values(v.tones)),
];

describe("the old families' recolours (FS-C8VM7 §H R45)", () => {
  it("are the eleven variants of R45", () => {
    expect(VARIANTS.sort()).toEqual(
      ["ashen_archer", "banshee", "blightborn", "blood_troll", "cave_troll", "ghast", "phantom", "plague_thrall", "ravener", "shade", "wight_archer"].sort(),
    );
  });

  it("mix only existing BARROW tokens (ADR-0013)", () => {
    for (const r of recipes) {
      expect(BARROW, r.base).toHaveProperty(r.base);
      for (const [token, t] of r.steps ?? []) {
        expect(BARROW, token).toHaveProperty(token);
        expect(t).toBeGreaterThan(0);
        expect(t).toBeLessThanOrEqual(1);
      }
      expect(r.shade ?? 1).toBeGreaterThan(0);
      expect(r.shade ?? 1).toBeLessThanOrEqual(1);
    }
  });

  it.each(VARIANTS)("%s recolours a step-0 look, one step below it in the same family", (id) => {
    const v = VARIANT_TONES[id];
    expect(FAMILY_BASE).toHaveProperty(v.family);
    expect(v.below === v.family || VARIANT_TONES[v.below]?.family === v.family, v.below).toBe(true);
    // its body's own tone is always re-painted
    expect(v.tones).toHaveProperty(Object.keys(FAMILY_BASE[v.family])[0]);
  });

  it.each(VARIANTS)("%s's body is a deeper shade than the step below it, and set apart from it", (id) => {
    const below = VARIANT_TONES[id].below;
    expect(luminance(bodyOf(id))).toBeLessThan(luminance(bodyOf(below)));
    // far enough apart in colour to tell at 1x: more than a 10% nudge of any one channel
    expect(distance(bodyOf(id), bodyOf(below))).toBeGreaterThan(25);
  });

  it("keeps the Blood Troll's hide off a heraldic red: darker and duller than oxblood", () => {
    const hide = bodyOf("blood_troll");
    expect(luminance(hide)).toBeLessThan(luminance("oxblood"));
    expect(saturation(hide)).toBeLessThan(saturation("oxblood"));
  });

  it("resolves every variant's tones to colours, and refuses an unknown one", () => {
    for (const id of VARIANTS) for (const c of Object.values(variantTones(mix, shade, id))) expect(c).toHaveLength(3);
    expect(() => variantTones(mix, shade, "goblin_king")).toThrow(/no variant/);
  });
});
