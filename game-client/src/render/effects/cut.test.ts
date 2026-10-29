import { describe, expect, it } from "vitest";
import { worldToScreen, type Point } from "@/render/iso/projection";
import { worldDepth } from "@/render/iso/shapes";
import { BARROW_HEX } from "@/utils/theme";
import {
  CUT_MS,
  CUT_SHAPE,
  CutFx,
  swordArc,
  type CutGraphics,
  type CutScene,
} from "./cut";

const DEG = Math.PI / 180;
const me = { x: 300, y: 200 };

/** Heading of `p` seen from `from`, relative to `aim`, in (-π, π]. */
function offAim(from: Point, p: Point, aim: number): number {
  const a = Math.atan2(p.y - from.y, p.x - from.x) - aim;
  return Math.atan2(Math.sin(a), Math.cos(a));
}

describe("CUT_SHAPE (FS-MAMHR §B.6)", () => {
  it("should match the server's cut: a 70° arc, 55 px of reach", () => {
    expect(CUT_SHAPE.arc).toBeCloseTo(70 * DEG);
    expect(CUT_SHAPE.reach).toBe(55);
  });
});

describe("swordArc (FS-MAMHR §G.32)", () => {
  it.each([
    ["east", { x: 400, y: 200 }],
    ["south-west, far past the reach", { x: -100, y: 900 }],
    ["north, inside the reach", { x: 300, y: 180 }],
  ])(
    "should lie inside the cone aimed %s: within 55 px and 35° of the aim",
    (_, toward) => {
      const aim = Math.atan2(toward.y - me.y, toward.x - me.x);
      const band = swordArc(me, toward, CUT_SHAPE);
      expect(band.length).toBeGreaterThan(8);
      for (const p of band) {
        expect(Math.hypot(p.x - me.x, p.y - me.y)).toBeLessThanOrEqual(
          55 + 1e-9,
        );
        expect(Math.abs(offAim(me, p, aim))).toBeLessThanOrEqual(
          35 * DEG + 1e-9,
        );
      }
    },
  );

  it("should reach the full 55 px and span the full 70°, however near the cursor", () => {
    const band = swordArc(me, { x: 310, y: 200 }, CUT_SHAPE);
    const far = Math.max(
      ...band.map((p) => Math.hypot(p.x - me.x, p.y - me.y)),
    );
    expect(far).toBeCloseTo(55);
    const angles = band.map((p) => offAim(me, p, 0));
    expect(Math.min(...angles)).toBeCloseTo(-35 * DEG);
    expect(Math.max(...angles)).toBeCloseTo(35 * DEG);
  });

  it("should be a band, not a wedge: it never reaches back to the player", () => {
    for (const p of swordArc(me, { x: 400, y: 200 }, CUT_SHAPE))
      expect(Math.hypot(p.x - me.x, p.y - me.y)).toBeGreaterThan(
        CUT_SHAPE.reach / 2,
      );
  });

  it("should aim along +x with the cursor on the player's own footprint", () => {
    for (const p of swordArc(me, me, CUT_SHAPE))
      expect(Math.abs(offAim(me, p, 0))).toBeLessThanOrEqual(35 * DEG + 1e-9);
  });

  it("should take its shape from the arc it is given (a wider one reads wider)", () => {
    const wide = swordArc(
      me,
      { x: 400, y: 200 },
      { arc: 240 * DEG, reach: 90 },
    );
    const angles = wide.map((p) => offAim(me, p, 0));
    expect(Math.max(...angles)).toBeCloseTo(120 * DEG);
    expect(
      Math.max(...wide.map((p) => Math.hypot(p.x - me.x, p.y - me.y))),
    ).toBeCloseTo(90);
  });

  it("should stay smooth along a wide arc: no step of the outer edge spans more than 10°", () => {
    const wide = swordArc(
      me,
      { x: 400, y: 200 },
      { arc: 240 * DEG, reach: 90 },
    );
    const outer = wide.slice(0, wide.length / 2);
    for (let i = 1; i < outer.length; i++) {
      const step = offAim(me, outer[i], 0) - offAim(me, outer[i - 1], 0);
      expect(Math.abs(step)).toBeLessThanOrEqual(10 * DEG + 1e-9);
    }
  });

  it("should thicken to the band width it is given at its leading edge, 14 px when given none", () => {
    const depth = (shape: { arc: number; reach: number; width?: number }) => {
      const band = swordArc(me, { x: 400, y: 200 }, shape);
      const n = band.length / 2;
      const lead = [band[n - 1], band[n]]; // outer then inner, at the leading edge
      return Math.hypot(lead[0].x - lead[1].x, lead[0].y - lead[1].y);
    };
    expect(depth(CUT_SHAPE)).toBeCloseTo(14);
    expect(depth({ arc: 240 * DEG, reach: 90, width: 22 })).toBeCloseTo(22);
  });
});

describe("CutFx (FS-MAMHR §G.32)", () => {
  function fake() {
    const calls: { method: string; args: unknown[] }[] = [];
    const tweens: Record<string, unknown>[] = [];
    let destroyed = 0;
    const g: CutGraphics = {
      fillStyle: (...args) => (calls.push({ method: "fillStyle", args }), g),
      fillPoints: (...args) => (calls.push({ method: "fillPoints", args }), g),
      lineStyle: (...args) => (calls.push({ method: "lineStyle", args }), g),
      strokePoints: (...args) => (
        calls.push({ method: "strokePoints", args }),
        g
      ),
      setDepth: (...args) => (calls.push({ method: "setDepth", args }), g),
      destroy: () => {
        destroyed++;
      },
    };
    let made = 0;
    const scene: CutScene = {
      add: {
        graphics: () => {
          made++;
          return g;
        },
      },
      tweens: {
        add: (config) => tweens.push(config as Record<string, unknown>),
      },
    };
    const args = (method: string) =>
      calls.find((c) => c.method === method)?.args;
    return {
      scene,
      tweens,
      args,
      fx: new CutFx(scene),
      made: () => made,
      destroyed: () => destroyed > 0,
      destroys: () => destroyed,
    };
  }

  it("should lay the band on the ground, projected: dull steel inside, a vellum lip", () => {
    const f = fake();
    const toward = { x: 400, y: 260 };
    f.fx.play(me, toward);
    expect(f.made()).toBe(1);
    const projected = swordArc(me, toward, CUT_SHAPE).map((p) =>
      worldToScreen(p.x, p.y),
    );
    expect(f.args("fillStyle")?.[0]).toBe(BARROW_HEX.vellumDark);
    expect(f.args("fillPoints")?.[0]).toEqual(projected);
    expect(f.args("lineStyle")?.[1]).toBe(BARROW_HEX.vellum);
  });

  it("should draw over the player, and over a target in reach nearer the viewer", () => {
    const f = fake();
    const target = { x: me.x + 40, y: me.y + 30 };
    f.fx.play(me, target);
    const depth = f.args("setDepth")?.[0] as number;
    expect(depth).toBeGreaterThan(worldDepth(me.x, me.y, 1));
    expect(depth).toBeGreaterThan(worldDepth(target.x, target.y, 1));
  });

  it("should fade out over its short life on an allowed easing, then go", () => {
    const f = fake();
    f.fx.play(me, { x: 400, y: 200 });
    expect(f.tweens).toHaveLength(1);
    const t = f.tweens[0];
    expect(t.alpha).toEqual({ from: 1, to: 0 });
    expect(t.duration).toBe(CUT_MS);
    expect(CUT_MS).toBeLessThan(220); // quicker than the slash's smear
    expect(t.ease).toMatch(/^(Linear|(Sine|Quad|Cubic)\.ease(In|Out|InOut))$/);
    expect(f.destroyed()).toBe(false);
    (t.onComplete as () => void)();
    expect(f.destroyed()).toBe(true);
  });

  it("should take a cut still fading down with the run, and leave it down when its fade completes after", () => {
    const f = fake();
    f.fx.play(me, { x: 400, y: 200 });
    f.fx.forget();
    expect(f.destroys()).toBe(1);
    (f.tweens[0].onComplete as () => void)();
    expect(f.destroys()).toBe(1);
  });

  it("should not touch a cut whose fade has already completed", () => {
    const f = fake();
    f.fx.play(me, { x: 400, y: 200 });
    (f.tweens[0].onComplete as () => void)();
    f.fx.forget();
    expect(f.destroys()).toBe(1);
  });
});
