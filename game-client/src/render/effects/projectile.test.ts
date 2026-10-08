import { beforeEach, describe, expect, it } from "vitest";
import { worldToScreen } from "@/render/iso/projection";
import { worldDepth } from "@/render/iso/shapes";
import { ARROW_FLIGHT } from "./arrow";
import { fakeArt, fakeLights, fakeScene, type FakeObject } from "./fakeScene";
import { FIREBALL_FLIGHT } from "./fireball";
import { ProjectileFlights, type Sighting } from "./projectile";
import { EffectsRuntime } from "./runtime";
import { EFFECTS } from "./table";

const kindOf = (type: string) =>
  type === "arrow" ? ARROW_FLIGHT : FIREBALL_FLIGHT;

function fireball(id: string, x: number, y: number): Sighting {
  return {
    entity_id: id,
    projectile_type: "fireball",
    position: { x, y },
    velocity: { vx: 300, vy: 0 },
  };
}
function arrow(id: string, x: number, y: number, vx = 0, vy = 400): Sighting {
  return {
    entity_id: id,
    projectile_type: "arrow",
    position: { x, y },
    velocity: { vx, vy },
  };
}

describe("projectile flights (FS-KYPQ9 §E.2, §E.3, §F.2–§F.4, §B.9)", () => {
  let fake: ReturnType<typeof fakeScene>;
  let lights: ReturnType<typeof fakeLights>;
  let fx: EffectsRuntime;
  let flights: ProjectileFlights;
  const warnings: string[] = [];

  const images = (frame: string) =>
    fake.made.filter((m) => m.kind === "image" && m.args[3] === frame);
  const emitters = (frame: string) =>
    fake.made.filter(
      (m) =>
        m.kind === "particles" &&
        (m.args[3] as { frame: string[] }).frame.includes(frame),
    );
  const streams = () =>
    fake.made.filter(
      (m) =>
        m.kind === "particles" && (m.args[3] as { emitting: boolean }).emitting,
    );

  beforeEach(() => {
    fake = fakeScene();
    lights = fakeLights();
    warnings.length = 0;
    const logger = { warn: (m: string) => warnings.push(m) };
    fx = new EffectsRuntime(fake.scene, fakeArt, lights.lights, logger);
    flights = new ProjectileFlights(fake.scene, fakeArt, fx, kindOf, logger);
  });

  describe("flight", () => {
    it("should draw the baked fire core at the projectile's footprint, chest layer, as today", () => {
      flights.sync([fireball("f1", 300, 200)]);
      const [core] = images("fx_fire_core/idle/0/0");
      const s = worldToScreen(300, 200);
      expect(core.calls.setPosition).toEqual([s.x, s.y]);
      expect(core.calls.setDepth).toEqual([worldDepth(300, 200, 5)]);
    });

    it("should move the core, its trail and its riding light every tick", () => {
      flights.sync([fireball("f1", 300, 200)]);
      flights.sync([fireball("f1", 320, 200)]);
      const [core] = images("fx_fire_core/idle/0/0");
      const s = worldToScreen(320, 200);
      expect(core.calls.setPosition).toEqual([s.x, s.y]);
      expect(core.calls.setDepth).toEqual([worldDepth(320, 200, 5)]);
      const [light] = lights.alive();
      expect([light.light.x, light.light.y]).toEqual([s.x, s.y]);
      expect(light.spec.color).toBeDefined();
    });

    it("should ride one ember light on the fireball and stamp none for the arrow", () => {
      flights.sync([fireball("f1", 300, 200), arrow("a1", 100, 100)]);
      expect(lights.alive()).toHaveLength(1);
      expect(lights.alive()[0].spec.radius).toBe(
        EFFECTS.fireballTrail.light.radius,
      );
    });

    it("should draw the baked arrow rotated to the projected velocity, as today", () => {
      flights.sync([arrow("a1", 100, 100, 400, 0)]);
      const [shaft] = images("fx_arrow/idle/0/0");
      const h = worldToScreen(400, 0);
      expect(shaft.calls.setRotation).toEqual([Math.atan2(h.y, h.x)]);
    });

    it("should keep the arrow's last heading when a tick carries no velocity", () => {
      flights.sync([arrow("a1", 100, 100, 400, 0)]);
      flights.sync([{ ...arrow("a1", 110, 100), velocity: { vx: 0, vy: 0 } }]);
      const [shaft] = images("fx_arrow/idle/0/0");
      const h = worldToScreen(400, 0);
      expect(shaft.calls.setRotation).toEqual([Math.atan2(h.y, h.x)]);
    });

    it("should never scale or tween the fireball core or the arrow", () => {
      flights.sync([fireball("f1", 300, 200), arrow("a1", 100, 100)]);
      for (let i = 1; i < 10; i++)
        flights.sync([
          fireball("f1", 300 + i * 10, 200),
          arrow("a1", 100, 100 + i * 10),
        ]);
      const bodies = [
        ...images("fx_fire_core/idle/0/0"),
        ...images("fx_arrow/idle/0/0"),
      ];
      expect(bodies).toHaveLength(2);
      for (const body of bodies) expect(body.calls.setScale).toBeUndefined();
      // nothing in flight is tweened at all: no pulse, no yoyo
      expect(fake.tweens).toEqual([]);
    });

    it("should give each projectile one trail, emitting at most one particle per 40 ms", () => {
      const triple = [
        fireball("f1", 300, 200),
        fireball("f2", 300, 210),
        fireball("f3", 300, 220),
      ];
      flights.sync(triple);
      for (let i = 1; i < 30; i++)
        flights.sync(
          triple.map((p) => ({
            ...p,
            position: { x: p.position.x + i, y: p.position.y },
          })),
        );
      const trails = streams();
      expect(trails).toHaveLength(3);
      for (const t of trails) {
        const config = t.args[3] as { frequency: number; quantity: number };
        expect(config.frequency).toBeGreaterThanOrEqual(40);
        expect(config.quantity).toBe(1);
      }
    });

    it("should stream the trail out behind the projected heading, from where the projectile is first drawn", () => {
      flights.sync([arrow("a1", 100, 100, 400, 0)]);
      const [trail] = emitters("fx_dust/idle/0/0");
      const h = worldToScreen(400, 0);
      const back = (Math.atan2(-h.y, -h.x) * 180) / Math.PI;
      const { angle } = trail.args[3] as {
        angle: { min: number; max: number };
      };
      expect((angle.min + angle.max) / 2).toBeCloseTo(back);
      const s = worldToScreen(100, 100);
      expect(trail.calls.startFollow?.[0]).toEqual({ x: s.x, y: s.y });
    });

    it("should play no cast or release on first sight (a rival's projectile flies, lights and lands only)", () => {
      flights.sync([fireball("rival", 300, 200), arrow("rival2", 100, 100)]);
      // the cast's inward gather and the release's shimmer are absent
      expect(
        fake.made.some(
          (m) => m.kind === "particles" && "moveToX" in (m.args[3] as object),
        ),
      ).toBe(false);
      expect(images("fx_glow/idle/0/0")).toEqual([]);
    });
  });

  describe("impact", () => {
    it("should play one fireball impact at the last world position when the id leaves state", () => {
      flights.sync([fireball("f1", 300, 200)]);
      flights.sync([fireball("f1", 340, 200)]);
      flights.sync([]);
      const [flare] = images("fx_glow/idle/0/0");
      const s = worldToScreen(340, 200);
      expect(flare.calls.setPosition).toEqual([s.x, s.y]);
      expect(images("fx_scorch/idle/0/0")).toHaveLength(1);
      // the core is gone; the impact's flare, embers and scorch play on
      expect(images("fx_fire_core/idle/0/0")[0].destroyed).toBe(true);
      // the trail's last embers burn out over their life rather than popping at the impact
      expect(streams().some((t) => t.destroyed)).toBe(false);
      fake.timers
        .find((t) => t.delay === EFFECTS.fireballTrail.timing.lifeMs)!
        .fire();
      expect(streams().every((t) => t.destroyed)).toBe(true);
      expect(flights.tracked()).toBe(0);
    });

    it("should play one arrow impact puff when the arrow leaves state", () => {
      flights.sync([arrow("a1", 100, 100)]);
      flights.sync([]);
      const puffs = fake.made.filter(
        (m) =>
          m.kind === "particles" &&
          !(m.args[3] as { emitting: boolean }).emitting,
      );
      expect(puffs).toHaveLength(1);
      const s = worldToScreen(100, 100);
      expect(puffs[0].calls.setPosition).toEqual([s.x, s.y]);
      expect(lights.added).toEqual([]);
    });

    it("should hand the riding light over to the impact light, which decays and is removed", () => {
      flights.sync([fireball("f1", 300, 200)]);
      const [riding] = lights.added;
      flights.sync([]);
      expect(riding.removed).toBe(true);
      const decay = lights.alive();
      expect(decay).toHaveLength(1);
      expect(decay[0].spec.intensity).toBe(
        EFFECTS.lightDecay.light.intensity.from,
      );
      expect(decay[0].spec.intensity).toBeGreaterThan(riding.spec.intensity);
      for (const t of fake.timers) t.fire();
      expect(lights.alive()).toEqual([]);
      expect(fake.live()).toEqual([]);
    });
  });

  describe("lifecycle (edge states)", () => {
    it("should give a projectile seen for a single tick its light, removed cleanly, and one impact", () => {
      flights.sync([fireball("once", 500, 500)]);
      expect(lights.alive()).toHaveLength(1);
      flights.sync([]);
      expect(lights.added[0].removed).toBe(true);
      expect(images("fx_scorch/idle/0/0")).toHaveLength(1);
      expect(images("fx_glow/idle/0/0")).toHaveLength(1);
      flights.sync([]);
      expect(images("fx_scorch/idle/0/0")).toHaveLength(1);
      for (const t of fake.timers) t.fire();
      expect(lights.alive()).toEqual([]);
      expect(fake.live()).toEqual([]);
    });

    it("should play no impact and leave nothing tracked when cleared mid-flight", () => {
      flights.sync([fireball("f1", 300, 200), arrow("a1", 100, 100)]);
      const before = fake.made.length;
      flights.clear();
      expect(fake.made.length).toBe(before);
      expect(fake.live()).toEqual([]);
      expect(lights.alive()).toEqual([]);
      expect(flights.tracked()).toBe(0);
      expect(fx.playing()).toBe(0);
      // a state after the clear sees nothing to land
      flights.sync([]);
      expect(fake.made.length).toBe(before);
    });

    it("should draw no body and log once when a projectile sheet is missing", () => {
      const missing = { ...fakeArt, has: (n: string) => n !== "fx_arrow" };
      const f = new ProjectileFlights(fake.scene, missing, fx, kindOf, {
        warn: (m: string) => warnings.push(m),
      });
      f.sync([arrow("a1", 100, 100), arrow("a2", 120, 100)]);
      f.sync([arrow("a1", 110, 100), arrow("a2", 130, 100)]);
      expect(images("fx_arrow/idle/0/0")).toEqual([]);
      expect(warnings.filter((w) => w.includes("fx_arrow"))).toHaveLength(1);
      // never back to drawn circles: nothing but the runtime's own trail
      expect(fake.made.every((m: FakeObject) => m.kind === "particles")).toBe(
        true,
      );
    });
  });
});
