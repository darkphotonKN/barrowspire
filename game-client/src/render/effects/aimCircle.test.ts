import { describe, expect, it } from "vitest";
import { screenToWorld, worldToScreen } from "@/render/iso/projection";
import { palette } from "@/utils/canvasPalette";
import { BARROW_HEX } from "@/utils/theme";
import { ARROW_RAIN_RADIUS } from "@/scenes/arrowRainAim";
import {
  AIM_CIRCLE_ALPHA,
  AIM_CIRCLE_DEPTH,
  AIM_CIRCLE_SEGMENTS,
  AIM_CIRCLE_WIDTH,
  AimCircle,
  aimCirclePoints,
} from "./aimCircle";
import { AIM_LINE_DEPTH } from "./aimLine";

/** A Graphics stand-in recording what the circle drew with. */
function fakeGraphics() {
  const made: { destroyed: boolean; calls: { method: string; args: unknown[] }[] }[] = [];
  const make = () => {
    const record = { destroyed: false, calls: [] as { method: string; args: unknown[] }[] };
    made.push(record);
    const rec =
      (method: string) =>
      (...args: unknown[]) => (record.calls.push({ method, args }), g);
    const g = {
      clear: rec("clear"),
      lineStyle: rec("lineStyle"),
      fillStyle: rec("fillStyle"),
      fillPoints: rec("fillPoints"),
      strokePoints: rec("strokePoints"),
      setDepth: rec("setDepth"),
      destroy: () => {
        record.destroyed = true;
      },
    };
    return g;
  };
  /** The calls since the last `clear`: what this frame drew. */
  const frame = () => {
    const calls = made.at(-1)!.calls;
    const from = calls.map((c) => c.method).lastIndexOf("clear");
    return calls.slice(from + 1);
  };
  return { make, made, frame };
}

const barrow = new Set<number>(Object.values(BARROW_HEX));

describe("aimCirclePoints (FS-04EEA R38)", () => {
  it("should ring the centre at the rain's 70 world px, in the iso projection", () => {
    const centre = { x: 400, y: 260 };
    const points = aimCirclePoints(centre);
    expect(points).toHaveLength(AIM_CIRCLE_SEGMENTS);
    for (const p of points) {
      const w = screenToWorld(p.x, p.y);
      expect(Math.hypot(w.x - centre.x, w.y - centre.y)).toBeCloseTo(ARROW_RAIN_RADIUS);
    }
  });

  it("should be centred on the centre's screen point", () => {
    const centre = { x: 120, y: -40 };
    const points = aimCirclePoints(centre);
    const mean = {
      x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
      y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
    };
    const s = worldToScreen(centre.x, centre.y);
    expect(mean.x).toBeCloseTo(s.x);
    expect(mean.y).toBeCloseTo(s.y);
  });
});

describe("AimCircle (FS-04EEA R38)", () => {
  it("should draw a faint fill under a ring, both in BARROW tokens, over the dark", () => {
    const g = fakeGraphics();
    const circle = new AimCircle(g.make);
    circle.draw({ x: 0, y: 0 });
    expect(g.made[0].calls[0]).toEqual({ method: "setDepth", args: [AIM_CIRCLE_DEPTH] });
    const drawn = g.frame();
    expect(drawn.map((c) => c.method)).toEqual(["fillStyle", "fillPoints", "lineStyle", "strokePoints"]);
    expect(drawn[0].args).toEqual([palette.rainAimFill, AIM_CIRCLE_ALPHA.fill]);
    expect(drawn[2].args).toEqual([AIM_CIRCLE_WIDTH, palette.rainAimRing, AIM_CIRCLE_ALPHA.ring]);
    expect(barrow.has(palette.rainAimRing)).toBe(true);
    expect(barrow.has(palette.rainAimFill)).toBe(true);
    expect(AIM_CIRCLE_ALPHA.fill).toBeLessThan(AIM_CIRCLE_ALPHA.ring);
    expect(AIM_CIRCLE_DEPTH).toBe(AIM_LINE_DEPTH);
  });

  it("should redraw in place each frame, made once", () => {
    const g = fakeGraphics();
    const circle = new AimCircle(g.make);
    circle.draw({ x: 0, y: 0 });
    circle.draw({ x: 50, y: 10 });
    expect(g.made).toHaveLength(1);
    expect(g.frame()[1].args[0]).toEqual(aimCirclePoints({ x: 50, y: 10 }));
  });

  it("should leave no circle behind once cleared, and make a fresh one on the next aim", () => {
    const g = fakeGraphics();
    const circle = new AimCircle(g.make);
    circle.draw({ x: 0, y: 0 });
    circle.clear();
    expect(g.made[0].destroyed).toBe(true);
    expect(circle.drawn).toBe(false);
    circle.draw({ x: 0, y: 0 });
    expect(g.made).toHaveLength(2);
  });

  it("should touch nothing when forgotten after a teardown", () => {
    const g = fakeGraphics();
    const circle = new AimCircle(g.make);
    circle.draw({ x: 0, y: 0 });
    circle.forget();
    expect(g.made[0].destroyed).toBe(false);
    expect(circle.drawn).toBe(false);
  });
});
