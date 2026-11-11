import { describe, expect, it, vi } from "vitest";
import { palette } from "@/utils/canvasPalette";
import { COUNTDOWN_BAR_H } from "./countdownBar";
import { OPEN_BAR, drawOpenBar, openBarFraction, openBarRect } from "./openBar";

// FS-MQYEX §Requirements 22, 24. I-MQYEX-4: the open bar's pure half and its drawer.

describe("openBarRect (FS-MQYEX R24: centred over the container, 10 px above its sprite)", () => {
  it("should be 44 px wide, the countdown bar's 7 px high, and stand 10 px off", () => {
    expect(OPEN_BAR).toEqual({ width: 44, height: COUNTDOWN_BAR_H, gap: 10 });
    expect(OPEN_BAR.height).toBe(7);
  });

  it("should sit centred on the sprite, its foot 10 px above the sprite's top", () => {
    // a 40 x 32 chest drawn with its top-left corner at (100, 200)
    expect(openBarRect({ x: 100, y: 200, width: 40, height: 32 })).toEqual({
      x: 98,
      y: 183,
      width: 44,
      height: 7,
    });
  });

  it("should stay centred on a sprite narrower or wider than the bar", () => {
    expect(openBarRect({ x: 0, y: 50, width: 10, height: 10 }).x).toBe(-17);
    expect(openBarRect({ x: 0, y: 50, width: 100, height: 10 }).x).toBe(28);
  });
});

describe("openBarFraction (FS-MQYEX R22: elapsed / duration, smooth between states, never past full)", () => {
  const open = (elapsed: number, duration = 1.5) => ({ entity_id: "c1", elapsed, duration });

  it.each([
    [0, 0],
    [0.75, 0.5],
    [1.5, 1],
  ])("should be elapsed / duration on the state itself: %s s of 1.5 s", (elapsed, fraction) => {
    expect(openBarFraction(open(elapsed))).toBeCloseTo(fraction);
  });

  it("should advance with the real time since the state that carried it", () => {
    // a third of a second after a state at 0.75 s: 1.05 s of 1.5 s
    expect(openBarFraction(open(0.75), 300)).toBeCloseTo(0.7);
  });

  it("should never pass full, however long the next state takes", () => {
    expect(openBarFraction(open(1.4), 5_000)).toBe(1);
    expect(openBarFraction(open(2))).toBe(1);
  });

  it("should never run backwards from the state's own elapsed", () => {
    expect(openBarFraction(open(0.75), -200)).toBeCloseTo(0.5);
    expect(openBarFraction(open(-1))).toBe(0);
  });

  it.each([0, -1.5, Number.NaN])("should be empty for a duration of %s, never a full bar", (duration) => {
    expect(openBarFraction(open(0.5, duration))).toBe(0);
  });

  it("should be empty when the times are not numbers", () => {
    expect(openBarFraction(open(Number.NaN))).toBe(0);
    expect(openBarFraction(open(0.75), Number.NaN)).toBeCloseTo(0.5);
  });
});

describe("drawOpenBar (FS-MQYEX R24: the countdown bar's look, filling from the left)", () => {
  const brush = () => ({ fillStyle: vi.fn(), fillRect: vi.fn(), lineStyle: vi.fn(), strokeRect: vi.fn() });
  const sprite = { x: 100, y: 200, width: 40, height: 32 };

  it("should draw the charcoal track, the bright-brass fill from the left end, and the brass rim", () => {
    const g = brush();
    drawOpenBar(g as never, sprite, 0.5);

    expect(g.fillStyle.mock.calls).toEqual([
      [palette.xpTrack, 0.9],
      [palette.xpFill, 1],
    ]);
    expect(g.fillRect.mock.calls).toEqual([
      [98, 183, 44, 7],
      // half full: the left end anchored
      [98, 183, 22, 7],
    ]);
    expect(g.lineStyle).toHaveBeenCalledWith(1, palette.frame, 0.6);
    expect(g.strokeRect).toHaveBeenCalledWith(98, 183, 44, 7);
  });

  it("should draw no fill while empty", () => {
    const g = brush();
    drawOpenBar(g as never, sprite, 0);
    expect(g.fillRect).toHaveBeenCalledTimes(1);
  });
});
