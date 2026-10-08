import { beforeEach, describe, expect, it } from "vitest";
import { worldToScreen } from "@/render/iso/projection";
import { worldDepth } from "@/render/iso/shapes";
import { BARROW_HEX } from "@/utils/theme";
import { fakeArt, fakeLights, fakeScene } from "./fakeScene";
import { DeathDust, isDeathClip, playDeathDust } from "./death";
import { EffectsRuntime } from "./runtime";

describe("death dust (FS-KYPQ9 §G.2)", () => {
  let fake: ReturnType<typeof fakeScene>;
  let lights: ReturnType<typeof fakeLights>;
  let fx: EffectsRuntime;
  const body = { x: 520, y: 310 };

  beforeEach(() => {
    fake = fakeScene();
    lights = fakeLights();
    fx = new EffectsRuntime(fake.scene, fakeArt, lights.lights, {
      warn: () => {},
    });
  });

  it("should settle at most 6 dust motes at the body's feet over 600 ms", () => {
    playDeathDust(fx, "p2", body);
    const [dust] = fake.made;
    expect(dust.kind).toBe("particles");
    const [count] = dust.calls.emitParticle as [number];
    expect(count).toBeLessThanOrEqual(6);
    const config = dust.args[3] as { lifespan: number; tint: number[] };
    expect(config.lifespan).toBe(600);
    expect(config.tint).toEqual([
      BARROW_HEX.vellumDark,
      BARROW_HEX.vellumFaint,
    ]);
    // on the ground at the feet, no lift
    const s = worldToScreen(body.x, body.y);
    expect(dust.calls.setPosition).toEqual([s.x, s.y]);
    expect(fake.timers.map((t) => t.delay)).toEqual([600]);
  });

  it("should sort in front of the corpse (standAt layer 1) at its own footprint", () => {
    playDeathDust(fx, "p2", body);
    const [depth] = fake.made[0].calls.setDepth as [number];
    expect(depth).toBeGreaterThan(worldDepth(body.x, body.y, 1));
    expect(depth).toBeLessThan(worldDepth(body.x + 1, body.y, 0));
  });

  it("should play nothing else: no sprite, no light", () => {
    playDeathDust(fx, "p2", body);
    expect(fake.made.map((m) => m.kind)).toEqual(["particles"]);
    expect(lights.added).toEqual([]);
    fake.timers[0].fire();
    expect(fake.live()).toEqual([]);
  });

  it.each([
    ["warrior/death/3", true],
    ["villager/death_b/0", true],
    ["warrior/attack/3", false],
    ["warrior/idle/0", false],
    ["death", false],
  ])("should know %s is a death clip: %s", (key, expected) => {
    expect(isDeathClip(key)).toBe(expected);
  });
});

describe("death dust, once per death (FS-KYPQ9 §G.2)", () => {
  let fake: ReturnType<typeof fakeScene>;
  let fx: EffectsRuntime;
  let dust: DeathDust;
  const body = { x: 520, y: 310 };
  const settles = () => fake.made.filter((m) => m.kind === "particles").length;

  beforeEach(() => {
    fake = fakeScene();
    fx = new EffectsRuntime(fake.scene, fakeArt, fakeLights().lights, {
      warn: () => {},
    });
    dust = new DeathDust();
  });

  it("should settle once when a dead character turns and its death clip replays", () => {
    const corpse = {};
    dust.clipComplete(fx, "p2", corpse, "warrior/death/3", body);
    // a new facing is a new key: CharacterAnimator.show plays the clip again
    dust.clipComplete(fx, "p2", corpse, "warrior/death/4", body);
    dust.clipComplete(fx, "p2", corpse, "warrior/death/4", body);
    expect(settles()).toBe(1);
  });

  it("should settle again on the next death once the character is alive again", () => {
    const delver = {};
    dust.clipComplete(fx, "self", delver, "warrior/death/3", body);
    dust.alive(delver);
    dust.clipComplete(fx, "self", delver, "warrior/death/1", body);
    expect(settles()).toBe(2);
  });

  it("should not count a finished attack clip as the death", () => {
    const delver = {};
    dust.clipComplete(fx, "self", delver, "warrior/attack/3", body);
    expect(settles()).toBe(0);
    dust.clipComplete(fx, "self", delver, "warrior/death/3", body);
    expect(settles()).toBe(1);
  });

  it("should keep each character's death apart", () => {
    const a = {};
    const b = {};
    dust.clipComplete(fx, "p2", a, "warrior/death/3", body);
    dust.clipComplete(fx, "p3", b, "archer/death/3", body);
    expect(settles()).toBe(2);
  });
});
