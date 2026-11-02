import { describe, expect, it } from "vitest";
import { palette } from "@/utils/canvasPalette";
import {
  COUNTDOWN_BAR_H,
  COUNTDOWN_SECONDS_PX,
  countdownBarFill,
  countdownBarRect,
  countdownSecondsText,
  drawCountdownBar,
} from "./countdownBar";

// FS-B3NDZ §Requirements 1–9, 13. I-B3NDZ-1: the one countdown look, its pure half and its drawer.

describe("countdownBarRect (FS-B3NDZ R1, R2: full width along the panel's foot)", () => {
  it("should run edge to edge along the panel's bottom, 7 px tall", () => {
    expect(COUNTDOWN_BAR_H).toBe(7);
    expect(countdownBarRect({ x: 10, y: 20, width: 300, height: 100 })).toEqual(
      { x: 10, y: 113, width: 300, height: 7 },
    );
  });
});

describe("countdownBarFill (FS-B3NDZ R3: anchored left, the right end recedes)", () => {
  const bar = { x: 10, y: 113, width: 300, height: 7 };

  it.each([
    [1, 300],
    [0.25, 75],
    [0, 0],
  ])(
    "should keep the left edge and fill %s of the width",
    (fraction, width) => {
      expect(countdownBarFill(bar, fraction)).toEqual({ ...bar, width });
    },
  );

  it("should not round to whole pixels, so the recession is smooth", () => {
    expect(countdownBarFill(bar, 0.501).width).toBeCloseTo(150.3);
  });

  it("should clamp a fraction outside 0..1", () => {
    expect(countdownBarFill(bar, 1.4).width).toBe(300);
    expect(countdownBarFill(bar, -0.2).width).toBe(0);
  });
});

describe("countdownSecondsText (FS-B3NDZ R8: the number stays, larger)", () => {
  it("should read whole seconds as <n>s, at 18 px", () => {
    expect(countdownSecondsText(12)).toBe("12s");
    expect(COUNTDOWN_SECONDS_PX).toBe(18);
  });
});

describe("drawCountdownBar (FS-B3NDZ R3, R5: the XP bar's colours)", () => {
  function recorder() {
    const calls: { fill?: number; rect?: number[]; stroke?: number[] }[] = [];
    let colour = 0;
    const g = {
      fillStyle: (c: number) => ((colour = c), g),
      fillRect: (x: number, y: number, w: number, h: number) => (
        calls.push({ fill: colour, rect: [x, y, w, h] }),
        g
      ),
      lineStyle: () => g,
      strokeRect: (x: number, y: number, w: number, h: number) => (
        calls.push({ stroke: [x, y, w, h] }),
        g
      ),
    };
    return { g: g as unknown as Parameters<typeof drawCountdownBar>[0], calls };
  }
  const bar = { x: 10, y: 113, width: 300, height: 7 };

  it("should draw the track, the fill anchored left, and the rim", () => {
    const { g, calls } = recorder();
    drawCountdownBar(g, bar, 0.5);
    expect(calls).toEqual([
      { fill: palette.xpTrack, rect: [10, 113, 300, 7] },
      { fill: palette.xpFill, rect: [10, 113, 150, 7] },
      { stroke: [10, 113, 300, 7] },
    ]);
  });

  it("should draw no fill once the countdown has run out", () => {
    const { g, calls } = recorder();
    drawCountdownBar(g, bar, 0);
    expect(calls.filter((c) => c.fill === palette.xpFill)).toEqual([]);
  });
});
