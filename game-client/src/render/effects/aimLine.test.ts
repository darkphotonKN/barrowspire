import { describe, expect, it } from "vitest";
import { worldToScreen } from "@/render/iso/projection";
import { palette } from "@/utils/canvasPalette";
import { BOW_LIFT, BOW_REACH } from "./arrow";
import { AIM_LINE_ALPHA, AIM_LINE_DEPTH, AimLine, SHADOW_SHOT_RANGE, aimLineEnds } from "./aimLine";
import { alongAim } from "./projectile";

/** A Graphics stand-in recording what the aim line drew with. */
function fakeGraphics() {
  const calls: { method: string; args: unknown[] }[] = [];
  const made: { destroyed: boolean; calls: typeof calls }[] = [];
  const make = () => {
    const record = { destroyed: false, calls: [] as typeof calls };
    made.push(record);
    const g = {
      clear: () => (record.calls.push({ method: "clear", args: [] }), g),
      lineStyle: (...args: unknown[]) => (record.calls.push({ method: "lineStyle", args }), g),
      lineBetween: (...args: unknown[]) => (record.calls.push({ method: "lineBetween", args }), g),
      setDepth: (...args: unknown[]) => (record.calls.push({ method: "setDepth", args }), g),
      destroy: () => {
        record.destroyed = true;
      },
    };
    return g;
  };
  const last = (method: string) => made.at(-1)?.calls.filter((c) => c.method === method).at(-1)?.args;
  return { make, made, calls, last };
}

const raised = (p: { x: number; y: number }) => {
  const s = worldToScreen(p.x, p.y);
  return { x: s.x, y: s.y - BOW_LIFT };
};

describe("aimLineEnds (FS-JTNPR req 11)", () => {
  it("should run the shot's full 650 world px toward the cursor, however near the cursor is", () => {
    const from = { x: 500, y: 500 };
    for (const toward of [{ x: 520, y: 500 }, { x: 2000, y: 500 }]) {
      const { end } = aimLineEnds(from, toward);
      expect(end.x).toBeCloseTo(raised({ x: 500 + SHADOW_SHOT_RANGE, y: 500 }).x);
      expect(end.y).toBeCloseTo(raised({ x: 500 + SHADOW_SHOT_RANGE, y: 500 }).y);
    }
    expect(SHADOW_SHOT_RANGE).toBe(650);
  });

  it("should start at the bow: the arrow's release point, at bow height", () => {
    const from = { x: 300, y: 200 };
    const toward = { x: 300, y: 700 };
    const { start } = aimLineEnds(from, toward);
    const bow = raised(alongAim(from, toward, BOW_REACH));
    expect(start.x).toBeCloseTo(bow.x);
    expect(start.y).toBeCloseTo(bow.y);
  });

  it("should run along +x with the cursor on the archer's own footprint", () => {
    const from = { x: 100, y: 100 };
    const { end } = aimLineEnds(from, from);
    const want = raised({ x: 100 + SHADOW_SHOT_RANGE, y: 100 });
    expect(end.x).toBeCloseTo(want.x);
    expect(end.y).toBeCloseTo(want.y);
  });
});

describe("AimLine (FS-JTNPR req 11, 15)", () => {
  it("should draw one thin line in the aim-line token, faint until ready and full once ready", () => {
    const g = fakeGraphics();
    const line = new AimLine(g.make);
    line.draw({ x: 0, y: 0 }, { x: 100, y: 0 }, false);
    const [width, color, faint] = g.last("lineStyle")!;
    expect(width).toBeLessThanOrEqual(2);
    expect(color).toBe(palette.aimLine);
    expect(faint).toBe(AIM_LINE_ALPHA.faint);

    line.draw({ x: 0, y: 0 }, { x: 100, y: 0 }, true);
    expect(g.last("lineStyle")![2]).toBe(AIM_LINE_ALPHA.ready);
    expect(AIM_LINE_ALPHA.faint).toBeLessThan(AIM_LINE_ALPHA.ready);
  });

  it("should redraw one graphics object each frame, not make a new one", () => {
    const g = fakeGraphics();
    const line = new AimLine(g.make);
    line.draw({ x: 0, y: 0 }, { x: 100, y: 0 }, false);
    line.draw({ x: 0, y: 0 }, { x: 0, y: 100 }, false);
    expect(g.made).toHaveLength(1);
    expect(g.made[0].calls.filter((c) => c.method === "clear")).toHaveLength(2);
    const { start, end } = aimLineEnds({ x: 0, y: 0 }, { x: 0, y: 100 });
    expect(g.last("lineBetween")).toEqual([start.x, start.y, end.x, end.y]);
  });

  it("should draw over the light-map and vignette, under the markers", () => {
    const g = fakeGraphics();
    new AimLine(g.make).draw({ x: 0, y: 0 }, { x: 100, y: 0 }, false);
    expect(g.last("setDepth")).toEqual([AIM_LINE_DEPTH]);
    expect(AIM_LINE_DEPTH).toBeGreaterThan(905);
    expect(AIM_LINE_DEPTH).toBeLessThan(950);
  });

  it("should leave no line behind once cleared, and draw afresh after", () => {
    const g = fakeGraphics();
    const line = new AimLine(g.make);
    line.draw({ x: 0, y: 0 }, { x: 100, y: 0 }, false);
    expect(line.drawn).toBe(true);
    line.clear();
    expect(line.drawn).toBe(false);
    expect(g.made[0].destroyed).toBe(true);
    line.clear();
    line.draw({ x: 0, y: 0 }, { x: 100, y: 0 }, false);
    expect(g.made).toHaveLength(2);
  });

  it("should forget a line the scene already destroyed, without touching it", () => {
    const g = fakeGraphics();
    const line = new AimLine(g.make);
    line.draw({ x: 0, y: 0 }, { x: 100, y: 0 }, false);
    line.forget();
    expect(line.drawn).toBe(false);
    expect(g.made[0].destroyed).toBe(false);
  });
});
