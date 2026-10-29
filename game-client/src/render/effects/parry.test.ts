import { describe, expect, it } from "vitest";
import { worldToScreen } from "@/render/iso/projection";
import { worldDepth } from "@/render/iso/shapes";
import { BARROW_HEX } from "@/utils/theme";
import {
  BLADE_LIFT,
  PARRY_FLASH_MS,
  PARRY_TELL_GRACE_MS,
  ParryFx,
  type ParryGraphics,
  type ParryScene,
} from "./parry";

const me = { x: 300, y: 200 };

interface Drawn {
  calls: { method: string; args: unknown[] }[];
  destroyed: boolean;
  last(method: string): unknown[] | undefined;
}

function fake() {
  const made: Drawn[] = [];
  const tweens: Record<string, unknown>[] = [];
  const scene: ParryScene = {
    add: {
      graphics: () => {
        const d: Drawn = {
          calls: [],
          destroyed: false,
          last: (method) => [...d.calls].reverse().find((c) => c.method === method)?.args,
        };
        made.push(d);
        const record =
          (method: string) =>
          (...args: unknown[]) => {
            d.calls.push({ method, args });
            return g;
          };
        const g: ParryGraphics = {
          fillStyle: record("fillStyle"),
          fillPoints: record("fillPoints"),
          lineStyle: record("lineStyle"),
          lineBetween: record("lineBetween"),
          setPosition: record("setPosition"),
          setDepth: record("setDepth"),
          destroy: () => {
            d.destroyed = true;
          },
        };
        return g;
      },
    },
    tweens: { add: (config) => tweens.push(config as Record<string, unknown>) },
  };
  const live = () => made.filter((d) => !d.destroyed);
  const fx = new ParryFx(scene);
  return { fx, made, live, tweens };
}

/** The merc's own state, as the broadcast carries the parry fields. */
const wire = (parry_open: boolean, parries = 0) => ({ parry_open, parries });

describe("ParryFx stance tell (FS-MAMHR req 35)", () => {
  it("should draw nothing before a click or an open stance", () => {
    const f = fake();
    f.fx.sync(wire(false), 0);
    f.fx.follow(me, 0);
    expect(f.made).toHaveLength(0);
    expect(f.fx.stanceShown).toBe(false);
  });

  it("should show the tell from the click, before the server has answered", () => {
    const f = fake();
    f.fx.raise(1000);
    expect(f.fx.stanceShown).toBe(true);
    expect(f.live()).toHaveLength(1);
  });

  it("should draw it in tokens only: a slate blade with a vellum glint", () => {
    const f = fake();
    f.fx.raise(1000);
    const [tell] = f.live();
    const colours = tell.calls
      .filter((c) => c.method === "lineStyle" || c.method === "fillStyle")
      .map((c) => (c.method === "lineStyle" ? c.args[1] : c.args[0]));
    expect(colours).toContain(BARROW_HEX.slateLight);
    expect(colours).toContain(BARROW_HEX.vellum);
    for (const c of colours) expect(Object.values(BARROW_HEX)).toContain(c);
  });

  it("should hold for as long as the server reports the stance open, and clear when it closes", () => {
    const f = fake();
    f.fx.raise(1000);
    f.fx.sync(wire(true), 1050);
    f.fx.sync(wire(true), 1250);
    f.fx.follow(me, 1300); // past the grace: the server's word is what holds it
    expect(f.fx.stanceShown).toBe(true);
    f.fx.sync(wire(false), 1320);
    expect(f.fx.stanceShown).toBe(false);
    expect(f.live()).toHaveLength(0);
  });

  it("should not drop the tell on a closed stance the server reports before it has seen the click", () => {
    const f = fake();
    f.fx.raise(1000);
    f.fx.sync(wire(false), 1016);
    expect(f.fx.stanceShown).toBe(true);
  });

  it("should drop the tell after the grace when the server never opened the stance", () => {
    const f = fake();
    f.fx.raise(1000);
    f.fx.follow(me, 1000 + PARRY_TELL_GRACE_MS - 1);
    expect(f.fx.stanceShown).toBe(true);
    f.fx.follow(me, 1000 + PARRY_TELL_GRACE_MS);
    expect(f.fx.stanceShown).toBe(false);
    expect(f.live()).toHaveLength(0);
  });

  it("should show the tell for an open stance it never saw clicked (a reconnect mid-window)", () => {
    const f = fake();
    f.fx.sync(wire(true), 0);
    expect(f.fx.stanceShown).toBe(true);
  });

  it("should take the tell down when the merc is gone from the state (escaped)", () => {
    const f = fake();
    f.fx.raise(1000);
    f.fx.sync(wire(true), 1050);
    f.fx.sync(null, 1100);
    expect(f.fx.stanceShown).toBe(false);
  });

  it("should raise again on the next click once a stance has closed", () => {
    const f = fake();
    f.fx.raise(1000);
    f.fx.sync(wire(true), 1050);
    f.fx.sync(wire(false), 1300);
    f.fx.raise(1400);
    f.fx.sync(wire(false), 1416);
    expect(f.fx.stanceShown).toBe(true);
  });

  it("should stand the tell at the merc's chest as the merc moves, over the figure", () => {
    const f = fake();
    f.fx.raise(1000);
    const moved = { x: 340, y: 230 };
    f.fx.follow(moved, 1010);
    const [tell] = f.live();
    const s = worldToScreen(moved.x, moved.y);
    expect(tell.last("setPosition")).toEqual([s.x, s.y - BLADE_LIFT]);
    expect(tell.last("setDepth")?.[0] as number).toBeGreaterThan(worldDepth(moved.x, moved.y, 2));
  });
});

describe("ParryFx parry flash (FS-MAMHR req 36)", () => {
  const flashes = (f: ReturnType<typeof fake>) => f.tweens.length;

  it("should flash nothing on the first state: it sets the baseline", () => {
    const f = fake();
    f.fx.sync(wire(false, 4), 0);
    expect(flashes(f)).toBe(0);
  });

  it("should flash once when parries rises, and not while it holds", () => {
    const f = fake();
    f.fx.sync(wire(false, 0), 0);
    f.fx.sync(wire(true, 1), 16);
    expect(flashes(f)).toBe(1);
    f.fx.sync(wire(true, 1), 32);
    expect(flashes(f)).toBe(1);
  });

  it("should flash on every rise at 3 parry charges, where the charge count does not move", () => {
    const f = fake();
    f.fx.sync(wire(false, 3), 0);
    f.fx.sync(wire(true, 4), 16);
    f.fx.sync(wire(true, 5), 32);
    expect(flashes(f)).toBe(2);
  });

  it("should take the first state after a reconnect as a new baseline", () => {
    const f = fake();
    f.fx.sync(wire(false, 2), 0);
    f.fx.forget();
    f.fx.sync(wire(false, 5), 16);
    expect(flashes(f)).toBe(0);
    f.fx.sync(wire(false, 6), 32);
    expect(flashes(f)).toBe(1);
  });

  it("should never flash for a state with no parries (another class)", () => {
    const f = fake();
    f.fx.sync({}, 0);
    f.fx.sync({}, 16);
    expect(flashes(f)).toBe(0);
  });

  it("should play a short, bright flash in tokens: vellum, growing a little as it fades, then gone", () => {
    const f = fake();
    f.fx.follow(me, 0);
    f.fx.sync(wire(false, 0), 0);
    f.fx.sync(wire(false, 1), 16); // the stance shut on this state: the flash alone is drawn
    const [flash] = f.live();
    expect(flash.calls.some((c) => c.method === "fillStyle" && c.args[0] === BARROW_HEX.vellum)).toBe(true);
    const t = f.tweens[0];
    expect(t.alpha).toEqual({ from: 1, to: 0 });
    const scale = t.scale as { from: number; to: number };
    expect(scale.to).toBeGreaterThan(scale.from);
    expect(scale.to).toBeLessThanOrEqual(1.6);
    expect(t.duration).toBe(PARRY_FLASH_MS);
    expect(PARRY_FLASH_MS).toBeLessThanOrEqual(250);
    expect(t.ease).toMatch(/^(Linear|(Sine|Quad|Cubic)\.ease(In|Out|InOut))$/);
    (t.onComplete as () => void)();
    expect(f.live()).toHaveLength(0);
  });

  it("should flash at the merc's chest and follow the merc for its short life", () => {
    const f = fake();
    f.fx.follow(me, 0);
    f.fx.sync(wire(false, 0), 0);
    f.fx.sync(wire(false, 1), 16); // the stance shut on this state: the flash alone is drawn
    const [flash] = f.live();
    const s = worldToScreen(me.x, me.y);
    expect(flash.last("setPosition")).toEqual([s.x, s.y - BLADE_LIFT]);
    const moved = { x: 320, y: 210 };
    f.fx.follow(moved, 40);
    const m = worldToScreen(moved.x, moved.y);
    expect(flash.last("setPosition")).toEqual([m.x, m.y - BLADE_LIFT]);
    expect(flash.last("setDepth")?.[0] as number).toBeGreaterThan(worldDepth(moved.x, moved.y, 2));
  });
});

describe("ParryFx teardown", () => {
  it("should take the tell and every live flash down with the run (forget destroys what it tracks)", () => {
    const f = fake();
    f.fx.follow(me, 0);
    f.fx.sync(wire(false, 0), 0);
    f.fx.raise(10);
    f.fx.sync(wire(true, 1), 16); // the stance open and a flash in flight
    expect(f.live()).toHaveLength(2);
    f.fx.forget();
    expect(f.live()).toHaveLength(0);
    expect(f.fx.stanceShown).toBe(false);
  });

  it("should leave a flash down when its fade completes after the run is gone", () => {
    const f = fake();
    f.fx.sync(wire(false, 0), 0);
    f.fx.sync(wire(false, 1), 16);
    f.fx.forget();
    const destroys = () => f.made.filter((d) => d.destroyed).length;
    const before = destroys();
    (f.tweens[0].onComplete as () => void)();
    expect(destroys()).toBe(before);
    expect(f.live()).toHaveLength(0);
  });

  it("should raise the tell afresh after forget, from the next click", () => {
    const f = fake();
    f.fx.raise(1000);
    f.fx.forget();
    f.fx.raise(2000);
    expect(f.fx.stanceShown).toBe(true);
    expect(f.live()).toHaveLength(1);
  });
});
