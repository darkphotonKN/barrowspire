import { describe, expect, it } from "vitest";
import { worldToScreen } from "@/render/iso/projection";
import { palette } from "@/utils/canvasPalette";
import { BARROW_HEX } from "@/utils/theme";
import { BOW_LIFT, BOW_REACH } from "./arrow";
import {
  AIM_ARROW,
  AIM_GLOW_ALPHA,
  AIM_GLOW_GROWTH,
  AIM_GLOW_WIDTH,
  AIM_LINE_ALPHA,
  AIM_LINE_DEPTH,
  AIM_LINE_WIDTH,
  AimLine,
  aimArrow,
  glowHead,
} from "./aimLine";
import { alongAim } from "./projectile";

/** A Graphics stand-in recording what the aim arrow drew with. */
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
      lineBetween: rec("lineBetween"),
      fillStyle: rec("fillStyle"),
      fillTriangle: rec("fillTriangle"),
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
  const last = (method: string) =>
    made.at(-1)?.calls.filter((c) => c.method === method).at(-1)?.args;
  return { make, made, frame, last };
}

const raised = (p: { x: number; y: number }) => {
  const s = worldToScreen(p.x, p.y);
  return { x: s.x, y: s.y - BOW_LIFT };
};
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(b.x - a.x, b.y - a.y);
const reach = AIM_ARROW.gap + AIM_ARROW.shaft + AIM_ARROW.head;

describe("aimArrow (FS-JTNPR req 11)", () => {
  it("should be short: the tip a fixed few screen px past the bow, however far the cursor is", () => {
    const from = { x: 500, y: 500 };
    const bow = raised(alongAim(from, { x: 2000, y: 500 }, BOW_REACH));
    for (const toward of [{ x: 520, y: 500 }, { x: 2000, y: 500 }, { x: 9000, y: 500 }]) {
      const { tip } = aimArrow(from, toward);
      expect(dist(bow, tip)).toBeCloseTo(reach);
    }
    // a hint, never a ruler: well inside the screen, nowhere near the shot's 650 world px
    expect(reach).toBeLessThanOrEqual(64);
  });

  it("should stand a little way out from the bow, the arrow's release point at bow height", () => {
    const from = { x: 300, y: 200 };
    const toward = { x: 300, y: 700 };
    const { tail } = aimArrow(from, toward);
    const bow = raised(alongAim(from, toward, BOW_REACH));
    expect(dist(bow, tail)).toBeCloseTo(AIM_ARROW.gap);
    expect(AIM_ARROW.gap).toBeGreaterThan(0);
  });

  it("should point the same way on screen as the shot flies, in every direction", () => {
    const from = { x: 400, y: 400 };
    for (const toward of [
      { x: 800, y: 400 },
      { x: 400, y: 800 },
      { x: 0, y: 400 },
      { x: 120, y: 90 },
    ]) {
      const { tail, tip } = aimArrow(from, toward);
      const a = worldToScreen(from.x, from.y);
      const b = worldToScreen(toward.x, toward.y);
      const want = Math.atan2(b.y - a.y, b.x - a.x);
      expect(Math.atan2(tip.y - tail.y, tip.x - tail.x)).toBeCloseTo(want);
    }
  });

  it("should give the head a base square to the shaft, centred on the neck", () => {
    const { neck, tip, left, right } = aimArrow({ x: 0, y: 0 }, { x: 100, y: 40 });
    expect((left.x + right.x) / 2).toBeCloseTo(neck.x);
    expect((left.y + right.y) / 2).toBeCloseTo(neck.y);
    expect(dist(left, right)).toBeCloseTo(AIM_ARROW.halfWidth * 2);
    const base = { x: right.x - left.x, y: right.y - left.y };
    const axis = { x: tip.x - neck.x, y: tip.y - neck.y };
    expect(base.x * axis.x + base.y * axis.y).toBeCloseTo(0);
  });

  it("should point along +x with the cursor on the archer's own footprint", () => {
    const from = { x: 100, y: 100 };
    const { tail, tip } = aimArrow(from, from);
    const a = worldToScreen(0, 0);
    const b = worldToScreen(1, 0);
    expect(Math.atan2(tip.y - tail.y, tip.x - tail.x)).toBeCloseTo(
      Math.atan2(b.y - a.y, b.x - a.x),
    );
  });
});

describe("AimLine (FS-JTNPR req 11, 15)", () => {
  it("should draw a thick shaft and a filled head in the umbra aim token, faint and unhaloed until ready", () => {
    const g = fakeGraphics();
    const line = new AimLine(g.make);
    line.draw({ x: 0, y: 0 }, { x: 100, y: 0 }, false);
    const drawn = g.frame();
    expect(drawn.map((c) => c.method)).toEqual([
      "lineStyle",
      "lineBetween",
      "fillStyle",
      "fillTriangle",
    ]);
    expect(drawn[0].args).toEqual([AIM_LINE_WIDTH, palette.aimLine, AIM_LINE_ALPHA.faint]);
    expect(drawn[2].args).toEqual([palette.aimLine, AIM_LINE_ALPHA.faint]);
    expect(AIM_LINE_WIDTH).toBeGreaterThanOrEqual(3);
  });

  it("should glow up once ready: full strength over a softer, wider umbra halo", () => {
    const g = fakeGraphics();
    const line = new AimLine(g.make);
    line.draw({ x: 0, y: 0 }, { x: 100, y: 0 }, true);
    const drawn = g.frame();
    expect(drawn.map((c) => c.method)).toEqual([
      "lineStyle",
      "lineBetween",
      "fillStyle",
      "fillTriangle",
      "lineStyle",
      "lineBetween",
      "fillStyle",
      "fillTriangle",
    ]);
    expect(drawn[0].args).toEqual([AIM_GLOW_WIDTH, palette.aimGlow, AIM_GLOW_ALPHA]);
    expect(AIM_GLOW_WIDTH).toBeGreaterThan(AIM_LINE_WIDTH);
    expect(drawn[2].args).toEqual([palette.aimGlow, AIM_GLOW_ALPHA]);
    // the halo's head is the head grown about its centre, so it rims the head on every side
    const { tip, left, right } = aimArrow({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(drawn[3].args).toEqual(glowHead(tip, left, right).flatMap((p) => [p.x, p.y]));
    expect(AIM_GLOW_GROWTH).toBeGreaterThan(1);
    expect(drawn[4].args).toEqual([AIM_LINE_WIDTH, palette.aimLine, AIM_LINE_ALPHA.ready]);
    expect(drawn[6].args).toEqual([palette.aimLine, AIM_LINE_ALPHA.ready]);
    expect(AIM_LINE_ALPHA.faint).toBeLessThan(AIM_LINE_ALPHA.ready);
  });

  it("should take the shadow bolt's umbra, never white vellum nor the amber accent", () => {
    expect(palette.aimLine).toBe(BARROW_HEX.umbraLight);
    for (const c of [palette.aimLine, palette.aimGlow]) {
      expect(c).not.toBe(BARROW_HEX.vellum);
      expect(c).not.toBe(BARROW_HEX.amber);
    }
  });

  it("should redraw one graphics object each frame, not make a new one", () => {
    const g = fakeGraphics();
    const line = new AimLine(g.make);
    line.draw({ x: 0, y: 0 }, { x: 100, y: 0 }, false);
    line.draw({ x: 0, y: 0 }, { x: 0, y: 100 }, false);
    expect(g.made).toHaveLength(1);
    expect(g.made[0].calls.filter((c) => c.method === "clear")).toHaveLength(2);
    const { tail, neck, tip, left, right } = aimArrow({ x: 0, y: 0 }, { x: 0, y: 100 });
    expect(g.last("lineBetween")).toEqual([tail.x, tail.y, neck.x, neck.y]);
    expect(g.last("fillTriangle")).toEqual([tip.x, tip.y, left.x, left.y, right.x, right.y]);
  });

  it("should draw over the light-map and vignette, under the markers", () => {
    const g = fakeGraphics();
    new AimLine(g.make).draw({ x: 0, y: 0 }, { x: 100, y: 0 }, false);
    expect(g.last("setDepth")).toEqual([AIM_LINE_DEPTH]);
    expect(AIM_LINE_DEPTH).toBeGreaterThan(905);
    expect(AIM_LINE_DEPTH).toBeLessThan(950);
  });

  it("should leave no arrow behind once cleared, and draw afresh after", () => {
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

  it("should forget an arrow the scene already destroyed, without touching it", () => {
    const g = fakeGraphics();
    const line = new AimLine(g.make);
    line.draw({ x: 0, y: 0 }, { x: 100, y: 0 }, false);
    line.forget();
    expect(line.drawn).toBe(false);
    expect(g.made[0].destroyed).toBe(false);
  });
});
