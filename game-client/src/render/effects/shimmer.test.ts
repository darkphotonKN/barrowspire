import { describe, expect, it, vi } from "vitest";
import { worldToScreen, type Point } from "@/render/iso/projection";
import { worldDepth } from "@/render/iso/shapes";
import { BARROW_HEX } from "@/utils/theme";
import { fakeArt, fakeLights } from "./fakeScene";
import type { EffectsScene, FxArt } from "./runtime";
import {
  HEAL_LOOK,
  SHIMMER_CROWN_FALLBACK,
  SHIMMER_GRANTED_MS,
  SHIMMER_INVOKED_MS,
  ShimmerFx,
  type Look,
} from "./shimmer";

// FS-KZC92 §A, §B, §D: the granted base, against a fake scene, as the parry tests do.

interface Obj {
  kind: "image" | "container";
  args: unknown[];
  destroyed: boolean;
  /** The last arguments of each method called on it. */
  calls: Record<string, unknown[]>;
  children: Obj[];
}

interface Tween {
  config: Record<string, unknown>;
  stopped: boolean;
}

interface Timer {
  delay: number;
  removed: boolean;
  fire(): void;
}

const CHAINED = [
  "setOrigin",
  "setTint",
  "setAlpha",
  "setScale",
  "setRotation",
  "setDepth",
  "setPosition",
  "setBlendMode",
  "setVisible",
];

function stage() {
  const made: Obj[] = [];
  const tweens: Tween[] = [];
  const timers: Timer[] = [];
  const handles = new Map<unknown, Obj>();

  const obj = (kind: Obj["kind"], args: unknown[]) => {
    const record: Obj = {
      kind,
      args,
      destroyed: false,
      calls: {},
      children: [],
    };
    made.push(record);
    const o: Record<string, unknown> = {
      destroy: () => {
        record.destroyed = true;
        for (const c of record.children) c.destroyed = true;
      },
      add: (child: unknown) => {
        const list = Array.isArray(child) ? child : [child];
        for (const c of list) record.children.push(handles.get(c) as Obj);
        return o;
      },
    };
    for (const m of CHAINED)
      o[m] = (...a: unknown[]) => {
        record.calls[m] = a;
        return o;
      };
    handles.set(o, record);
    return o;
  };

  const scene = {
    add: {
      image: (...a: unknown[]) => obj("image", a),
      container: (...a: unknown[]) => obj("container", a),
      particles: () => {
        throw new Error("a shimmer emits no particles");
      },
    },
    tweens: {
      add: (config: Record<string, unknown>) => {
        const t: Tween = { config, stopped: false };
        tweens.push(t);
        return {
          stop: () => {
            t.stopped = true;
          },
        };
      },
    },
    time: {
      delayedCall: (delay: number, fire: () => void) => {
        const t = { delay, fire, removed: false };
        timers.push(t);
        return {
          remove: () => {
            t.removed = true;
          },
        };
      },
    },
  };

  const lights = fakeLights();
  const frameOf = (o: Obj) => String(o.args[3] ?? "");
  const images = (sheet: string) =>
    made.filter(
      (o) => o.kind === "image" && frameOf(o).startsWith(`${sheet}/`),
    );
  /** The glint containers: each holds one fx_glint and its fx_mote core. */
  const glints = () =>
    made.filter(
      (o) =>
        o.kind === "container" &&
        o.children.some((c) => frameOf(c).startsWith("fx_glint/")),
    );
  const targetOf = (t: Tween) => handles.get(t.config.targets);

  return {
    scene: scene as unknown as EffectsScene,
    made,
    tweens,
    timers,
    lights,
    images,
    glints,
    targetOf,
    live: () => made.filter((m) => !m.destroyed),
  };
}

/** A small seeded generator, so a test sees a spread of values and not one pinned point. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const AT: Point = { x: 300, y: 220 };
const FIGURE = worldDepth(AT.x, AT.y, 1);
const LEGS = worldDepth(AT.x, AT.y, 2);
const quiet = { warn: () => {} };

function shimmer(
  opts: {
    random?: () => number;
    art?: FxArt;
    logger?: { warn: () => void };
  } = {},
) {
  const s = stage();
  const fx = new ShimmerFx(s.scene, opts.art ?? fakeArt, s.lights.lights, {
    random: opts.random ?? seeded(7),
    logger: opts.logger ?? quiet,
  });
  return { ...s, fx };
}

/** The glint's offset from the feet, in screen px: its position inside its layer. */
const offsetOf = (g: Obj) => g.calls.setPosition as [number, number];

describe("ShimmerFx granted base (FS-KZC92 §B)", () => {
  it.each([
    ["seeded", seeded(7)],
    ["another seed", seeded(91)],
    ["pinned low", () => 0],
    ["pinned high", () => 0.999999],
    ["pinned mid", () => 0.5],
  ])(
    "should make exactly 16 glints inside the body bounds (%s, R5, R6)",
    (_name, random) => {
      const { fx, glints, images } = shimmer({ random });
      fx.playGranted(HEAL_LOOK, 80);

      expect(glints()).toHaveLength(16);
      expect(images("fx_glint")).toHaveLength(16);
      expect(images("fx_mote")).toHaveLength(16);
      for (const g of glints()) {
        const [x, y] = offsetOf(g);
        const h = -y;
        expect(h).toBeGreaterThanOrEqual(0.05 * 80 - 1e-9);
        expect(h).toBeLessThanOrEqual(1.05 * 80 + 1e-9);
        const half = 18 * (1 - Math.abs(h / 80 - 0.55) * 0.6);
        expect(Math.abs(x)).toBeLessThanOrEqual(half + 1e-9);
      }
    },
  );

  it("should fall back to a 76 px crown when the sheet has none (R6)", () => {
    expect(SHIMMER_CROWN_FALLBACK).toBe(76);
    const { fx, glints } = shimmer({ random: () => 0.999999 });
    fx.playGranted(HEAL_LOOK, undefined);
    const tallest = Math.max(...glints().map((g) => -offsetOf(g)[1]));
    expect(tallest).toBeCloseTo(1.05 * 76, 3);
  });

  it("should spread the glints evenly through 760 ms, jittered by at most 30 ms (R5)", () => {
    const { fx, tweens, glints, targetOf } = shimmer();
    fx.playGranted(HEAL_LOOK, 80);
    const order = glints();
    const starts = order.map((g) => {
      const t = tweens.find((tw) => targetOf(tw) === g && "alpha" in tw.config);
      return t?.config.delay as number;
    });
    starts.forEach((start, i) => {
      expect(start).toBeGreaterThanOrEqual(0);
      expect(Math.abs(start - (i / 16) * 760)).toBeLessThanOrEqual(30 + 1e-9);
    });
  });

  it("should wink each glint: alpha up over half its life and back, scale only growing (R7, R9)", () => {
    const { fx, tweens, glints, targetOf } = shimmer();
    fx.playGranted(HEAL_LOOK, 80);
    for (const g of glints()) {
      const own = tweens.filter((tw) => targetOf(tw) === g);
      const wink = own.find((tw) => "alpha" in tw.config)!;
      const motion = own.find((tw) => "scale" in tw.config)!;
      const life = motion.config.duration as number;
      expect(life).toBeGreaterThanOrEqual(260);
      expect(life).toBeLessThanOrEqual(360);

      expect(wink.config.alpha).toEqual({ from: 0, to: 1 });
      expect(wink.config.yoyo).toBe(true);
      expect(wink.config.duration).toBeCloseTo(life / 2, 6);
      expect(wink.config.delay).toBe(motion.config.delay);
      expect(g.calls.setAlpha).toEqual([0]);

      const scale = motion.config.scale as { from: number; to: number };
      const size = scale.to;
      expect(size).toBeGreaterThanOrEqual(0.45);
      expect(size).toBeLessThanOrEqual(0.85);
      expect(scale.from).toBeCloseTo(0.6 * size, 9);
      expect(motion.config.ease).toBe("Linear");

      const y = motion.config.y as { from: number; to: number };
      const rise = y.from - y.to;
      expect(rise).toBeGreaterThanOrEqual(4);
      expect(rise).toBeLessThanOrEqual(10);
      const turn = motion.config.rotation as { from: number; to: number };
      expect(Math.abs(turn.to - turn.from)).toBeLessThanOrEqual(0.5);
    }
  });

  it("should never shrink a scale nor yoyo one, and ease only in the allowlist (R9, FS-KYPQ9 §B.3, §B.4)", () => {
    const { fx, tweens } = shimmer();
    fx.playGranted(HEAL_LOOK, 80);
    expect(tweens.length).toBeGreaterThan(0);
    for (const t of tweens) {
      expect(String(t.config.ease)).toMatch(
        /^(Linear|(Sine|Quad|Cubic)\.(easeIn|easeOut|easeInOut))$/,
      );
      const scale = t.config.scale as { from: number; to: number } | undefined;
      if (!scale) continue;
      expect(scale.to).toBeGreaterThanOrEqual(scale.from);
      expect(t.config.yoyo).toBeFalsy();
    }
  });

  it("should burn glints and motes brighter where they overlap (R22)", () => {
    const { fx, images } = shimmer();
    fx.playGranted(HEAL_LOOK, 80);
    for (const img of [...images("fx_glint"), ...images("fx_mote")])
      expect(img.calls.setBlendMode).toEqual(["ADD"]);
  });

  it("should send 70% of the glints in front of the figure and 30% behind it (R6, R24)", () => {
    const front = shimmer({ random: () => 0.69 });
    front.fx.playGranted(HEAL_LOOK, 80);
    front.fx.follow(AT);
    const behind = shimmer({ random: () => 0.7 });
    behind.fx.playGranted(HEAL_LOOK, 80);
    behind.fx.follow(AT);

    const layerOf = (s: ReturnType<typeof shimmer>, g: Obj) =>
      s.made.find((o) => o.children.includes(g))!;
    for (const g of front.glints())
      expect(layerOf(front, g).calls.setDepth[0]).toBeGreaterThan(LEGS);
    for (const g of behind.glints())
      expect(layerOf(behind, g).calls.setDepth[0]).toBeLessThan(FIGURE);
  });

  it("should glow softly at the feet, on the ground, under the figure (R8, R24)", () => {
    const { fx, images, tweens, targetOf, made } = shimmer();
    fx.playGranted(HEAL_LOOK, 80);
    fx.follow(AT);
    const glows = images("fx_glow");
    expect(glows).toHaveLength(1);
    const [glow] = glows;
    expect(glow.calls.setTint).toEqual([BARROW_HEX.oxblood]);
    expect(glow.calls.setPosition).toEqual([AT.x, AT.y]);

    const wink = tweens.filter((t) => targetOf(t) === glow);
    expect(wink).toHaveLength(1);
    expect(wink[0].config).toMatchObject({
      alpha: { from: 0, to: 0.7 },
      yoyo: true,
      duration: 420,
      ease: "Sine.easeInOut",
    });

    // laid on the world plane: its root sorts under the figure
    const root = made.find(
      (o) =>
        o.kind === "container" &&
        o.calls.setDepth &&
        o.children.some((c) => c.children.includes(glow)),
    )!;
    expect(root.calls.setDepth[0]).toBeLessThan(FIGURE);
  });

  it("should cast one short-lived light at mid-body, fading over 900 ms (R11)", () => {
    const { fx, lights, tweens } = shimmer();
    fx.playGranted(HEAL_LOOK, 80);
    fx.follow(AT);
    expect(lights.added).toHaveLength(1);
    const [{ spec, light }] = lights.added;
    expect(spec).toMatchObject({
      radius: 110,
      intensity: 0.7,
      color: BARROW_HEX.oxblood,
    });
    const s = worldToScreen(AT.x, AT.y);
    expect([light.x, light.y]).toEqual([s.x, s.y - 40]);
    expect(light.hidden).toBe(false);

    const fade = tweens.find((t) => t.config.targets === light)!;
    expect(fade.config).toMatchObject({
      intensity: { from: 0.7, to: 0 },
      duration: 900,
      ease: "Sine.easeIn",
    });
  });

  it("should take every object and its light down by 1150 ms (R12)", () => {
    expect(SHIMMER_GRANTED_MS).toBe(1150);
    const { fx, tweens, timers, live, lights } = shimmer();
    fx.playGranted(HEAL_LOOK, 80);

    // every glint has lived out its life before the end
    for (const t of tweens) {
      const delay = (t.config.delay as number | undefined) ?? 0;
      const span = (t.config.duration as number) * (t.config.yoyo ? 2 : 1);
      expect(delay + span).toBeLessThanOrEqual(SHIMMER_GRANTED_MS);
    }

    expect(timers).toHaveLength(1);
    expect(timers[0].delay).toBe(SHIMMER_GRANTED_MS);
    timers[0].fire();
    expect(live()).toEqual([]);
    expect(lights.alive()).toEqual([]);
    expect(tweens.every((t) => t.stopped)).toBe(true);
    expect(fx.playing).toBe(0);
  });
});

describe("ShimmerFx look (FS-KZC92 §A)", () => {
  it("should be health's red: oxbloodText glints, vellum cores, oxblood light (R4)", () => {
    expect(HEAL_LOOK).toEqual({
      glint: "oxbloodText",
      centre: "vellum",
      light: "oxblood",
    });
  });

  it("should draw in the look's three colours and no other (R3)", () => {
    const look: Look = { glint: "arcane", centre: "vellum", light: "necrotic" };
    const { fx, made, lights, images } = shimmer();
    fx.playGranted(look, 80);
    const allowed = [look.glint, look.centre, look.light].map(
      (k) => BARROW_HEX[k],
    );
    for (const o of made)
      for (const c of (o.calls.setTint ?? []) as number[])
        expect(allowed).toContain(c);
    for (const g of images("fx_glint"))
      expect(g.calls.setTint).toEqual([BARROW_HEX.arcane]);
    for (const m of images("fx_mote"))
      expect(m.calls.setTint).toEqual([BARROW_HEX.vellum]);
    expect(lights.added[0].spec.color).toBe(BARROW_HEX.necrotic);
  });
});

describe("ShimmerFx follow, stacking and teardown (FS-KZC92 §D)", () => {
  it("should stand at the figure's drawn feet and move with it (R23)", () => {
    const { fx, made, glints, lights, images } = shimmer();
    fx.playGranted(HEAL_LOOK, 80);
    const layers = () =>
      made.filter((o) => glints().some((g) => o.children.includes(g)));

    // not drawn yet: nothing placed and the light kept dark (Edge States)
    for (const l of layers()) expect(l.calls.setPosition).toBeUndefined();
    expect(lights.added[0].light.hidden).toBe(true);

    for (const at of [AT, { x: AT.x + 40, y: AT.y - 25 }]) {
      fx.follow(at);
      const s = worldToScreen(at.x, at.y);
      for (const l of layers()) expect(l.calls.setPosition).toEqual([s.x, s.y]);
      expect(images("fx_glow")[0].calls.setPosition).toEqual([at.x, at.y]);
      const { light } = lights.added[0];
      expect([light.x, light.y]).toEqual([s.x, s.y - 40]);
    }
  });

  it.each([
    ["granted", (fx: ShimmerFx) => fx.playGranted(HEAL_LOOK, 80)],
    ["invoked", (fx: ShimmerFx) => fx.playInvoked(HEAL_LOOK, 80)],
  ])(
    "should show nothing of a %s shimmer until the figure is first drawn, then all of it (Edge States)",
    (_base, play) => {
      const { fx, made, tweens } = shimmer();
      play(fx);
      // the tweens run a while before any follow: no glint or mote may wink in at the origin
      for (const t of tweens)
        (t.config.onUpdate as (() => void) | undefined)?.();
      const roots = made.filter(
        (o) => !made.some((p) => p.children.includes(o)),
      );
      expect(roots.length).toBeGreaterThan(0);
      for (const r of roots) expect(r.calls.setVisible).toEqual([false]);

      fx.follow(AT);
      for (const r of roots) expect(r.calls.setVisible).toEqual([true]);
    },
  );

  it("should show a shimmer started after the figure was drawn at once", () => {
    const { fx, made } = shimmer();
    fx.follow(AT);
    fx.playInvoked(HEAL_LOOK, 80);
    for (const o of made) expect(o.calls.setVisible ?? [true]).toEqual([true]);
  });

  it("should place a shimmer started after the figure was drawn at once", () => {
    const { fx, made, glints } = shimmer();
    fx.follow(AT);
    fx.playGranted(HEAL_LOOK, 80);
    const s = worldToScreen(AT.x, AT.y);
    for (const l of made.filter((o) =>
      glints().some((g) => o.children.includes(g)),
    ))
      expect(l.calls.setPosition).toEqual([s.x, s.y]);
  });

  it("should never tint the figure: it only draws objects of its own (R10)", () => {
    const { fx, made } = shimmer();
    fx.playGranted(HEAL_LOOK, 80);
    fx.follow(AT);
    // it is never handed the figure: every tint it sets is on an image of its own
    const tinted = made.filter((o) => o.calls.setTint);
    expect(tinted.length).toBeGreaterThan(0);
    expect(tinted.every((o) => o.kind === "image")).toBe(true);
  });

  it("should play two shimmers started together, both in full (R25)", () => {
    const { fx, glints, timers, lights, live } = shimmer();
    fx.playGranted(HEAL_LOOK, 80);
    fx.playGranted(HEAL_LOOK, 80);
    expect(glints()).toHaveLength(32);
    expect(lights.alive()).toHaveLength(2);
    expect(fx.playing).toBe(2);

    timers[0].fire();
    expect(fx.playing).toBe(1);
    expect(lights.alive()).toHaveLength(1);
    expect(glints().filter((g) => !g.destroyed)).toHaveLength(16);

    timers[1].fire();
    expect(live()).toEqual([]);
  });

  it("should take every live shimmer down at once on forget (R26)", () => {
    const { fx, timers, lights, live, tweens } = shimmer();
    fx.follow(AT);
    fx.playGranted(HEAL_LOOK, 80);
    fx.playGranted(HEAL_LOOK, 80);
    fx.forget();

    expect(live()).toEqual([]);
    expect(lights.alive()).toEqual([]);
    expect(tweens.every((t) => t.stopped)).toBe(true);
    expect(timers.every((t) => t.removed)).toBe(true);
    expect(fx.playing).toBe(0);

    // a late end timer is harmless, and the next shimmer waits for a fresh follow
    timers[0].fire();
    fx.playGranted(HEAL_LOOK, 80);
    expect(lights.added[2].light.hidden).toBe(true);
  });
});

describe("ShimmerFx without its sheets (FS-KZC92 R27)", () => {
  it.each(["fx_glint", "fx_mote", "fx_glow"])(
    "should play nothing and log once with %s missing",
    (sheet) => {
      const logger = { warn: vi.fn() };
      const art: FxArt = { ...fakeArt, has: (name) => name !== sheet };
      const { fx, made, lights, timers } = shimmer({ art, logger });
      fx.playGranted(HEAL_LOOK, 80);
      fx.playGranted(HEAL_LOOK, 80);

      expect(made).toEqual([]);
      expect(lights.added).toEqual([]);
      expect(timers).toEqual([]);
      expect(fx.playing).toBe(0);
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(String(logger.warn.mock.calls[0][0])).toContain(sheet);
    },
  );
});

describe("ShimmerFx invoked base (FS-KZC92 §C)", () => {
  /** The spiral's motes: fx_mote images standing on their own, not a glint's core. */
  const motesOf = (s: ReturnType<typeof shimmer>) =>
    s
      .images("fx_mote")
      .filter((m) => !s.made.some((o) => o.children.includes(m)));

  it.each([
    ["seeded", seeded(7)],
    ["pinned low", () => 0],
    ["pinned high", () => 0.999999],
  ])(
    "should make 14 motes, 6 head glints, one ring and one light, all gone by 1200 ms (%s, R13–R18)",
    (_name, random) => {
      expect(SHIMMER_INVOKED_MS).toBe(1200);
      const s = shimmer({ random });
      s.fx.playInvoked(HEAL_LOOK, 80);

      expect(motesOf(s)).toHaveLength(14);
      expect(s.glints()).toHaveLength(6);
      expect(s.images("fx_ring")).toHaveLength(1);
      expect(s.lights.added).toHaveLength(1);

      for (const t of s.tweens) {
        const delay = (t.config.delay as number | undefined) ?? 0;
        const span = (t.config.duration as number) * (t.config.yoyo ? 2 : 1);
        expect(delay + span).toBeLessThanOrEqual(SHIMMER_INVOKED_MS);
      }
      expect(s.timers).toHaveLength(1);
      expect(s.timers[0].delay).toBe(SHIMMER_INVOKED_MS);
      s.timers[0].fire();
      expect(s.live()).toEqual([]);
      expect(s.lights.alive()).toEqual([]);
      expect(s.tweens.every((t) => t.stopped)).toBe(true);
      expect(s.fx.playing).toBe(0);
    },
  );

  /** The climb tweens, in the order the motes were made: strand by strand, lead first. */
  const climbs = (s: ReturnType<typeof shimmer>) =>
    s.tweens.filter((t) => "t" in t.config);
  /** Moves a mote's climb to progress `t`, as a frame of its tween would. */
  const climbTo = (tw: Tween, t: number) => {
    (tw.config.targets as { t: number }).t = t;
    (tw.config.onUpdate as () => void)();
  };

  it("should wind two strands of seven up the body, lagged 45 ms a mote, over 820 ms (R13)", () => {
    const s = shimmer();
    s.fx.playInvoked(HEAL_LOOK, 80);
    s.fx.follow(AT);
    const feet = worldToScreen(AT.x, AT.y);
    const motes = motesOf(s);
    const tw = climbs(s);
    expect(tw).toHaveLength(14);

    tw.forEach((climb, n) => {
      const strand = Math.floor(n / 7);
      const k = n % 7;
      expect(climb.config).toMatchObject({
        t: { from: 0, to: 1 },
        delay: k * 45,
        duration: 820,
        ease: "Sine.easeInOut",
      });
      for (const t of [0.15, 0.4, 0.5, 0.75]) {
        climbTo(climb, t);
        const angle = strand * Math.PI + t * 3.2 * Math.PI;
        const radius = 20 * (1 - 0.45 * t);
        const [x, y] = motes[n].calls.setPosition as [number, number];
        expect(x).toBeCloseTo(feet.x + Math.cos(angle) * radius, 9);
        expect(y).toBeCloseTo(
          feet.y - t * (80 + 4) + Math.sin(angle) * radius * 0.5,
          9,
        );
      }
    });
  });

  it("should pass in front of the figure while sin(angle) > 0, and behind it at 0.55 (R14, R24)", () => {
    const s = shimmer();
    s.fx.playInvoked(HEAL_LOOK, 80);
    s.fx.follow(AT);
    const motes = motesOf(s);
    let seen = { front: 0, behind: 0 };
    climbs(s).forEach((climb, n) => {
      const strand = Math.floor(n / 7);
      for (let t = 0.12; t < 0.8; t += 0.04) {
        climbTo(climb, t);
        const front = Math.sin(strand * Math.PI + t * 3.2 * Math.PI) > 0;
        const [depth] = motes[n].calls.setDepth as [number];
        const [alpha] = motes[n].calls.setAlpha as [number];
        if (front) {
          seen.front++;
          expect(depth).toBeGreaterThan(LEGS);
          expect(alpha).toBeCloseTo(1, 9);
        } else {
          seen.behind++;
          expect(depth).toBeLessThan(FIGURE);
          expect(alpha).toBeCloseTo(0.55, 9);
        }
      }
    });
    expect(seen.front).toBeGreaterThan(0);
    expect(seen.behind).toBeGreaterThan(0);
  });

  it("should fade a mote in over the first tenth of its climb and out over its last fifth (R14)", () => {
    const s = shimmer();
    s.fx.playInvoked(HEAL_LOOK, 80);
    s.fx.follow(AT);
    const [mote] = motesOf(s);
    const [climb] = climbs(s);
    expect(mote.calls.setAlpha).toBeDefined();
    const alphaAt = (t: number) => {
      climbTo(climb, t);
      const side = Math.sin(t * 3.2 * Math.PI) > 0 ? 1 : 0.55;
      return (mote.calls.setAlpha[0] as number) / side;
    };
    expect(alphaAt(0)).toBeCloseTo(0, 9);
    expect(alphaAt(0.05)).toBeCloseTo(0.5, 9);
    expect(alphaAt(0.1)).toBeCloseTo(1, 9);
    expect(alphaAt(0.5)).toBeCloseTo(1, 9);
    expect(alphaAt(0.8)).toBeCloseTo(1, 9);
    expect(alphaAt(0.9)).toBeCloseTo(0.5, 9);
    expect(alphaAt(1)).toBeCloseTo(0, 9);
  });

  it("should hold each mote at a fixed scale: the lead 0.75, the trail 0.6 − 0.06 k (R14)", () => {
    const s = shimmer();
    s.fx.playInvoked(HEAL_LOOK, 80);
    motesOf(s).forEach((m, n) => {
      const k = n % 7;
      expect(m.calls.setScale[0]).toBeCloseTo(k === 0 ? 0.75 : 0.6 - 0.06 * k, 9);
      expect(m.calls.setBlendMode).toEqual(["ADD"]);
      expect(s.tweens.some((t) => s.targetOf(t) === m)).toBe(false);
    });
  });

  it("should open a soft ring at the feet, on the ground, under the figure (R15, R24)", () => {
    const s = shimmer();
    s.fx.playInvoked(HEAL_LOOK, 80);
    s.fx.follow(AT);
    const [ring] = s.images("fx_ring");
    expect(ring.calls.setTint).toEqual([BARROW_HEX.oxbloodText]);
    expect(ring.calls.setPosition).toEqual([AT.x, AT.y]);
    expect(ring.calls.setScale).toEqual([0.35]);
    expect(ring.calls.setAlpha).toEqual([0.8]);

    const own = s.tweens.filter((t) => s.targetOf(t) === ring);
    expect(own.map((t) => t.config)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scale: { from: 0.35, to: 0.75 },
          duration: 700,
          ease: "Sine.easeOut",
        }),
        expect.objectContaining({
          alpha: { from: 0.8, to: 0 },
          duration: 700,
          ease: "Quad.easeIn",
        }),
      ]),
    );
    const root = s.made.find(
      (o) =>
        o.kind === "container" &&
        o.calls.setDepth &&
        o.children.some((c) => c.children.includes(ring)),
    )!;
    expect(root.calls.setDepth[0]).toBeLessThan(FIGURE);
  });

  it.each([
    ["seeded", seeded(7)],
    ["pinned low", () => 0],
    ["pinned high", () => 0.999999],
  ])(
    "should break six glints at the head as the strands arrive (%s, R16)",
    (_name, random) => {
      const s = shimmer({ random });
      s.fx.playInvoked(HEAL_LOOK, 80);
      s.fx.follow(AT);
      s.glints().forEach((g, i) => {
        const [x, y] = offsetOf(g);
        expect(Math.abs(x)).toBeLessThanOrEqual(14 + 1e-9);
        expect(-y).toBeGreaterThanOrEqual(80 - 6 - 1e-9);
        expect(-y).toBeLessThanOrEqual(80 + 10 + 1e-9);

        const own = s.tweens.filter((t) => s.targetOf(t) === g);
        const wink = own.find((t) => "alpha" in t.config)!;
        const motion = own.find((t) => "scale" in t.config)!;
        expect(wink.config.delay).toBe(740 + i * 35);
        expect(motion.config.delay).toBe(740 + i * 35);
        const life = motion.config.duration as number;
        expect(life).toBeGreaterThanOrEqual(220);
        expect(life).toBeLessThanOrEqual(280);
        expect(wink.config).toMatchObject({
          alpha: { from: 0, to: 1 },
          yoyo: true,
          duration: life / 2,
        });

        const layer = s.made.find((o) => o.children.includes(g))!;
        expect(layer.calls.setDepth[0]).toBeGreaterThan(LEGS);
      });
    },
  );

  it("should cast one short-lived light at mid-body, fading over 1120 ms (R17)", () => {
    const s = shimmer();
    s.fx.playInvoked(HEAL_LOOK, 80);
    s.fx.follow(AT);
    const [{ spec, light }] = s.lights.added;
    expect(spec).toMatchObject({
      radius: 120,
      intensity: 0.7,
      color: BARROW_HEX.oxblood,
    });
    const at = worldToScreen(AT.x, AT.y);
    expect([light.x, light.y]).toEqual([at.x, at.y - 40]);
    const fade = s.tweens.find((t) => t.config.targets === light)!;
    expect(fade.config).toMatchObject({
      intensity: { from: 0.7, to: 0 },
      duration: 1120,
      ease: "Sine.easeIn",
    });
  });

  it("should never shrink a scale nor yoyo one, and ease only in the allowlist (FS-KYPQ9 §B.3, §B.4)", () => {
    const s = shimmer();
    s.fx.playInvoked(HEAL_LOOK, 80);
    for (const t of s.tweens) {
      expect(String(t.config.ease)).toMatch(
        /^(Linear|(Sine|Quad|Cubic)\.(easeIn|easeOut|easeInOut))$/,
      );
      const scale = t.config.scale as { from: number; to: number } | undefined;
      if (!scale) continue;
      expect(scale.to).toBeGreaterThanOrEqual(scale.from);
      expect(t.config.yoyo).toBeFalsy();
    }
  });

  it("should take any look, and draw in its three colours and no other (R3)", () => {
    const look: Look = { glint: "arcane", centre: "vellum", light: "necrotic" };
    const s = shimmer();
    s.fx.playInvoked(look, 80);
    const allowed = [look.glint, look.centre, look.light].map(
      (k) => BARROW_HEX[k],
    );
    for (const o of s.made)
      for (const c of (o.calls.setTint ?? []) as number[])
        expect(allowed).toContain(c);
    expect(s.images("fx_ring")[0].calls.setTint).toEqual([BARROW_HEX.arcane]);
    expect(s.lights.added[0].spec.color).toBe(BARROW_HEX.necrotic);
  });

  it("should follow the figure's feet, its motes, ring and light with it (R23)", () => {
    const s = shimmer();
    s.fx.playInvoked(HEAL_LOOK, 80);
    const [climb] = climbs(s);
    const [mote] = motesOf(s);
    climbTo(climb, 0.5);
    // not drawn yet: the mote waits unplaced and the light stays dark (Edge States)
    expect(mote.calls.setPosition).toBeUndefined();
    expect(s.lights.added[0].light.hidden).toBe(true);

    for (const at of [AT, { x: AT.x + 40, y: AT.y - 25 }]) {
      s.fx.follow(at);
      const feet = worldToScreen(at.x, at.y);
      const angle = 0.5 * 3.2 * Math.PI;
      const radius = 20 * (1 - 0.45 * 0.5);
      const [x, y] = mote.calls.setPosition as [number, number];
      expect(x).toBeCloseTo(feet.x + Math.cos(angle) * radius, 9);
      expect(y).toBeCloseTo(
        feet.y - 0.5 * 84 + Math.sin(angle) * radius * 0.5,
        9,
      );
      expect(s.images("fx_ring")[0].calls.setPosition).toEqual([at.x, at.y]);
      const { light } = s.lights.added[0];
      expect([light.x, light.y]).toEqual([feet.x, feet.y - 40]);
    }
  });

  it("should stack beside a granted shimmer and go down with it on forget (R25, R26)", () => {
    const s = shimmer();
    s.fx.follow(AT);
    s.fx.playInvoked(HEAL_LOOK, 80);
    s.fx.playInvoked(HEAL_LOOK, 80);
    s.fx.playGranted(HEAL_LOOK, 80);
    expect(s.fx.playing).toBe(3);
    expect(motesOf(s)).toHaveLength(28);
    expect(s.lights.alive()).toHaveLength(3);

    s.fx.forget();
    expect(s.live()).toEqual([]);
    expect(s.lights.alive()).toEqual([]);
    expect(s.tweens.every((t) => t.stopped)).toBe(true);
    expect(s.timers.every((t) => t.removed)).toBe(true);
    expect(s.fx.playing).toBe(0);
  });

  it.each(["fx_glint", "fx_mote", "fx_ring"])(
    "should play nothing and log once with %s missing (R27)",
    (sheet) => {
      const logger = { warn: vi.fn() };
      const art: FxArt = { ...fakeArt, has: (name) => name !== sheet };
      const s = shimmer({ art, logger });
      s.fx.playInvoked(HEAL_LOOK, 80);
      s.fx.playInvoked(HEAL_LOOK, 80);

      expect(s.made).toEqual([]);
      expect(s.lights.added).toEqual([]);
      expect(s.timers).toEqual([]);
      expect(s.fx.playing).toBe(0);
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(String(logger.warn.mock.calls[0][0])).toContain(sheet);
    },
  );
});
