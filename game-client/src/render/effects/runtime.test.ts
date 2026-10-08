import { beforeEach, describe, expect, it, vi } from "vitest";
import { worldToScreen } from "@/render/iso/projection";
import { worldDepth } from "@/render/iso/shapes";
import { BARROW_HEX } from "@/utils/theme";
import type { TransientSpec } from "@/render/lighting/LightMap";
import { EffectsRuntime, type EffectsScene, type FxArt } from "./runtime";
import { EFFECTS } from "./table";

/** Every object the runtime made, so a test can see what is left standing. */
interface Made {
  kind: "image" | "container" | "particles";
  args: unknown[];
  destroyed: boolean;
  calls: Record<string, unknown[]>;
  /** Every method called on it, in order. */
  history: string[];
  /** The object itself, for plain properties the runtime sets (an emitter's `emitting`). */
  object: Record<string, unknown>;
  /** Particles only: fire one as a stream's frequency would, and where each live one draws. */
  emitter?: { tick(): void; drawn(): { x: number; y: number }[] };
}

/**
 * A particle emitter as Phaser 3.90 has it: each particle lives in the emitter's own space, so it
 * draws at the emitter's position plus its own. It is fired at the followed point (plus offset)
 * when there is one, else at the emitter's origin.
 */
function particleSpace(record: Made) {
  const pos = { x: 0, y: 0 };
  let follow: {
    target: { x: number; y: number };
    dx: number;
    dy: number;
  } | null = null;
  const live: { x: number; y: number }[] = [];
  const fire = (count = 1) => {
    for (let i = 0; i < count; i++)
      live.push(
        follow
          ? { x: follow.target.x + follow.dx, y: follow.target.y + follow.dy }
          : { x: 0, y: 0 },
      );
  };
  record.emitter = {
    tick: () => fire(1),
    drawn: () => live.map((p) => ({ x: pos.x + p.x, y: pos.y + p.y })),
  };
  return {
    setPosition: (x: number, y: number) => {
      pos.x = x;
      pos.y = y;
    },
    startFollow: (target: { x: number; y: number }, dx = 0, dy = 0) => {
      follow = { target, dx, dy };
    },
    emitParticle: (count?: number) => fire(count),
  };
}

function fakeScene() {
  const made: Made[] = [];
  const tweens: { config: Record<string, unknown>; stopped: boolean }[] = [];
  const timers: { delay: number; fire: () => void; removed: boolean }[] = [];
  const obj = (kind: Made["kind"], args: unknown[]) => {
    const record: Made = {
      kind,
      args,
      destroyed: false,
      calls: {},
      history: [],
      object: {},
    };
    made.push(record);
    const space = kind === "particles" ? particleSpace(record) : undefined;
    const o: Record<string, unknown> = {
      destroy: () => {
        record.destroyed = true;
      },
    };
    record.object = o;
    for (const m of [
      "setOrigin",
      "setTint",
      "setAlpha",
      "setScale",
      "setRotation",
      "setDepth",
      "setPosition",
      "add",
      "emitParticle",
      "startFollow",
    ])
      o[m] = (...a: unknown[]) => {
        record.calls[m] = a;
        record.history.push(m);
        (
          space?.[m as keyof typeof space] as
            | ((...args: unknown[]) => void)
            | undefined
        )?.(...a);
        return o;
      };
    return o;
  };
  const scene = {
    add: {
      image: (...a: unknown[]) => obj("image", a),
      container: (...a: unknown[]) => obj("container", a),
      particles: (...a: unknown[]) => obj("particles", a),
    },
    tweens: {
      add: (config: Record<string, unknown>) => {
        const t = { config, stopped: false };
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
  return {
    scene: scene as unknown as EffectsScene,
    made,
    tweens,
    timers,
    live: () => made.filter((m) => !m.destroyed),
  };
}

function fakeArt(missing: string[] = []): FxArt {
  return {
    has: (name) => !missing.includes(name),
    resolve: (name) => ({
      placeholder: false,
      texture: "art:fx-0",
      frame: `${name}/idle/0/0`,
      anchor: { x: 0.5, y: 0.5 },
    }),
  };
}

function fakeLights() {
  const added: {
    spec: TransientSpec;
    lifetimeMs?: number;
    removed: boolean;
    light: { x: number; y: number; intensity: number };
  }[] = [];
  return {
    added,
    lights: {
      addTransient: (spec: TransientSpec, lifetimeMs?: number) => {
        const rec = {
          spec,
          lifetimeMs,
          removed: false,
          light: { ...spec, flicker: 0, seed: 0, alive: true } as never,
        };
        const light = Object.assign(rec.light, {
          remove: () => {
            rec.removed = true;
          },
        });
        added.push(rec);
        return light;
      },
    },
  };
}

describe("EffectsRuntime (FS-KYPQ9 §B.8–§B.10)", () => {
  let fake: ReturnType<typeof fakeScene>;
  let lights: ReturnType<typeof fakeLights>;
  let warn: ReturnType<typeof vi.fn>;
  let fx: EffectsRuntime;
  const at = { x: 400, y: 240 };

  beforeEach(() => {
    fake = fakeScene();
    lights = fakeLights();
    warn = vi.fn();
    fx = new EffectsRuntime(fake.scene, fakeArt(), lights.lights, { warn });
  });

  it("should destroy every object, tween, timer and light of an owner on release(owner)", () => {
    fx.play("p1", "escape", at);
    fx.play("p1", "arrowTrail", at);
    fx.play("p2", "scorch", at);
    expect(fake.live().length).toBeGreaterThan(0);

    fx.release("p1");

    const p2Made = fake.made.filter((m) => !m.destroyed);
    expect(p2Made.length).toBeGreaterThan(0); // p2's scorch stays
    expect(fx.playing("p1")).toBe(0);
    expect(fx.playing("p2")).toBe(1);
    expect(lights.added.every((l) => l.removed)).toBe(true);
    fx.release("p2");
    expect(fake.live()).toEqual([]);
    expect(fake.tweens.every((t) => t.stopped)).toBe(true);
    expect(fake.timers.every((t) => t.removed)).toBe(true);
  });

  it("should destroy everything for every owner on clearAll()", () => {
    fx.play("self", "slash", at, { rotation: 0.4 });
    fx.play("e7", "fireballTrail", at);
    fx.play("hub", "chimneySmoke", at);
    fx.play("door-1", "entranceBreath", at);
    fx.clearAll();
    expect(fake.live()).toEqual([]);
    expect(fx.playing()).toBe(0);
    expect(fake.tweens.every((t) => t.stopped)).toBe(true);
    expect(lights.added.every((l) => l.removed)).toBe(true);
  });

  it("should play nothing when a sheet is missing, and log once per sheet", () => {
    fx = new EffectsRuntime(
      fake.scene,
      fakeArt(["fx_smoke", "fx_glow"]),
      lights.lights,
      { warn },
    );
    expect(fx.play("e1", "fireballTrail", at)).toBeNull();
    expect(fx.play("e2", "fireballTrail", at)).toBeNull();
    expect(fx.play("hub", "chimneySmoke", at)).toBeNull();
    expect(fake.made).toEqual([]);
    expect(lights.added).toEqual([]);
    expect(fx.playing()).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);

    expect(fx.play("door", "entranceBreath", at)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls.map((c) => c[1])).toEqual([
      { sheet: "fx_smoke" },
      { sheet: "fx_glow" },
    ]);
  });

  it("should tear a one-shot down by itself when its duration ends", () => {
    fx.play("self", "escape", at);
    expect(fake.timers.map((t) => t.delay)).toEqual([1000]);
    // the runtime's timer owns the light's removal; the light-map is given no second clock
    expect(lights.added[0].lifetimeMs).toBeUndefined();
    expect(lights.added[0].removed).toBe(false);
    fake.timers[0].fire();
    expect(fake.live()).toEqual([]);
    expect(lights.added[0].removed).toBe(true);
    expect(fx.playing("self")).toBe(0);
  });

  it("should draw upright effects at the projected point, sorted by footprint", () => {
    fx.play("self", "escape", at, { lift: 6 });
    const s = worldToScreen(at.x, at.y);
    const [column, motes] = fake.made;
    expect(column.kind).toBe("image");
    expect(column.calls.setPosition).toEqual([s.x, s.y - 6]);
    expect(column.calls.setDepth).toEqual([worldDepth(at.x, at.y)]);
    expect(column.calls.setTint).toEqual([
      BARROW_HEX.vellum,
      BARROW_HEX.vellumFaint,
      BARROW_HEX.vellum,
      BARROW_HEX.vellumFaint,
    ]);
    expect(motes.kind).toBe("particles");
    expect(motes.calls.setDepth).toEqual([worldDepth(at.x, at.y)]);
    expect(motes.calls.emitParticle).toEqual([EFFECTS.escape.particles.count]);
    expect(lights.added[0].spec).toMatchObject({
      x: s.x,
      y: s.y,
      color: BARROW_HEX.vellum,
    });
  });

  it("should lay ground effects on a world plane at their world position", () => {
    fx.play("self", "scorch", at, { layer: 0 });
    const image = fake.made.find((m) => m.kind === "image")!;
    const containers = fake.made.filter((m) => m.kind === "container");
    expect(containers).toHaveLength(2);
    expect(image.calls.setPosition).toEqual([at.x, at.y]);
    expect(
      containers.some((c) => c.calls.setDepth?.[0] === worldDepth(at.x, at.y)),
    ).toBe(true);
  });

  it("should tween a one-shot over its table duration and easing, never scaling past its range", () => {
    fx.play("self", "slash", at, { rotation: 1 });
    const [tween] = fake.tweens;
    expect(tween.config).toMatchObject({
      duration: 220,
      ease: "Quad.easeOut",
      alpha: { from: 1, to: 0 },
      scale: { from: 1, to: 1 },
    });
    expect(tween.config).not.toHaveProperty("yoyo");
    expect(tween.config).not.toHaveProperty("scaleX");
  });

  it("should breathe the entrance marker on alpha alone", () => {
    fx.play("door", "entranceBreath", at);
    const [tween] = fake.tweens;
    expect(tween.config).toMatchObject({
      alpha: { from: 0.55, to: 0.85 },
      duration: 1200,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
    expect(tween.config).not.toHaveProperty("scale");
    expect(fake.timers).toEqual([]);
  });

  it("should keep a stream until released, following its owner with its light", () => {
    const played = fx.play("e7", "fireballTrail", at, {
      direction: { x: 1, y: 0 },
      lift: 5,
    })!;
    expect(fake.timers).toEqual([]);
    const emitter = fake.made.find((m) => m.kind === "particles")!;
    const config = emitter.args[3] as Record<string, unknown>;
    expect(config).toMatchObject({
      emitting: true,
      frequency: 40,
      lifespan: 300,
    });
    // world +x runs down-right on screen; the trail streams out behind it, up-left
    const h = worldToScreen(1, 0);
    const back = (Math.atan2(-h.y, -h.x) * 180) / Math.PI;
    const angle = config.angle as { min: number; max: number };
    expect(angle.min).toBeCloseTo(back - 12);
    expect(angle.max).toBeCloseTo(back + 12);

    // fired at the projectile, chest high
    const s0 = worldToScreen(at.x, at.y);
    emitter.emitter!.tick();
    expect(emitter.emitter!.drawn()).toEqual([{ x: s0.x, y: s0.y - 5 }]);

    const next = { x: 440, y: 240 };
    played.moveTo(next);
    const s = worldToScreen(next.x, next.y);
    emitter.emitter!.tick();
    // the first particle is left where it was fired; the next fires at the new point
    expect(emitter.emitter!.drawn()).toEqual([
      { x: s0.x, y: s0.y - 5 },
      { x: s.x, y: s.y - 5 },
    ]);
    // a moved emitter would drag every live particle with it (§E.2, §F.2)
    expect(emitter.history).not.toContain("setPosition");
    expect(emitter.calls.setDepth).toEqual([worldDepth(next.x, next.y)]);
    expect(lights.added[0].light).toMatchObject({ x: s.x, y: s.y });
    expect(lights.added[0].lifetimeMs).toBeUndefined();

    played.stop();
    expect(lights.added[0].removed).toBe(true);
    fake.timers.find((t) => t.delay === 300)!.fire();
    expect(fake.live()).toEqual([]);
  });

  describe("a released stream (§E.3, §F.2)", () => {
    const emitterOf = () => fake.made.find((m) => m.kind === "particles")!;

    it("should stop a fading trail emitting, then let its particles finish their life", () => {
      fx.play("f1", "fireballTrail", at);
      const emitter = emitterOf();
      emitter.emitter!.tick();
      fx.release("f1");

      // no pop at the impact: the emitter stays, its live embers burn on, nothing new fires
      expect(emitter.destroyed).toBe(false);
      expect(emitter.object.emitting).toBe(false);
      expect(emitter.emitter!.drawn()).toHaveLength(1);
      // the riding light goes now, handed over to the impact's light
      expect(lights.added[0].removed).toBe(true);
      expect(fx.playing("f1")).toBe(0);

      const [linger] = fake.timers;
      expect(linger.delay).toBe(EFFECTS.fireballTrail.timing.lifeMs);
      linger.fire();
      expect(emitter.destroyed).toBe(true);
    });

    it("should cut a trail marked to die with what it follows", () => {
      fx.play("a1", "arrowTrail", at);
      fx.release("a1");
      expect(emitterOf().destroyed).toBe(true);
      expect(fake.timers).toEqual([]);
    });

    it("should cut a fading trail at once when released now (a reset)", () => {
      fx.play("f1", "fireballTrail", at);
      fx.release("f1", { now: true });
      expect(fake.live()).toEqual([]);
      expect(fake.timers).toEqual([]);
    });

    it("should still track a fading trail, so clearAll() or a later release now cuts it", () => {
      fx.play("f1", "fireballTrail", at);
      fx.play("f2", "fireballTrail", at);
      fx.release("f1");
      fx.release("f2");
      fx.release("f1", { now: true });
      expect(fake.made[0].destroyed).toBe(true);
      expect(fake.made[1].destroyed).toBe(false);
      fx.clearAll();
      expect(fake.live()).toEqual([]);
      expect(fake.timers.every((t) => t.removed)).toBe(true);
    });
  });

  it("should give each particle its own sheet's look, so smoke is never ember and embers never grow", () => {
    fx.play("f1", "fireballTrail", at);
    const config = fake.made.find((m) => m.kind === "particles")!.args[3] as {
      frame: string[];
      tint: { onEmit(p: unknown): number };
      scale: {
        onEmit(p: unknown): number;
        onUpdate(p: unknown, key: string, t: number, value: number): number;
      };
    };
    expect(config.frame).toEqual(["fx_ember/idle/0/0", "fx_smoke/idle/0/0"]);
    const ember = { frame: { name: "fx_ember/idle/0/0" } };
    const smoke = { frame: { name: "fx_smoke/idle/0/0" } };
    const fire = [BARROW_HEX.ember, BARROW_HEX.amberBright];
    for (let i = 0; i < 20; i++) {
      expect(fire).toContain(config.tint.onEmit(ember));
      expect(config.tint.onEmit(smoke)).toBe(BARROW_HEX.barrowDeep);
    }
    const { from, to } = EFFECTS.fireballTrail.particles.looks.fx_smoke.scale;
    expect(config.scale.onEmit(smoke)).toBe(from);
    expect(config.scale.onUpdate(smoke, "scaleX", 1, from)).toBeCloseTo(to);
    expect(config.scale.onUpdate(smoke, "scaleX", 0.5, from)).toBeGreaterThan(
      from,
    );
    expect(config.scale.onEmit(ember)).toBe(1);
    expect(config.scale.onUpdate(ember, "scaleX", 1, 1)).toBe(1);
  });

  it("should draw nothing for the hit, which the hit module applies as a tint", () => {
    expect(fx.play("self", "hit", at)).toBeNull();
    expect(fake.made).toEqual([]);
    expect(fx.playing()).toBe(0);
  });
});
