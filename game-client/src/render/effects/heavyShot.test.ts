import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { worldToScreen } from "@/render/iso/projection";
import { BARROW_HEX } from "@/utils/theme";
import { ARROW_FLIGHT, BOW_LIFT, BOW_REACH } from "./arrow";
import { fakeArt, fakeLights, fakeScene } from "./fakeScene";
import { projectileFlightOf } from "./flights";
import {
  archerShotFlight,
  HEAVY_SHOT_EFFECTS,
  HEAVY_SHOT_FLIGHT,
  playArcherShotRelease,
  playHeavyShotImpact,
  playHeavyShotRelease,
  wearsShadow,
} from "./heavyShot";
import { alongAim } from "./projectile";
import { EffectsRuntime } from "./runtime";
import { SHADOW_SHOT_FLIGHT } from "./shadowShot";
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

const countOf = (e: EffectEntry) => e.particles?.count ?? -1;
const durationOf = (e: EffectEntry) => (e.timing.kind === "oneShot" ? e.timing.durationMs : -1);
const lifeOf = (e: EffectEntry) => (e.timing.kind === "stream" ? e.timing.lifeMs : -1);

describe("Heavy Shot (FS-1J1CB §F R39–R43)", () => {
  let fake: ReturnType<typeof fakeScene>;
  let lights: ReturnType<typeof fakeLights>;
  let fx: EffectsRuntime;
  const me = { x: 200, y: 200 };
  const target = { x: 200, y: 420 };

  beforeEach(() => {
    fake = fakeScene();
    lights = fakeLights();
    fx = new EffectsRuntime(fake.scene, fakeArt, lights.lights, { warn: () => {} });
  });

  describe("which shot (R39, R41, R42)", () => {
    it.each([
      ["shadow_ranger", true],
      ["hunter", false],
      [undefined, false],
      // another class's spec, or one the client does not know, is no Shadow Ranger
      ["pyromancer", false],
      ["nightblade", false],
    ])("should give %s the shadow: %s", (spec, shadow) => {
      expect(wearsShadow(spec)).toBe(shadow);
    });

    it("should fly the Shadow Shot for a Shadow Ranger and the Heavy Shot for any other", () => {
      expect(archerShotFlight(true)).toBe(SHADOW_SHOT_FLIGHT);
      expect(archerShotFlight(false)).toBe(HEAVY_SHOT_FLIGHT);
      expect(projectileFlightOf("shadow_shot")).toBe(HEAVY_SHOT_FLIGHT);
      expect(projectileFlightOf("shadow_shot", { class: "archer", position: me, specialization: "shadow_ranger" })).toBe(
        SHADOW_SHOT_FLIGHT,
      );
      expect(projectileFlightOf("shadow_shot", { class: "archer", position: me, specialization: "hunter" })).toBe(
        HEAVY_SHOT_FLIGHT,
      );
    });

    it.each([
      [true, "shadowShotRelease"],
      [false, "heavyShotRelease"],
    ])("should play the right release at the bow (shadow: %s)", (shadow, entry) => {
      const played: string[] = [];
      playArcherShotRelease({ play: (_o, name) => (played.push(name), null) }, "self", me, target, shadow);
      expect(played).toEqual([entry]);
    });
  });

  describe("flight (R40)", () => {
    it("should fly the same baked bolt as the Shadow Shot, at bow height, with its own trail", () => {
      expect(HEAVY_SHOT_FLIGHT.body).toBe("fx_arrow");
      expect(HEAVY_SHOT_FLIGHT.turns).toBe(true);
      expect(HEAVY_SHOT_FLIGHT.lift).toBe(BOW_LIFT);
      expect(HEAVY_SHOT_FLIGHT.tint).toBeUndefined();
      expect(HEAVY_SHOT_FLIGHT.trail).toBe("heavyShotTrail");
    });

    it("should leave a thicker pale wake than the arrow's that hangs a little longer", () => {
      const trail: EffectEntry = EFFECTS.heavyShotTrail;
      const arrow: EffectEntry = EFFECTS[ARROW_FLIGHT.trail];
      expect(lifeOf(trail)).toBeGreaterThan(lifeOf(arrow));
      // a little longer, never the Shadow Shot's lingering wake
      expect(lifeOf(trail)).toBeLessThan(lifeOf(EFFECTS.shadowShotTrail));
      expect(trail.particles?.alpha.from).toBeGreaterThan(arrow.particles!.alpha.from);
      expect(trail.particles?.scale.from).toBeGreaterThan(arrow.particles!.scale.from);
      for (const c of colorsOf(trail)) expect(c).toMatch(/^vellum/);
    });
  });

  describe("release (R40)", () => {
    it("should play at the bow, along the aim and lifted to bow height, and leave nothing after", () => {
      playHeavyShotRelease(fx, "self", me, target);
      const bow = alongAim(me, target, BOW_REACH);
      const s = worldToScreen(bow.x, bow.y);
      const made = fake.made.filter((m) => m.kind === "particles");
      expect(made).toHaveLength(1);
      expect(made[0].calls.setPosition).toEqual([s.x, s.y - BOW_LIFT]);
      for (const t of fake.timers) t.fire();
      expect(fake.live()).toEqual([]);
      expect(lights.added).toEqual([]);
    });

    it("should snap harder than the arrow's: longer, with more fibre and dust", () => {
      expect(durationOf(EFFECTS.heavyShotRelease)).toBeGreaterThan(durationOf(EFFECTS.arrowRelease));
      expect(countOf(EFFECTS.heavyShotRelease)).toBeGreaterThan(countOf(EFFECTS.arrowRelease));
    });
  });

  describe("impact (R40)", () => {
    const at = { x: 260, y: 380 };

    it("should land where the bolt was last drawn, at bow height, settling, with no light", () => {
      playHeavyShotImpact(fx, "s1", at);
      const puff = fake.made.find((m) => m.kind === "particles")!;
      const s = worldToScreen(at.x, at.y);
      expect(puff.calls.setPosition).toEqual([s.x, s.y - BOW_LIFT]);
      expect((puff.args[3] as { accelerationY: number }).accelerationY).toBeGreaterThan(0);
      expect(lights.added).toEqual([]);
      for (const t of fake.timers) t.fire();
      expect(fake.live()).toEqual([]);
    });

    it("should thud heavier than the arrow's: longer, with more dust and splinters", () => {
      expect(durationOf(EFFECTS.heavyShotImpact)).toBeGreaterThan(durationOf(EFFECTS.arrowImpact));
      expect(countOf(EFFECTS.heavyShotImpact)).toBeGreaterThan(countOf(EFFECTS.arrowImpact));
    });
  });

  describe("palette (R40)", () => {
    it("should play vellum and barrow brown only: no umbra, no pitch halo, no light", () => {
      const allowed: Token[] = ["vellum", "vellumDark", "barrowBrown"];
      for (const name of HEAVY_SHOT_EFFECTS) {
        const e: EffectEntry = EFFECTS[name];
        for (const c of colorsOf(e)) {
          expect(allowed, `${name}: ${c}`).toContain(c);
          expect(c in BARROW_HEX).toBe(true);
        }
        expect("light" in e, name).toBe(false);
      }
    });

    it("should name no colour literal in its source", () => {
      const src = readFileSync(join(__dirname, "heavyShot.ts"), "utf8");
      expect(src).not.toMatch(/0x[0-9a-fA-F]{6}|#[0-9a-fA-F]{6}/);
    });
  });
});
