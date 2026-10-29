import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { worldToScreen } from "@/render/iso/projection";
import { BARROW_HEX } from "@/utils/theme";
import { ARROW_FLIGHT, BOW_LIFT, BOW_REACH } from "./arrow";
import { fakeArt, fakeLights, fakeScene } from "./fakeScene";
import { alongAim, ProjectileFlights } from "./projectile";
import { EffectsRuntime } from "./runtime";
import {
  playShadowShotImpact,
  playShadowShotRelease,
  SHADOW_SHOT_EFFECTS,
  SHADOW_SHOT_FLIGHT,
} from "./shadowShot";
import { EFFECTS, type EffectEntry, type Token } from "./table";

/** Every colour an entry draws, across its channels. */
function colorsOf(e: EffectEntry): Token[] {
  return [
    ...(e.sprite?.tint ?? []),
    ...(e.particles?.tint ?? []),
    ...Object.values(e.particles?.looks ?? {}).flatMap((l) => l.tint),
    ...(e.light ? [e.light.color] : []),
  ];
}

/** Particles a one-shot emits, or -1 for an entry without particles. */
function countOf(e: EffectEntry): number {
  return e.particles?.count ?? -1;
}

function durationOf(e: EffectEntry): number {
  return e.timing.kind === "oneShot" ? e.timing.durationMs : -1;
}

describe("Shadow Shot bolt (FS-JTNPR req 20–23)", () => {
  let fake: ReturnType<typeof fakeScene>;
  let lights: ReturnType<typeof fakeLights>;
  let fx: EffectsRuntime;
  const me = { x: 200, y: 200 };
  const target = { x: 200, y: 420 };

  beforeEach(() => {
    fake = fakeScene();
    lights = fakeLights();
    fx = new EffectsRuntime(fake.scene, fakeArt, lights.lights, {
      warn: () => {},
    });
  });

  describe("flight (req 20)", () => {
    it("should fly the baked arrow body turned to its heading at bow height, with its own trail", () => {
      expect(SHADOW_SHOT_FLIGHT.body).toBe("fx_arrow");
      expect(SHADOW_SHOT_FLIGHT.turns).toBe(true);
      expect(SHADOW_SHOT_FLIGHT.lift).toBe(BOW_LIFT);
      expect(SHADOW_SHOT_FLIGHT.trail).toBe("shadowShotTrail");
      expect(SHADOW_SHOT_FLIGHT.trail).not.toBe(ARROW_FLIGHT.trail);
    });

    it("should trail a dark, smoky stream rather than the arrow's pale air-streak", () => {
      const trail: EffectEntry = EFFECTS[SHADOW_SHOT_FLIGHT.trail];
      expect(trail.timing.kind).toBe("stream");
      expect(trail.particles?.texture).toContain("fx_smoke");
      const smoke =
        trail.particles?.looks?.fx_smoke?.tint ?? trail.particles?.tint;
      // dark smoke: pitch and cold slate, never the arrow's vellum
      expect(smoke).toEqual(["pitch", "slate"]);
      for (const c of colorsOf(trail)) expect(c).not.toMatch(/^vellum/);
      expect("light" in trail).toBe(false);
    });

    it("should draw a shadow_shot sighting with the fx_arrow body and the shadow trail, then land with the shadow impact", () => {
      const flights = new ProjectileFlights(
        fake.scene,
        fakeArt,
        fx,
        () => SHADOW_SHOT_FLIGHT,
        { warn: () => {} },
      );
      flights.sync([
        {
          entity_id: "s1",
          projectile_type: "shadow_shot",
          position: { x: 100, y: 100 },
          velocity: { vx: 0, vy: 300 },
        },
      ]);
      const body = fake.made.find(
        (m) => m.kind === "image" && m.args[3] === "fx_arrow/idle/0/0",
      );
      expect(body).toBeDefined();
      // turned to the projected heading
      const h = worldToScreen(0, 300);
      expect(body!.calls.setRotation).toEqual([Math.atan2(h.y, h.x)]);
      const trail = fake.made.find((m) => m.kind === "particles")!;
      const trailConfig = trail.args[3] as { lifespan: number };
      const stream = EFFECTS.shadowShotTrail.timing;
      expect(trailConfig.lifespan).toBe(
        stream.kind === "stream" ? stream.lifeMs : -1,
      );

      const before = fake.made.length;
      flights.sync([]);
      const landed = fake.made.slice(before);
      expect(landed.map((m) => m.kind)).toContain("particles");
      const puff = landed.find((m) => m.kind === "particles")!;
      expect((puff.args[3] as { lifespan: number }).lifespan).toBe(
        durationOf(EFFECTS.shadowShotImpact),
      );
      expect(body!.destroyed).toBe(true);
    });
  });

  describe("release (req 21)", () => {
    it("should play its own release at the bow, along the aim and lifted to bow height", () => {
      playShadowShotRelease(fx, "self", me, target);
      const bow = alongAim(me, target, BOW_REACH);
      const s = worldToScreen(bow.x, bow.y);
      const made = fake.made.filter((m) => m.kind === "particles");
      expect(made).toHaveLength(1);
      expect(made[0].calls.setPosition).toEqual([s.x, s.y - BOW_LIFT]);
      expect(fake.timers.map((t) => t.delay)).toEqual([
        durationOf(EFFECTS.shadowShotRelease),
      ]);
      fake.timers[0].fire();
      expect(fake.live()).toEqual([]);
    });

    it("should be heavier than the arrow's release: longer, with more motes", () => {
      const shadow = EFFECTS.shadowShotRelease;
      const arrow = EFFECTS.arrowRelease;
      expect(durationOf(shadow)).toBeGreaterThan(durationOf(arrow));
      expect(countOf(shadow)).toBeGreaterThan(countOf(arrow));
    });

    it("should still play when the aim is the delver's own point", () => {
      playShadowShotRelease(fx, "self", me, me);
      expect(fake.made.some((m) => m.kind === "particles")).toBe(true);
    });
  });

  describe("impact (req 21)", () => {
    const at = { x: 260, y: 380 };

    it("should land where the bolt was last drawn, at bow height, and leave nothing after", () => {
      playShadowShotImpact(fx, "s1", at);
      const puff = fake.made.find((m) => m.kind === "particles")!;
      const s = worldToScreen(at.x, at.y);
      expect(puff.calls.setPosition).toEqual([s.x, s.y - BOW_LIFT]);
      const config = puff.args[3] as { accelerationY: number };
      // it settles: never sprays outward (FS-KYPQ9 §B.6)
      expect(config.accelerationY).toBeGreaterThan(0);
      expect(lights.added).toEqual([]);
      fake.timers[0].fire();
      expect(fake.live()).toEqual([]);
    });

    it("should be heavier than the arrow's impact: longer, with more motes", () => {
      const shadow = EFFECTS.shadowShotImpact;
      const arrow = EFFECTS.arrowImpact;
      expect(durationOf(shadow)).toBeGreaterThan(durationOf(arrow));
      expect(countOf(shadow)).toBeGreaterThan(countOf(arrow));
    });
  });

  describe("palette (req 22, FS-KYPQ9 §B.7)", () => {
    it("should play only smoke-and-steel tokens, no light and never the amber accent", () => {
      const smokeAndSteel: Token[] = ["pitch", "slate", "slateLight"];
      for (const name of SHADOW_SHOT_EFFECTS) {
        const e: EffectEntry = EFFECTS[name];
        for (const c of colorsOf(e)) {
          expect(smokeAndSteel, `${name}: ${c}`).toContain(c);
          expect(c in BARROW_HEX).toBe(true);
        }
        expect("light" in e, name).toBe(false);
      }
    });

    it("should name no amber key and no colour literal in its source", () => {
      const src = readFileSync(join(__dirname, "shadowShot.ts"), "utf8");
      expect(src).not.toMatch(/["'`]amber["'`]/);
      expect(src).not.toMatch(/0x[0-9a-fA-F]{6}|#[0-9a-fA-F]{6}/);
    });
  });
});
