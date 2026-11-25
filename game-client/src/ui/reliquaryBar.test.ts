import { describe, expect, it } from "vitest";
import { CHIP_DRAIN_MS, CHIP_HOLD_MS } from "@/render/markers/healthBar";
import { BarMotion, GAIN_FLASH_MS, StudMotion, heartbeat, lowness, studSlots } from "./reliquaryBar";

describe("BarMotion", () => {
  it("should show the first state as it is, with no chip and no glow", () => {
    const m = new BarMotion(0.6);
    expect(m.shown).toBe(0.6);
    expect(m.chip).toBe(0.6);
    expect(m.flash).toBeNull();
  });

  it("should drop at once on a loss and leave a chip that holds, then drains to the fill", () => {
    const m = new BarMotion(0.8);
    m.set(0.5);
    expect(m.shown).toBe(0.5);
    expect(m.chip).toBe(0.8);
    m.step(CHIP_HOLD_MS);
    expect(m.chip).toBe(0.8);
    m.step(CHIP_DRAIN_MS);
    expect(m.chip).toBe(0.5);
  });

  it("should rise into a gain over a moment, glowing over the run it gained, then stop", () => {
    const m = new BarMotion(0.4);
    m.set(0.7);
    expect(m.shown).toBe(0.4);
    expect(m.flash).toMatchObject({ from: 0.4, to: 0.7, alpha: 1 });
    m.step(100);
    expect(m.shown).toBeGreaterThan(0.4);
    expect(m.shown).toBeLessThan(0.7);
    m.step(GAIN_FLASH_MS);
    expect(m.shown).toBe(0.7);
    expect(m.flash).toBeNull();
    expect(m.chip).toBe(0.7);
  });

  it("should end a rise at once when a loss lands mid-rise", () => {
    const m = new BarMotion(0.4);
    m.set(0.9);
    m.step(60);
    m.set(0.3);
    expect(m.shown).toBe(0.3);
    expect(m.flash).toBeNull();
    m.step(1000);
    expect(m.shown).toBe(0.3);
  });
});

describe("StudMotion", () => {
  it("should glow only a charge just gained, and let it fade", () => {
    const s = new StudMotion([true, false, false]);
    expect(s.flash).toEqual([0, 0, 0]);
    s.set([true, true, false]);
    expect(s.flash).toEqual([0, 1, 0]);
    s.step(GAIN_FLASH_MS);
    expect(s.flash).toEqual([0, 0, 0]);
  });
});

describe("Health's beat", () => {
  it("should run low only below about a third, and fully at empty", () => {
    expect(lowness(0.5)).toBe(0);
    expect(lowness(0.35)).toBe(0);
    expect(lowness(0.1)).toBeGreaterThan(lowness(0.3));
    expect(lowness(0)).toBe(1);
  });

  it("should quicken as Health runs low", () => {
    // the beat's first bump peaks 7% into its period: 2400 ms hale, 900 ms empty
    expect(heartbeat(0.07 * 2400, 1)).toBeCloseTo(1);
    expect(heartbeat(0.07 * 900, 0)).toBeCloseTo(1);
    expect(heartbeat(0.07 * 900, 1)).toBeLessThan(1);
  });
});

describe("studSlots", () => {
  it.each([3, 5])("should set %i studs inside the channel, evenly, none overlapping", (count) => {
    const box = { x: 10, y: 0, w: 144, h: 10 };
    const slots = studSlots(box, count);
    expect(slots).toHaveLength(count);
    slots.forEach(({ cx, half }, i) => {
      expect(cx - half).toBeGreaterThanOrEqual(box.x);
      expect(cx + half).toBeLessThanOrEqual(box.x + box.w);
      if (i > 0) expect(cx - half).toBeGreaterThan(slots[i - 1].cx + slots[i - 1].half);
    });
  });
});
