import { describe, expect, it } from "vitest";
import type { SealState } from "@/types/gameState";
import { COUNTDOWN_BAR_H } from "./countdownBar";
import { SEAL_WINDOW_LINE, SealWindowClock, sealWindowFrame } from "./sealWindow";

const braziers = (window_ends_in?: number): SealState => ({ kind: "braziers", stage: 1, stages: 1, broken: false, window_ends_in });

describe("the Braziers window's countdown (FS-5FZ4J §J R53, FS-B3NDZ)", () => {
  it("should show nothing while no window runs", () => {
    const clock = new SealWindowClock();
    expect(clock.see(undefined)).toBeNull();
    expect(clock.see(braziers())).toBeNull();
  });

  it("should drain from the window's first sight to its end, the whole seconds rounded up", () => {
    const clock = new SealWindowClock();
    expect(clock.see(braziers(20))).toEqual({ seconds: 20, fraction: 1 });
    expect(clock.see(braziers(14.2))).toEqual({ seconds: 15, fraction: 14.2 / 20 });
    expect(clock.see(braziers(0))).toEqual({ seconds: 0, fraction: 0 });
  });

  it("should take a new window's length afresh once one has ended", () => {
    const clock = new SealWindowClock();
    clock.see(braziers(20));
    clock.see(braziers());
    expect(clock.see(braziers(30))).toEqual({ seconds: 30, fraction: 1 });
  });

  it("should forget the window on reset: a new floor's starts afresh", () => {
    const clock = new SealWindowClock();
    clock.see(braziers(20));
    clock.reset();
    expect(clock.see(braziers(10))).toEqual({ seconds: 10, fraction: 1 });
  });

  it("should say the braziers burn", () => {
    expect(SEAL_WINDOW_LINE).toBe("The braziers burn.");
  });

  it("should stand its panel at the top centre, under the run's notices, the bar along its foot", () => {
    const f = sealWindowFrame(1280);
    expect(f.panel.x + f.panel.width / 2).toBe(640);
    expect(f.panel.y).toBeGreaterThan(100);
    expect(f.bar).toEqual({ x: f.panel.x, y: f.panel.y + f.panel.height - COUNTDOWN_BAR_H, width: f.panel.width, height: COUNTDOWN_BAR_H });
    expect(f.seconds.y).toBeGreaterThan(f.line.y);
    expect(f.seconds.y + f.seconds.height).toBeLessThanOrEqual(f.bar.y);
  });
});
