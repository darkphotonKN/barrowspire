import { describe, expect, it } from "vitest";
import { palette } from "@/utils/canvasPalette";
import { contrastRatio } from "@/render/lighting/lighting";
import {
  CHIP_DRAIN_MS,
  CHIP_HOLD_MS,
  DamageChip,
  barSpans,
  healthBarKey,
  onBackingGrid,
  paintHealthBar,
} from "./healthBar";
import { MARKER_BAR } from "./markers";

// FS-48CTQ §F (owner, playtest 2026-11-07): one HP bar look for every monster bar, overhead and
// in the target frame: no rim, a deep-red trough, a shaded fill with a highlight line, and the
// damage chip (owner, playtest 2026-11-07: "沒有筐 底色有比較深的紅色"). Crisp at render scales 1,
// 1.5 and 2 (ADR-0056/0057).

interface Fill {
  colour: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

function painter() {
  let colour = 0;
  const fills: Fill[] = [];
  return {
    fills,
    fillStyle(c: number) {
      colour = c;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      fills.push({ colour, x, y, w, h });
    },
  };
}

const onGrid = (v: number, scale: number) =>
  Math.abs(v * scale - Math.round(v * scale)) < 1e-9;

const box = { x: 10.3, y: 20.7, width: 40, height: 5 };

describe("paintHealthBar (FS-48CTQ §F.21)", () => {
  it.each([1, 1.25, 1.5, 2])(
    "should put every edge on a whole backing px at render scale %s, wherever the box falls",
    (scale) => {
      const g = painter();
      paintHealthBar(g, box, 0.37, 0.61, scale);
      expect(g.fills.length).toBeGreaterThan(0);
      for (const f of g.fills)
        for (const v of [f.x, f.y, f.x + f.w, f.y + f.h]) expect(onGrid(v, scale)).toBe(true);
    },
  );

  it("should draw the deep-red trough first, the whole box, then the fill over it", () => {
    const g = painter();
    paintHealthBar(g, { x: 0, y: 0, width: 40, height: 5 }, 0.5, 0.5, 1);
    const trough = g.fills.find((f) => f.colour === MARKER_BAR.trough)!;
    const hp = g.fills.find((f) => f.colour === MARKER_BAR.hp)!;
    expect(g.fills[0]).toBe(trough);
    expect(trough).toMatchObject({ x: 0, y: 0, w: 40, h: 5 });
    expect(hp).toMatchObject({ x: 0, y: 0, w: 20, h: 5 });
    expect(g.fills.indexOf(trough)).toBeLessThan(g.fills.indexOf(hp));
  });

  it.each([1, 1.5, 2])("should draw no rim: nothing outside the box at render scale %s", (scale) => {
    const g = painter();
    paintHealthBar(g, box, 0.37, 0.61, scale);
    // the box in whole backing px, as the painter measures it
    const x = onBackingGrid(box.x, scale);
    const y = onBackingGrid(box.y, scale);
    const w = Math.round(box.width * scale) / scale;
    const h = Math.round(box.height * scale) / scale;
    const trough = g.fills[0];
    expect(trough).toMatchObject({ colour: MARKER_BAR.trough });
    expect([trough.x, trough.y, trough.w, trough.h].map((v) => v * scale)).toEqual(
      [x, y, w, h].map((v) => expect.closeTo(v * scale, 9)),
    );
    const eps = 1e-9;
    for (const f of g.fills) {
      expect(f.x).toBeGreaterThanOrEqual(x - eps);
      expect(f.y).toBeGreaterThanOrEqual(y - eps);
      expect(f.x + f.w).toBeLessThanOrEqual(x + w + eps);
      expect(f.y + f.h).toBeLessThanOrEqual(y + h + eps);
    }
  });

  it("should shade the fill: a thin highlight line along its top and a darker band along its foot", () => {
    const g = painter();
    paintHealthBar(g, { x: 0, y: 0, width: 40, height: 5 }, 0.5, 0.5, 1);
    const light = g.fills.find((f) => f.colour === MARKER_BAR.light)!;
    const shade = g.fills.find((f) => f.colour === MARKER_BAR.shade && f.h > 0 && f.w > 1)!;
    expect(light).toMatchObject({ x: 0, y: 0, w: 20, h: 1 });
    expect(shade).toMatchObject({ x: 0, y: 4, w: 20, h: 1 });
  });

  it("should keep the highlight line one logical px thick at any render scale", () => {
    for (const scale of [1, 2]) {
      const g = painter();
      paintHealthBar(g, { x: 0, y: 0, width: 40, height: 5 }, 1, 1, scale);
      expect(g.fills.find((f) => f.colour === MARKER_BAR.light)!.h).toBe(1);
    }
  });

  it("should end the fill on a crisp cap where the bar is not full, and draw none when it is", () => {
    const part = painter();
    paintHealthBar(part, { x: 0, y: 0, width: 40, height: 5 }, 0.5, 0.5, 1);
    expect(part.fills.some((f) => f.colour === MARKER_BAR.shade && f.x === 19 && f.w === 1 && f.h === 5)).toBe(true);
    const full = painter();
    paintHealthBar(full, { x: 0, y: 0, width: 40, height: 5 }, 1, 1, 1);
    expect(full.fills.some((f) => f.colour === MARKER_BAR.shade && f.h === 5)).toBe(false);
  });

  it("should draw the damage chip from the fill's end to the health it had, in the chip's lighter tone", () => {
    const g = painter();
    paintHealthBar(g, { x: 0, y: 0, width: 40, height: 5 }, 0.25, 0.75, 1);
    const chip = g.fills.find((f) => f.colour === MARKER_BAR.chip)!;
    expect(chip).toMatchObject({ x: 10, y: 0, w: 20, h: 5 });
  });

  it("should draw no fill and no chip on an empty bar, only the trough", () => {
    const g = painter();
    paintHealthBar(g, { x: 0, y: 0, width: 40, height: 5 }, 0, 0, 1);
    expect(g.fills.map((f) => f.colour)).toEqual([MARKER_BAR.trough]);
  });
});

describe("the bar's redraw key (FS-48CTQ §F.23)", () => {
  const bar = { width: 40, height: 5 };

  it("should not change for a health change too small to move a backing px", () => {
    expect(healthBarKey(bar, 0.5, 0.5, 1)).toBe(healthBarKey(bar, 0.501, 0.501, 1));
  });

  it("should change when the fill, the chip or the render scale moves a backing px", () => {
    const at = healthBarKey(bar, 0.5, 0.5, 1);
    expect(healthBarKey(bar, 0.45, 0.45, 1)).not.toBe(at);
    expect(healthBarKey(bar, 0.5, 0.6, 1)).not.toBe(at);
    expect(healthBarKey(bar, 0.5, 0.5, 2)).not.toBe(at);
  });

  it("should measure the spans in whole backing px, the chip never short of the fill", () => {
    expect(barSpans(40, 0.3, 0.2, 1.5)).toEqual({ fill: 18, chip: 18 });
    expect(barSpans(40, 0.3, 0.9, 1.5)).toEqual({ fill: 18, chip: 54 });
  });

  it("should snap a logical position to the backing grid", () => {
    expect(onBackingGrid(10.3, 1)).toBe(10);
    expect(onBackingGrid(10.3, 1.5)).toBe(10);
    expect(onBackingGrid(10.4, 1.5)).toBeCloseTo(10 + 2 / 3, 9);
    expect(onBackingGrid(10.3, 2)).toBe(10.5);
  });
});

describe("DamageChip (FS-48CTQ §F.22)", () => {
  it("should start with no chip", () => {
    const chip = new DamageChip(0.8);
    expect([chip.fill, chip.chip, chip.draining]).toEqual([0.8, 0.8, false]);
  });

  it("should hold the health lost for a moment, then drain it to the new health and stop", () => {
    const chip = new DamageChip(1);
    chip.set(0.6, true);
    expect([chip.fill, chip.chip, chip.draining]).toEqual([0.6, 1, true]);
    chip.step(CHIP_HOLD_MS);
    expect(chip.chip).toBe(1);
    chip.step(CHIP_DRAIN_MS / 2);
    expect(chip.chip).toBeLessThan(1);
    expect(chip.chip).toBeGreaterThan(0.6);
    chip.step(CHIP_DRAIN_MS / 2);
    expect([chip.chip, chip.draining]).toEqual([0.6, false]);
  });

  it("should drain only ever downward, never past the fill", () => {
    const chip = new DamageChip(1);
    chip.set(0.2, true);
    let last = chip.chip;
    for (let t = 0; t < CHIP_HOLD_MS + CHIP_DRAIN_MS + 100; t += 16) {
      chip.step(16);
      expect(chip.chip).toBeLessThanOrEqual(last);
      expect(chip.chip).toBeGreaterThanOrEqual(0.2);
      last = chip.chip;
    }
    expect(chip.draining).toBe(false);
  });

  it("should keep the chip where it is and hold again on a second hit mid-drain", () => {
    const chip = new DamageChip(1);
    chip.set(0.6, true);
    chip.step(CHIP_HOLD_MS + CHIP_DRAIN_MS / 2);
    const mid = chip.chip;
    chip.set(0.4, true);
    expect(chip.chip).toBe(mid);
    chip.step(CHIP_HOLD_MS);
    expect(chip.chip).toBe(mid);
    chip.step(CHIP_DRAIN_MS);
    expect([chip.chip, chip.draining]).toEqual([0.4, false]);
  });

  it("should snap with no chip when the hit is not to be chipped", () => {
    const chip = new DamageChip(1);
    chip.set(0.5, false);
    expect([chip.chip, chip.draining]).toEqual([0.5, false]);
  });

  it("should end the chip when health rises past it, and keep draining when it rises short of it", () => {
    const past = new DamageChip(1);
    past.set(0.5, true);
    past.step(CHIP_HOLD_MS + CHIP_DRAIN_MS / 2);
    past.set(0.95, true);
    expect([past.fill, past.chip, past.draining]).toEqual([0.95, 0.95, false]);
    const short = new DamageChip(1);
    short.set(0.5, true);
    short.set(0.7, true);
    expect([short.fill, short.chip, short.draining]).toEqual([0.7, 1, true]);
  });

  it("should drop the chip on clear", () => {
    const chip = new DamageChip(1);
    chip.set(0.5, true);
    chip.clear();
    expect([chip.chip, chip.draining]).toEqual([0.5, false]);
  });
});

describe("the bar's tones (FS-48CTQ §F.21, ADR-0013)", () => {
  it("should be palette tokens", () => {
    expect(MARKER_BAR).toMatchObject({
      trough: palette.markerHpTrough,
      light: palette.markerHpLight,
      shade: palette.markerHpShade,
      chip: palette.markerHpChip,
    });
  });

  it("should set the chip apart from the fill and the trough", () => {
    expect(contrastRatio(MARKER_BAR.chip, MARKER_BAR.trough)).toBeGreaterThan(
      contrastRatio(MARKER_BAR.hp, MARKER_BAR.trough),
    );
    expect(contrastRatio(MARKER_BAR.chip, MARKER_BAR.hp)).toBeGreaterThanOrEqual(1.5);
  });

  it("should have no rim tone", () => {
    expect(MARKER_BAR).not.toHaveProperty("frame");
    expect(palette).not.toHaveProperty("markerBarFrame");
  });

  it("should lay the trough in a deep red, not near-black, the fill at 3:1 over it", () => {
    const t = MARKER_BAR.trough;
    const [r, g, b] = [(t >> 16) & 0xff, (t >> 8) & 0xff, t & 0xff];
    expect(r).toBeGreaterThan(2 * Math.max(g, b));
    expect(contrastRatio(t, palette.markerBarBacking)).toBeGreaterThanOrEqual(1.3);
    expect(contrastRatio(MARKER_BAR.hp, t)).toBeGreaterThanOrEqual(3);
  });

  it("should keep the fill's end cap reading against the trough with no rim", () => {
    expect(contrastRatio(MARKER_BAR.shade, MARKER_BAR.trough)).toBeGreaterThanOrEqual(1.5);
  });
});
