import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { worldToScreen } from "@/render/iso/projection";
import { fakeArt, fakeLights, fakeScene } from "./fakeScene";
import { FIREBALL_FLIGHT } from "./fireball";
import { projectileFlightOf } from "./flights";
import { OGRE_ROCK_EFFECTS, OGRE_ROCK_FLIGHT } from "./ogreRock";
import { ProjectileFlights, type Sighting } from "./projectile";
import { EffectsRuntime } from "./runtime";
import { EFFECTS, type EffectEntry, type Token } from "./table";
import { THROWN_DAGGER_FLIGHT } from "./thrownDagger";

const colorsOf = (e: EffectEntry): Token[] => [
  ...(e.sprite?.tint ?? []),
  ...(e.particles?.tint ?? []),
  ...(e.light ? [e.light.color] : []),
];
const NOT_HOSTILE = /^(amber|arcane|umbra)/;

const rock = (id: string): Sighting => ({
  entity_id: id,
  projectile_type: "ogre_rock",
  position: { x: 100, y: 100 },
  velocity: { vx: 0, vy: 240 },
});

describe("an ogre's thrown rock (FS-C8VM7 §F R38)", () => {
  let fake: ReturnType<typeof fakeScene>;
  let lights: ReturnType<typeof fakeLights>;
  let flights: ProjectileFlights;
  const bodies = () => fake.made.filter((m) => m.kind === "image" && m.args[3] === `${OGRE_ROCK_FLIGHT.body}/idle/0/0`);

  beforeEach(() => {
    fake = fakeScene();
    lights = fakeLights();
    const fx = new EffectsRuntime(fake.scene, fakeArt, lights.lights, { warn: () => {} });
    flights = new ProjectileFlights(fake.scene, fakeArt, fx, projectileFlightOf, { warn: () => {} });
  });

  it("should fly an ogre_rock as its own flight, not the fireball fallback or the dagger", () => {
    expect(projectileFlightOf("ogre_rock")).toBe(OGRE_ROCK_FLIGHT);
    expect(OGRE_ROCK_FLIGHT).not.toBe(FIREBALL_FLIGHT);
    expect(OGRE_ROCK_FLIGHT).not.toBe(THROWN_DAGGER_FLIGHT);
    expect(OGRE_ROCK_FLIGHT.trail).toBe("ogreRockTrail");
  });

  it("should read big: its body drawn larger than any other flight's, untwisted", () => {
    expect(OGRE_ROCK_FLIGHT.scale).toBeGreaterThan(1);
    expect(OGRE_ROCK_FLIGHT.turns).toBe(false);
    flights.sync([rock("r1")]);
    const [body] = bodies();
    expect(body.calls.setScale).toEqual([OGRE_ROCK_FLIGHT.scale]);
    flights.sync([{ ...rock("r1"), position: { x: 100, y: 112 } }]);
    const s = worldToScreen(100, 112);
    expect(body.calls.setPosition).toEqual([s.x, s.y - OGRE_ROCK_FLIGHT.lift]);
  });

  it("should draw only in the hostile channel, lighting nothing, with no colour literal", () => {
    for (const c of [...(OGRE_ROCK_FLIGHT.tint ?? []), ...OGRE_ROCK_EFFECTS.flatMap((n) => colorsOf(EFFECTS[n]))])
      expect(c).not.toMatch(NOT_HOSTILE);
    expect(OGRE_ROCK_EFFECTS.flatMap((n) => colorsOf(EFFECTS[n]))).toContain("oxbloodText");
    flights.sync([rock("r1")]);
    expect(lights.added).toEqual([]);
    const src = readFileSync(join(__dirname, "ogreRock.ts"), "utf8");
    expect(src).not.toMatch(/0x[0-9a-fA-F]{6}|#[0-9a-fA-F]{6}/);
  });
});
