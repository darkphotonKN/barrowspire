import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { worldToScreen } from "@/render/iso/projection";
import { BARROW_HEX } from "@/utils/theme";
import { fakeArt, fakeLights, fakeScene } from "./fakeScene";
import {
  FIREBALL_EFFECTS,
  FIREBALL_FLIGHT,
  HAND_LIFT,
  playFireballCast,
  playFireballImpact,
} from "./fireball";
import { alongAim } from "./projectile";
import { EffectsRuntime } from "./runtime";
import { EFFECTS, type EffectEntry, type Token } from "./table";

/** Every colour token an entry uses, across its channels. */
function tokensOf(entry: EffectEntry): Token[] {
  return [
    ...(entry.sprite?.tint ?? []),
    ...(entry.particles?.tint ?? []),
    ...(entry.light ? [entry.light.color] : []),
    ...(entry.tint ? [entry.tint.color] : []),
  ];
}

describe("sorcerer fireball (FS-KYPQ9 §E)", () => {
  let fake: ReturnType<typeof fakeScene>;
  let lights: ReturnType<typeof fakeLights>;
  let fx: EffectsRuntime;
  const me = { x: 200, y: 200 };
  const target = { x: 400, y: 200 };

  beforeEach(() => {
    fake = fakeScene();
    lights = fakeLights();
    fx = new EffectsRuntime(fake.scene, fakeArt, lights.lights, {
      warn: () => {},
    });
  });

  describe("cast (§E.1)", () => {
    it("should draw a few embers in toward the casting hand over the table's 160 ms", () => {
      playFireballCast(fx, "self", me, target);
      const gather = fake.made.find((m) => m.kind === "particles")!;
      const config = gather.args[3] as {
        lifespan: number;
        moveToX: number;
        alpha: { start: number; end: number };
        frame: string[];
      };
      expect(EFFECTS.fireballCast.timing.durationMs).toBe(160);
      expect(config.lifespan).toBe(160);
      expect(config.moveToX).toBe(0);
      expect(config.frame).toEqual(["fx_ember/idle/0/0"]);
      // brightening as they come in
      expect(config.alpha.end).toBeGreaterThan(config.alpha.start);
      const [count] = gather.calls.emitParticle as [number];
      expect(count).toBeLessThanOrEqual(EFFECTS.fireballCast.particles.count);
      // at the casting hand: along the aim, and lifted off the feet to hand height
      const at = alongAim(me, target, 15);
      const hand = worldToScreen(at.x, at.y);
      expect(gather.calls.setPosition).toEqual([hand.x, hand.y - HAND_LIFT]);
      expect(HAND_LIFT).toBeGreaterThanOrEqual(30);
    });

    it("should light the caster with ember for 200 ms, then remove the light", () => {
      playFireballCast(fx, "self", me, target);
      expect(lights.added).toHaveLength(1);
      const [cast] = lights.added;
      const s = worldToScreen(me.x, me.y);
      expect([cast.spec.x, cast.spec.y]).toEqual([s.x, s.y]);
      expect(cast.spec.color).toBe(BARROW_HEX.ember);
      expect(fake.timers.map((t) => t.delay).sort()).toEqual([160, 200]);
      for (const t of fake.timers) t.fire();
      expect(lights.alive()).toEqual([]);
      expect(fake.live()).toEqual([]);
    });

    it("should flash nothing: no scale tween, no sprite", () => {
      playFireballCast(fx, "self", me, target);
      expect(fake.made.some((m) => m.kind === "image")).toBe(false);
      for (const t of fake.tweens) expect(t.config.scale).toBeUndefined();
    });
  });

  describe("impact (§E.3)", () => {
    const at = { x: 330, y: 260 };

    it("should flare for 120 ms, decay the light over 500 ms, drop embers for 600 ms and fade the scorch over 1200 ms", () => {
      playFireballImpact(fx, "f1", at);
      expect(fake.timers.map((t) => t.delay).sort((a, b) => a - b)).toEqual([
        120, 500, 600, 1200,
      ]);
      const scorch = fake.made.find(
        (m) => m.kind === "image" && m.args[3] === "fx_scorch/idle/0/0",
      )!;
      expect(scorch.calls.setTint).toEqual([
        BARROW_HEX.pitch,
        BARROW_HEX.barrowDeep,
        BARROW_HEX.pitch,
        BARROW_HEX.barrowDeep,
      ]);
      // on the ground: inside the plane pair
      expect(fake.made.filter((m) => m.kind === "container")).toHaveLength(2);
    });

    it("should let at most 8 embers fall under gravity", () => {
      playFireballImpact(fx, "f1", at);
      const embers = fake.made.find((m) => m.kind === "particles")!;
      const [count] = embers.calls.emitParticle as [number];
      expect(count).toBeLessThanOrEqual(8);
      const config = embers.args[3] as {
        accelerationY: number;
        lifespan: number;
      };
      expect(config.accelerationY).toBeGreaterThan(0);
      expect(config.lifespan).toBe(600);
    });

    it("should jump the light up, decay it to nothing and remove it after 500 ms", () => {
      playFireballImpact(fx, "f1", at);
      expect(lights.added).toHaveLength(1);
      const [decay] = lights.added;
      expect(decay.spec.intensity).toBeGreaterThan(
        EFFECTS.fireballTrail.light.intensity.from,
      );
      const tween = fake.tweens.find((t) => t.config.targets === decay.light)!;
      expect(tween.config).toMatchObject({
        duration: 500,
        intensity: { to: 0 },
      });
      fake.timers.find((t) => t.delay === 500)!.fire();
      expect(decay.removed).toBe(true);
    });

    it("should flare and drop its embers at the flight height, where the fireball was last drawn", () => {
      playFireballImpact(fx, "f1", at);
      const s = worldToScreen(at.x, at.y);
      const flare = fake.made.find(
        (m) => m.kind === "image" && m.args[3] === "fx_glow/idle/0/0",
      )!;
      expect(flare.calls.setPosition).toEqual([s.x, s.y - HAND_LIFT]);
      const embers = fake.made.find((m) => m.kind === "particles")!;
      expect(embers.calls.setPosition).toEqual([s.x, s.y - HAND_LIFT]);
    });

    it("should mark the scorch on the ground and pool the light at the footprint, under the flame", () => {
      playFireballImpact(fx, "f1", at);
      const s = worldToScreen(at.x, at.y);
      // the scorch's plane pair sits unlifted (+ 0 folds the root's -0 from `-lift`)
      for (const plane of fake.made.filter((m) => m.kind === "container"))
        expect((plane.args as number[]).slice(0, 2).map((v) => v + 0)).toEqual([
          0, 0,
        ]);
      const [decay] = lights.added;
      expect([decay.spec.x, decay.spec.y]).toEqual([s.x, s.y]);
    });

    it("should leave nothing once the scorch has faded", () => {
      playFireballImpact(fx, "f1", at);
      for (const t of fake.timers) t.fire();
      expect(fake.live()).toEqual([]);
      expect(lights.alive()).toEqual([]);
    });
  });

  describe("flight (§E.2)", () => {
    it("should fly the baked fire core, unturned, trailing embers and smoke with a riding light", () => {
      expect(FIREBALL_FLIGHT.body).toBe("fx_fire_core");
      expect(FIREBALL_FLIGHT.turns).toBe(false);
      // flies at the casting hand's height, where the cast gathered, not out of the feet
      expect(FIREBALL_FLIGHT.lift).toBe(HAND_LIFT);
      const trail: EffectEntry = EFFECTS[FIREBALL_FLIGHT.trail];
      expect(trail.timing).toMatchObject({ kind: "stream", lifeMs: 300 });
      expect(
        trail.timing.kind === "stream" && trail.timing.intervalMs,
      ).toBeGreaterThanOrEqual(40);
      expect(trail.particles?.texture).toEqual(["fx_ember", "fx_smoke"]);
      expect(trail.light?.color).toBe("ember");
    });
  });

  describe("palette (§B.7)", () => {
    it("should play only fire tokens, and never the amber accent", () => {
      const fire: Token[] = ["ember", "amberBright", "barrowDeep", "pitch"];
      for (const name of FIREBALL_EFFECTS)
        for (const token of tokensOf(EFFECTS[name]))
          expect(fire).toContain(token);
    });

    it("should name no amber key and no colour literal in its source", () => {
      const src = readFileSync(join(__dirname, "fireball.ts"), "utf8");
      expect(src).not.toMatch(/["'`]amber["'`]/);
      expect(src).not.toMatch(/0x[0-9a-fA-F]{6}|#[0-9a-fA-F]{6}/);
    });
  });
});
