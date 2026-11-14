import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { worldToScreen } from "@/render/iso/projection";
import { BOW_LIFT } from "./arrow";
import { BONE_ARROW_FLIGHT } from "./boneArrow";
import { fakeArt, fakeLights, fakeScene } from "./fakeScene";
import { FIREBALL_FLIGHT } from "./fireball";
import { projectileFlightOf } from "./flights";
import { OGRE_ROCK_FLIGHT } from "./ogreRock";
import { ProjectileFlights, type Sighting } from "./projectile";
import { EffectsRuntime } from "./runtime";
import { EFFECTS, type EffectEntry, type Token } from "./table";
import { THROWN_DAGGER_EFFECTS, THROWN_DAGGER_FLIGHT } from "./thrownDagger";

const colorsOf = (e: EffectEntry): Token[] => [
  ...(e.sprite?.tint ?? []),
  ...(e.particles?.tint ?? []),
  ...(e.light ? [e.light.color] : []),
];
const NOT_HOSTILE = /^(amber|arcane|umbra)/;

const dagger = (id: string): Sighting => ({
  entity_id: id,
  projectile_type: "thrown_dagger",
  position: { x: 100, y: 100 },
  velocity: { vx: 480, vy: 0 },
});

describe("a goblin's thrown dagger (FS-C8VM7 §F R38)", () => {
  let fake: ReturnType<typeof fakeScene>;
  let lights: ReturnType<typeof fakeLights>;
  let flights: ProjectileFlights;
  const bodies = () => fake.made.filter((m) => m.kind === "image" && m.args[3] === "fx_arrow/idle/0/0");

  beforeEach(() => {
    fake = fakeScene();
    lights = fakeLights();
    const fx = new EffectsRuntime(fake.scene, fakeArt, lights.lights, { warn: () => {} });
    flights = new ProjectileFlights(fake.scene, fakeArt, fx, projectileFlightOf, { warn: () => {} });
  });

  it("should fly a thrown_dagger as its own flight, not the fireball fallback, the bone arrow or the rock", () => {
    expect(projectileFlightOf("thrown_dagger")).toBe(THROWN_DAGGER_FLIGHT);
    for (const other of [FIREBALL_FLIGHT, BONE_ARROW_FLIGHT, OGRE_ROCK_FLIGHT])
      expect(THROWN_DAGGER_FLIGHT).not.toBe(other);
    expect(THROWN_DAGGER_FLIGHT.trail).toBe("thrownDaggerTrail");
  });

  it("should draw a small blade, steel to a hostile-red edge, turned to its heading, where the server puts it", () => {
    flights.sync([dagger("d1")]);
    const [body] = bodies();
    expect(body.calls.setScale).toEqual([THROWN_DAGGER_FLIGHT.scale]);
    expect(THROWN_DAGGER_FLIGHT.scale).toBeLessThan(1);
    const h = worldToScreen(480, 0);
    expect(body.calls.setRotation).toEqual([Math.atan2(h.y, h.x)]);
    flights.sync([{ ...dagger("d1"), position: { x: 140, y: 100 } }]);
    const s = worldToScreen(140, 100);
    expect(body.calls.setPosition).toEqual([s.x, s.y - BOW_LIFT]);
    flights.sync([]);
    expect(body.destroyed).toBe(true);
  });

  it("should draw only in the hostile channel, lighting nothing, with no colour literal", () => {
    for (const c of [...(THROWN_DAGGER_FLIGHT.tint ?? []), ...THROWN_DAGGER_EFFECTS.flatMap((n) => colorsOf(EFFECTS[n]))])
      expect(c).not.toMatch(NOT_HOSTILE);
    expect(THROWN_DAGGER_FLIGHT.tint).toContain("oxbloodText");
    flights.sync([dagger("d1")]);
    expect(lights.added).toEqual([]);
    const src = readFileSync(join(__dirname, "thrownDagger.ts"), "utf8");
    expect(src).not.toMatch(/0x[0-9a-fA-F]{6}|#[0-9a-fA-F]{6}/);
  });
});
