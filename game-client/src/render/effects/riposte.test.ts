import { describe, expect, it } from "vitest";
import { worldToScreen } from "@/render/iso/projection";
import { worldDepth } from "@/render/iso/shapes";
import type { ResourceState } from "@/types/gameState";
import { BARROW_HEX } from "@/utils/theme";
import { BAND_WIDTH, CUT_MS, CUT_SHAPE, swordArc } from "./cut";
import { BLADE_LIFT } from "./parry";
import {
  ARMED_GLINT_MS,
  RIPOSTE_MS,
  RIPOSTE_SHAPE,
  RiposteFx,
  glintAt,
  riposteArmed,
  type RiposteGraphics,
  type RiposteScene,
} from "./riposte";

const DEG = Math.PI / 180;
const me = { x: 300, y: 200 };

interface Drawn {
  calls: { method: string; args: unknown[] }[];
  destroyed: number;
  last(method: string): unknown[] | undefined;
}

function fake() {
  const made: Drawn[] = [];
  const tweens: Record<string, unknown>[] = [];
  const scene: RiposteScene = {
    add: {
      graphics: () => {
        const d: Drawn = {
          calls: [],
          destroyed: 0,
          last: (method) =>
            [...d.calls].reverse().find((c) => c.method === method)?.args,
        };
        made.push(d);
        const record =
          (method: string) =>
          (...args: unknown[]) => {
            d.calls.push({ method, args });
            return g;
          };
        const g: RiposteGraphics = {
          fillStyle: record("fillStyle"),
          fillPoints: record("fillPoints"),
          lineStyle: record("lineStyle"),
          strokePoints: record("strokePoints"),
          lineBetween: record("lineBetween"),
          setPosition: record("setPosition"),
          setDepth: record("setDepth"),
          destroy: () => {
            d.destroyed++;
          },
        };
        return g;
      },
    },
    tweens: { add: (config) => tweens.push(config as Record<string, unknown>) },
  };
  const live = () => made.filter((d) => d.destroyed === 0);
  const fx = new RiposteFx(scene);
  return { fx, made, live, tweens };
}

/** Every colour a drawn object was given. */
const colours = (d: Drawn) =>
  d.calls
    .filter((c) => c.method === "lineStyle" || c.method === "fillStyle")
    .map((c) => (c.method === "lineStyle" ? c.args[1] : c.args[0]));

const charges = (
  current: number,
  kind: ResourceState["kind"] = "parry_charges",
) => ({
  resource: { kind, current, max: 3, ability_cost: 0 },
});

describe("riposteArmed (FS-MAMHR §E.23, §G.33)", () => {
  it("should be armed when the latest state shows 3 parry charges", () => {
    expect(riposteArmed(charges(3))).toBe(true);
  });

  it.each([0, 1, 2])("should not be armed at %i parry charges", (n) => {
    expect(riposteArmed(charges(n))).toBe(false);
  });

  it.each([
    ["stamina at 3 (another class's pool)", charges(3, "stamina")],
    ["mana at 3", charges(3, "mana")],
    ["no resource on the wire", {}],
    ["no state", undefined],
    ["out of the delve's state", null],
  ])("should not be armed with %s", (_, me) => {
    expect(riposteArmed(me)).toBe(false);
  });
});

describe("RIPOSTE_SHAPE (FS-MAMHR §E.23)", () => {
  it("should match the server's riposte: a 240° arc, 90 px of reach", () => {
    expect(RIPOSTE_SHAPE.arc).toBeCloseTo(240 * DEG);
    expect(RIPOSTE_SHAPE.reach).toBe(90);
  });

  it("should read clearly bigger than the cut: wider, longer and a heavier band", () => {
    expect(RIPOSTE_SHAPE.arc).toBeGreaterThan(3 * CUT_SHAPE.arc);
    expect(RIPOSTE_SHAPE.reach).toBeGreaterThan(CUT_SHAPE.reach);
    expect(RIPOSTE_SHAPE.width ?? BAND_WIDTH).toBeGreaterThan(
      CUT_SHAPE.width ?? BAND_WIDTH,
    );
  });
});

describe("RiposteFx riposte slice (FS-MAMHR §G.33)", () => {
  it("should lay the wide band on the ground toward the cursor, projected, in tokens only", () => {
    const f = fake();
    const toward = { x: 400, y: 260 };
    f.fx.play(me, toward);
    expect(f.made).toHaveLength(1);
    const [slice] = f.made;
    const projected = swordArc(me, toward, RIPOSTE_SHAPE).map((p) =>
      worldToScreen(p.x, p.y),
    );
    expect(slice.last("fillPoints")?.[0]).toEqual(projected);
    expect(colours(slice)).toContain(BARROW_HEX.vellum);
    for (const c of colours(slice))
      expect(Object.values(BARROW_HEX)).toContain(c);
  });

  it("should cut a brighter, heavier lip than the cut's 1.5 px", () => {
    const f = fake();
    f.fx.play(me, { x: 400, y: 200 });
    const lips = f.made[0].calls
      .filter((c) => c.method === "lineStyle")
      .map((c) => c.args[0] as number);
    expect(Math.max(...lips)).toBeGreaterThan(1.5);
  });

  it.each([
    ["aimed south-east, a target on the aim", { x: 400, y: 300 }, 45, 89],
    [
      "aimed north-west, a target near the arc's end",
      { x: 200, y: 100 },
      -20,
      85,
    ],
    [
      "aimed north, a target behind the merc's shoulder",
      { x: 300, y: 100 },
      20,
      85,
    ],
  ])(
    "should draw over the merc and over any target in its reach (%s)",
    (_, toward, deg, r) => {
      const f = fake();
      f.fx.play(me, toward);
      const target = {
        x: me.x + Math.cos(deg * DEG) * r,
        y: me.y + Math.sin(deg * DEG) * r,
      };
      const depth = f.made[0].last("setDepth")?.[0] as number;
      expect(depth).toBeGreaterThan(worldDepth(me.x, me.y, 2));
      expect(depth).toBeGreaterThan(worldDepth(target.x, target.y, 2));
    },
  );

  it("should fade out on an allowed easing, longer than the cut, then go", () => {
    const f = fake();
    f.fx.play(me, { x: 400, y: 200 });
    expect(f.tweens).toHaveLength(1);
    const t = f.tweens[0];
    expect(t.alpha).toEqual({ from: 1, to: 0 });
    expect(t.duration).toBe(RIPOSTE_MS);
    expect(RIPOSTE_MS).toBeGreaterThan(CUT_MS);
    expect(t.ease).toMatch(/^(Linear|(Sine|Quad|Cubic)\.ease(In|Out|InOut))$/);
    expect(f.live()).toHaveLength(1);
    (t.onComplete as () => void)();
    expect(f.live()).toHaveLength(0);
  });

  it("should take a live slice down with the run, and stay down when its fade completes after", () => {
    const f = fake();
    f.fx.play(me, { x: 400, y: 200 });
    f.fx.forget();
    expect(f.live()).toHaveLength(0);
    expect(() => (f.tweens[0].onComplete as () => void)()).not.toThrow();
    f.fx.forget();
    expect(f.made[0].destroyed).toBeGreaterThanOrEqual(1);
  });
});

describe("RiposteFx armed tell (FS-MAMHR §G.34)", () => {
  it("should show the tell while the latest state shows 3 parry charges", () => {
    const f = fake();
    f.fx.sync(charges(3), 0);
    expect(f.fx.armedShown).toBe(true);
    expect(f.live().length).toBeGreaterThan(0);
  });

  it("should clear the tell when the count drops, and raise it again at 3", () => {
    const f = fake();
    f.fx.sync(charges(3), 0);
    f.fx.sync(charges(0), 16);
    expect(f.fx.armedShown).toBe(false);
    expect(f.live()).toHaveLength(0);
    f.fx.sync(charges(3), 32);
    expect(f.fx.armedShown).toBe(true);
  });

  it("should not draw the tell twice while the count holds at 3", () => {
    const f = fake();
    f.fx.sync(charges(3), 0);
    const n = f.made.length;
    f.fx.sync(charges(3), 16);
    expect(f.made).toHaveLength(n);
  });

  it.each([
    ["below 3 parry charges", charges(2)],
    ["another class at 3 of its pool", charges(3, "stamina")],
    ["no resource on the wire", {}],
  ])("should draw nothing %s", (_, state) => {
    const f = fake();
    f.fx.sync(state, 0);
    f.fx.follow(me, 0);
    expect(f.made).toHaveLength(0);
  });

  it("should take the tell down when the merc is gone from the state (escaped)", () => {
    const f = fake();
    f.fx.sync(charges(3), 0);
    f.fx.sync(null, 16);
    expect(f.fx.armedShown).toBe(false);
  });

  it("should draw it in tokens only, with a vellum glint", () => {
    const f = fake();
    f.fx.sync(charges(3), 0);
    const all = f.live().flatMap(colours);
    expect(all).toContain(BARROW_HEX.vellum);
    for (const c of all) expect(Object.values(BARROW_HEX)).toContain(c);
  });

  it("should stand at the merc's feet as the merc moves, over the figure, below the stance tell's chest", () => {
    const f = fake();
    f.fx.sync(charges(3), 0);
    const moved = { x: 340, y: 230 };
    f.fx.follow(moved, 10);
    const s = worldToScreen(moved.x, moved.y);
    for (const d of f.live()) {
      expect(d.last("setDepth")?.[0] as number).toBeGreaterThan(
        worldDepth(moved.x, moved.y, 2),
      );
      const [, y] = d.last("setPosition") as number[];
      expect(y).toBeGreaterThan(s.y - BLADE_LIFT);
      expect(y).toBeLessThanOrEqual(s.y);
    }
  });

  it("should run the glint along the blade, hilt to point, and again", () => {
    const hilt = glintAt(0);
    const mid = glintAt(ARMED_GLINT_MS / 2);
    const point = glintAt(ARMED_GLINT_MS - 1);
    expect(mid).not.toEqual(hilt);
    expect(point.y).toBeGreaterThan(mid.y); // the point is carried low
    expect(glintAt(ARMED_GLINT_MS)).toEqual(hilt);
  });

  it("should move the glint frame to frame while the tell is up", () => {
    const f = fake();
    f.fx.sync(charges(3), 1000);
    f.fx.follow(me, 1000);
    const at = () => f.live().map((d) => d.last("setPosition"));
    const before = at();
    f.fx.follow(me, 1000 + ARMED_GLINT_MS / 2);
    expect(at()).not.toEqual(before);
  });

  it("should take the tell down with the run, and raise it afresh from the next state", () => {
    const f = fake();
    f.fx.sync(charges(3), 0);
    f.fx.forget();
    expect(f.live()).toHaveLength(0);
    expect(f.fx.armedShown).toBe(false);
    f.fx.sync(charges(3), 16);
    expect(f.fx.armedShown).toBe(true);
  });
});
