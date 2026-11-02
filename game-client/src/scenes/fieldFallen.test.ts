import { describe, expect, it } from "vitest";
import { countdownBarRect } from "@/ui/countdownBar";
import type { Rect } from "@/ui/partyPanelLayout";
import {
  FALLEN_LINE,
  FIELD_RISE_MS,
  FallenCountdown,
  fallenFrame,
  isFallen,
} from "./fieldFallen";

describe("FallenCountdown (FS-X2F2H §Requirements 23, 58)", () => {
  it("should count 3-2-1 from the state that reported the fall", () => {
    const countdown = new FallenCountdown();

    expect(countdown.observe(true, 1000)).toBe("fell");
    expect(countdown.count(1000)).toBe(3);
    expect(countdown.count(1999)).toBe(3);
    expect(countdown.count(2000)).toBe(2);
    expect(countdown.count(3500)).toBe(1);
  });

  it("should hold at 1 if the rise is late, never 0 or below", () => {
    const countdown = new FallenCountdown();
    countdown.observe(true, 0);

    expect(countdown.count(FIELD_RISE_MS + 900)).toBe(1);
  });

  it("should report the fall once and the rise once, and count nothing while standing", () => {
    const countdown = new FallenCountdown();

    expect(countdown.observe(false, 0)).toBeUndefined();
    expect(countdown.count(0)).toBeUndefined();
    expect(countdown.isDown()).toBe(false);
    expect(countdown.observe(true, 10)).toBe("fell");
    expect(countdown.isDown()).toBe(true);
    expect(countdown.observe(true, 500)).toBeUndefined();
    expect(countdown.count(500)).toBe(3);
    expect(countdown.observe(false, 3010)).toBe("rose");
    expect(countdown.observe(false, 3100)).toBeUndefined();
    expect(countdown.count(3100)).toBeUndefined();
  });

  it("should start a fresh count on the next fall", () => {
    const countdown = new FallenCountdown();
    countdown.observe(true, 0);
    countdown.observe(false, 3000);

    countdown.observe(true, 10_000);

    expect(countdown.count(10_000)).toBe(3);
  });

  it("should forget a fall on reset", () => {
    const countdown = new FallenCountdown();
    countdown.observe(true, 0);

    countdown.reset();

    expect(countdown.count(0)).toBeUndefined();
    expect(countdown.observe(true, 5)).toBe("fell");
  });
});

describe("isFallen", () => {
  it("should read a player at 0 HP as fallen, and one with no health reported as standing", () => {
    expect(isFallen({ current_health: 0 })).toBe(true);
    expect(isFallen({ current_health: 12 })).toBe(false);
    expect(isFallen({})).toBe(false);
    expect(isFallen(undefined)).toBe(false);
  });
});

describe("FALLEN_LINE (FS-X2F2H §Requirements 58, FS-B3NDZ R12)", () => {
  it("should say where they rise, the number left to the shared countdown, with no loss copy", () => {
    expect(FALLEN_LINE).toBe("You have fallen. You rise at the road home.");
    expect(FALLEN_LINE).not.toMatch(/\d/);
    expect(FALLEN_LINE).not.toMatch(/lost|defeat|died|result|game over/i);
  });
});

// FS-B3NDZ §Requirements 6, 12. I-B3NDZ-2: the fallen wait as the shared countdown bar.
describe("FallenCountdown.fraction (FS-B3NDZ R6: over the rise's own wait)", () => {
  it("should run 1 at the fall down to 0 at the rise, and hold at 0 if it is late", () => {
    const countdown = new FallenCountdown();
    countdown.observe(true, 1000);

    expect(countdown.fraction(1000)).toBe(1);
    expect(countdown.fraction(1000 + FIELD_RISE_MS / 2)).toBe(0.5);
    expect(countdown.fraction(1000 + FIELD_RISE_MS)).toBe(0);
    expect(countdown.fraction(1000 + FIELD_RISE_MS + 900)).toBe(0);
  });

  it("should answer nothing while standing", () => {
    const countdown = new FallenCountdown();
    expect(countdown.fraction(0)).toBeUndefined();
    countdown.observe(true, 0);
    countdown.observe(false, 3000);
    expect(countdown.fraction(3000)).toBeUndefined();
  });
});

describe("fallenFrame (FS-B3NDZ R1, R9, R12: the fallen panel and its bar)", () => {
  const inside = (inner: Rect, outer: Rect) =>
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height;

  it("should centre the panel on the canvas", () => {
    const f = fallenFrame(1080, 720);
    expect(f.panel.x + f.panel.width / 2).toBe(540);
    expect(f.panel.y + f.panel.height / 2).toBe(360);
  });

  it("should lay the bar along the panel's foot, the line and the number above it", () => {
    const f = fallenFrame(1080, 720);
    expect(f.bar).toEqual(countdownBarRect(f.panel));
    expect(inside(f.line, f.panel)).toBe(true);
    expect(inside(f.seconds, f.panel)).toBe(true);
    expect(f.seconds.y).toBeGreaterThanOrEqual(f.line.y + f.line.height);
    expect(f.seconds.y + f.seconds.height).toBeLessThanOrEqual(f.bar.y);
  });
});
