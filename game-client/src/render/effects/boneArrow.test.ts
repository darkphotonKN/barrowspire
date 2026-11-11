import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { worldToScreen } from "@/render/iso/projection";
import { BARROW_HEX } from "@/utils/theme";
import { ARROW_FLIGHT, BOW_LIFT } from "./arrow";
import { BONE_ARROW_EFFECTS, BONE_ARROW_FLIGHT } from "./boneArrow";
import { fakeArt, fakeLights, fakeScene } from "./fakeScene";
import { FIREBALL_FLIGHT } from "./fireball";
import { projectileFlightOf } from "./flights";
import { ProjectileFlights, type Sighting } from "./projectile";
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

/** The tokens a hostile's attack effect may never wear: interactable, safe, and a player's shot. */
const NOT_HOSTILE = /^(amber|arcane|umbra)/;

const boneArrow = (id: string): Sighting => ({
  entity_id: id,
  projectile_type: "bone_arrow",
  position: { x: 100, y: 100 },
  velocity: { vx: 0, vy: 420 },
});

describe("bone arrow (FS-B4SG9 §D R22)", () => {
  let fake: ReturnType<typeof fakeScene>;
  let lights: ReturnType<typeof fakeLights>;
  let fx: EffectsRuntime;
  let flights: ProjectileFlights;

  const bodies = () =>
    fake.made.filter(
      (m) => m.kind === "image" && m.args[3] === "fx_arrow/idle/0/0",
    );

  beforeEach(() => {
    fake = fakeScene();
    lights = fakeLights();
    fx = new EffectsRuntime(fake.scene, fakeArt, lights.lights, {
      warn: () => {},
    });
    flights = new ProjectileFlights(fake.scene, fakeArt, fx, projectileFlightOf, {
      warn: () => {},
    });
  });

  describe("its own flight", () => {
    it("should fly a bone_arrow as its own flight: not the fireball fallback, not a player's shot", () => {
      const flight = projectileFlightOf("bone_arrow");
      expect(flight).toBe(BONE_ARROW_FLIGHT);
      expect(flight).not.toBe(FIREBALL_FLIGHT);
      expect(flight).not.toBe(ARROW_FLIGHT);
      expect(flight).not.toBe(SHADOW_SHOT_FLIGHT);
    });

    it("should keep the arrow's shape: the baked arrow turned to its heading at bow height", () => {
      expect(BONE_ARROW_FLIGHT.body).toBe("fx_arrow");
      expect(BONE_ARROW_FLIGHT.turns).toBe(true);
      expect(BONE_ARROW_FLIGHT.lift).toBe(BOW_LIFT);
    });

    it("should trail its own stream, never the party arrow's or the Shadow Shot's", () => {
      expect(BONE_ARROW_FLIGHT.trail).toBe("boneArrowTrail");
      expect(BONE_ARROW_FLIGHT.trail).not.toBe(ARROW_FLIGHT.trail);
      expect(BONE_ARROW_FLIGHT.trail).not.toBe(SHADOW_SHOT_FLIGHT.trail);
    });
  });

  describe("the hostile channel", () => {
    it("should shade the body from a bone tail to a hostile-red head", () => {
      expect(BONE_ARROW_FLIGHT.tint).toEqual(["vellum", "oxbloodText"]);
      flights.sync([boneArrow("b1")]);
      const [body] = bodies();
      // trailing side (nock) to leading side (head), as the runtime shades a sprite
      expect(body.calls.setTint).toEqual([
        BARROW_HEX.vellum,
        BARROW_HEX.oxbloodText,
        BARROW_HEX.vellum,
        BARROW_HEX.oxbloodText,
      ]);
      // turned to the projected heading, like every arrow
      const h = worldToScreen(0, 420);
      expect(body.calls.setRotation).toEqual([Math.atan2(h.y, h.x)]);
    });

    it("should leave a party arrow's body in its own baked colours", () => {
      expect(ARROW_FLIGHT.tint).toBeUndefined();
      flights.sync([{ ...boneArrow("a1"), projectile_type: "arrow" }]);
      const [body] = bodies();
      expect(body.calls.setTint).toBeUndefined();
    });

    it("should wrap the head in a hostile-red glow and shed ember motes behind it", () => {
      const trail: EffectEntry = EFFECTS.boneArrowTrail;
      expect(trail.sprite?.texture).toBe("fx_glow");
      expect(trail.sprite?.tint).toEqual(["oxbloodText"]);
      // steady while it flies: never pulsed
      expect(trail.sprite?.alpha.from).toBe(trail.sprite?.alpha.to);
      expect(trail.particles?.texture).toEqual(["fx_ember"]);
      expect(trail.particles?.tint).toEqual(["ember", "oxbloodText"]);
    });

    it("should draw only from the ember and oxblood family: never amber, arcane green, umbra or the party arrow's pale streak", () => {
      const hostile: Token[] = ["ember", "oxbloodText"];
      const party = colorsOf(EFFECTS[ARROW_FLIGHT.trail]);
      for (const name of BONE_ARROW_EFFECTS) {
        for (const c of colorsOf(EFFECTS[name])) {
          expect(hostile, `${name}: ${c}`).toContain(c);
          expect(c in BARROW_HEX).toBe(true);
          expect(c).not.toMatch(NOT_HOSTILE);
          expect(party).not.toContain(c);
        }
      }
      for (const c of BONE_ARROW_FLIGHT.tint ?? [])
        expect(c).not.toMatch(NOT_HOSTILE);
    });

    it("should name no amber key and no colour literal in its source", () => {
      const src = readFileSync(join(__dirname, "boneArrow.ts"), "utf8");
      expect(src).not.toMatch(/["'`]amber\w*["'`]/);
      expect(src).not.toMatch(/0x[0-9a-fA-F]{6}|#[0-9a-fA-F]{6}/);
    });
  });

  describe("flown where the server puts it", () => {
    it("should stream at most 12 motes that die with the arrow, and light nothing", () => {
      const trail: EffectEntry = EFFECTS.boneArrowTrail;
      const t = trail.timing;
      if (t.kind !== "stream") throw new Error("trail is a stream");
      expect(t.onRelease).toBe("cut");
      expect(t.intervalMs).toBeGreaterThanOrEqual(40);
      expect(t.maxAlive).toBeLessThanOrEqual(12);
      // an arrow, not a flame: it carries no light, so it never reads as a fireball
      expect("light" in trail).toBe(false);
      flights.sync([boneArrow("b1")]);
      expect(lights.added).toEqual([]);
    });

    it("should follow each state and end where the server removes it, leaving nothing of its own", () => {
      flights.sync([boneArrow("b1")]);
      const [body] = bodies();
      flights.sync([{ ...boneArrow("b1"), position: { x: 100, y: 160 } }]);
      const s = worldToScreen(100, 160);
      expect(body.calls.setPosition).toEqual([s.x, s.y - BOW_LIFT]);

      flights.sync([]);
      expect(body.destroyed).toBe(true);
      expect(flights.tracked()).toBe(0);
      expect(lights.added).toEqual([]);
    });

    it("should have no release and no hit effect of its own (§Out of Scope): only its trail", () => {
      expect(BONE_ARROW_EFFECTS).toEqual(["boneArrowTrail"]);
      expect(BONE_ARROW_FLIGHT.impact).toBe(ARROW_FLIGHT.impact);
    });
  });
});
