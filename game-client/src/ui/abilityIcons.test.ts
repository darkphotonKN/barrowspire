import { describe, expect, it } from "vitest";
import { GLYPH_LINE_W } from "./MailboxEnvelope";
import type { Pt } from "./knockout";
import { ABILITY_ICONS, ABILITY_ICON_KEYS, ABILITY_ICON_SLOT, drawAbilityIconLines, type AbilityIconPen } from "./abilityIcons";

// FS-Q18Q3 §C R16–R17: the ability bar's ten bronze knockout pictures, each with its line-glyph
// fallback, in one module for the bar and the passive tree's tier-3 node (FS-8RZ51). I-Q18Q3-3.

const TEN = [
  "dash",
  "triple_fireball",
  "shadow_shot",
  "parry",
  "earthbreaker",
  "blink",
  "arrow_rain",
  "settle_the_debt",
  "potion",
  "locked",
];

const HALF = ABILITY_ICON_SLOT / 2;
const inSlot = ([x, y]: Pt) => Math.abs(x) <= HALF && Math.abs(y) <= HALF;

/** A recording pen: lines only, as the fallback's graphics. */
function pen() {
  const calls: { m: string; args: number[] }[] = [];
  const rec =
    (m: string) =>
    (...args: number[]) => {
      calls.push({ m, args });
      return g;
    };
  const g = {
    lineStyle: rec("lineStyle"),
    beginPath: rec("beginPath"),
    moveTo: rec("moveTo"),
    lineTo: rec("lineTo"),
    closePath: rec("closePath"),
    strokePath: rec("strokePath"),
    strokeCircle: rec("strokeCircle"),
  };
  return { g: g as unknown as AbilityIconPen, calls };
}

describe("abilityIcons (FS-Q18Q3 R16: one picture per ability)", () => {
  it("should key the ten pictures by ability, and potion and locked", () => {
    expect([...ABILITY_ICON_KEYS].sort()).toEqual([...TEN].sort());
    expect(Object.keys(ABILITY_ICONS).sort()).toEqual([...TEN].sort());
  });

  it("should draw the icon at about 30 px, in a 44 px well", () => {
    expect(ABILITY_ICON_SLOT).toBe(30);
  });

  it.each(TEN)("should give %s a silhouette and its points, cuts and holes inside the 30 px slot", (key) => {
    const { picture } = ABILITY_ICONS[key as keyof typeof ABILITY_ICONS];
    expect(picture.silhouette.length).toBeGreaterThan(0);
    for (const shape of picture.silhouette) {
      expect(shape.length, `${key}: a closed shape has at least three points`).toBeGreaterThanOrEqual(3);
      for (const p of shape) expect(inSlot(p), `${key} silhouette point ${p}`).toBe(true);
    }
    for (const cut of picture.cuts) {
      if ("ring" in cut) {
        const { x, y, r } = cut.ring;
        expect(Math.abs(x) + r <= HALF && Math.abs(y) + r <= HALF, `${key} ring`).toBe(true);
      } else {
        expect(cut.path.length, `${key}: a cut runs through two points at least`).toBeGreaterThanOrEqual(2);
        for (const p of cut.path) expect(inSlot(p), `${key} cut point ${p}`).toBe(true);
      }
    }
    for (const { x, y, r } of picture.holes ?? []) {
      expect(Math.abs(x) + r <= HALF && Math.abs(y) + r <= HALF, `${key} hole`).toBe(true);
    }
  });

  it.each(TEN)("should give %s every point a finite number", (key) => {
    const { picture, lines } = ABILITY_ICONS[key as keyof typeof ABILITY_ICONS];
    const all = [
      ...picture.silhouette.flat(),
      ...picture.cuts.flatMap((c) => ("ring" in c ? [] : c.path)),
      ...lines.flatMap((c) => ("ring" in c ? [] : c.path)),
    ];
    for (const [x, y] of all) expect(Number.isFinite(x) && Number.isFinite(y), key).toBe(true);
  });
});

describe("abilityIcons (ADR-0080 fallback: a line glyph where no texture can be made)", () => {
  it.each(TEN)("should give %s a non-empty line glyph inside the slot", (key) => {
    const { lines } = ABILITY_ICONS[key as keyof typeof ABILITY_ICONS];
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      if ("ring" in line) expect(line.ring.r).toBeGreaterThan(0);
      else {
        expect(line.path.length).toBeGreaterThanOrEqual(2);
        for (const p of line.path) expect(inSlot(p), `${key} line point ${p}`).toBe(true);
      }
    }
  });

  it.each(TEN)("should stroke %s's glyph in the row's line width about the slot's centre, in its ink, filling nothing", (key) => {
    const { g, calls } = pen();
    drawAbilityIconLines(g, key as keyof typeof ABILITY_ICONS, 100, 50, 7, 0.85);
    expect(calls[0]).toEqual({ m: "lineStyle", args: [GLYPH_LINE_W, 7, 0.85] });
    const strokes = calls.filter((c) => c.m === "strokePath" || c.m === "strokeCircle");
    expect(strokes.length).toBe(ABILITY_ICONS[key as keyof typeof ABILITY_ICONS].lines.length);
    // every point drawn sits in the slot about (100, 50)
    for (const c of calls.filter((c) => c.m === "moveTo" || c.m === "lineTo" || c.m === "strokeCircle")) {
      expect(Math.abs(c.args[0] - 100)).toBeLessThanOrEqual(HALF);
      expect(Math.abs(c.args[1] - 50)).toBeLessThanOrEqual(HALF);
    }
    expect(calls.some((c) => c.m.startsWith("fill"))).toBe(false);
  });
});
