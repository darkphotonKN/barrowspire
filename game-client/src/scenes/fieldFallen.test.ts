import { describe, expect, it } from "vitest";
import { FIELD_RISE_MS, FallenCountdown, fallenCopy, isFallen } from "./fieldFallen";

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

describe("fallenCopy (FS-X2F2H §Requirements 58)", () => {
  it("should say where they rise and when, with no loss copy", () => {
    const line = fallenCopy(2);

    expect(line).toContain("2");
    expect(line).toMatch(/road home/i);
    expect(line).not.toMatch(/lost|defeat|died|result|game over/i);
  });
});
