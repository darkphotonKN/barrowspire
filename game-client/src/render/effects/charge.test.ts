import { beforeEach, describe, expect, it } from "vitest";
import { worldToScreen } from "@/render/iso/projection";
import { BARROW_HEX } from "@/utils/theme";
import { fakeArt, fakeLights, fakeScene } from "./fakeScene";
import { playCharge } from "./charge";
import { EffectsRuntime } from "./runtime";

type EmitterConfig = {
  lifespan: number;
  tint: number[];
  angle: { min: number; max: number };
  speed: { min: number; max: number };
};

describe("warrior charge (FS-KYPQ9 §D.2)", () => {
  let fake: ReturnType<typeof fakeScene>;
  let lights: ReturnType<typeof fakeLights>;
  let fx: EffectsRuntime;
  const start = { x: 200, y: 200 };
  const target = { x: 360, y: 200 };

  beforeEach(() => {
    fake = fakeScene();
    lights = fakeLights();
    fx = new EffectsRuntime(fake.scene, fakeArt, lights.lights, {
      warn: () => {},
    });
  });

  const emitters = () => fake.made.filter((m) => m.kind === "particles");

  it("should kick a low dust burst of at most 8 motes at the start over 450 ms", () => {
    playCharge(fx, "self", start, target);
    const burst = emitters().find(
      (e) => (e.args[3] as EmitterConfig).lifespan === 450,
    )!;
    const [count] = burst.calls.emitParticle as [number];
    expect(count).toBeLessThanOrEqual(8);
    const config = burst.args[3] as EmitterConfig;
    // pale dust, so it reads on the brown ground
    expect(config.tint).toEqual([
      BARROW_HEX.vellumDark,
      BARROW_HEX.vellumFaint,
    ]);
    const s = worldToScreen(start.x, start.y);
    expect(burst.calls.setPosition).toEqual([s.x, s.y]);
  });

  it("should drag a faint dust trail along the charge line over 350 ms", () => {
    playCharge(fx, "self", start, target);
    const trail = emitters().find(
      (e) => (e.args[3] as EmitterConfig).lifespan === 350,
    )!;
    const config = trail.args[3] as EmitterConfig;
    // world +x runs down-right on screen; the trail lies on that line, behind the charge
    const h = worldToScreen(1, 0);
    const back = (Math.atan2(-h.y, -h.x) * 180) / Math.PI;
    expect((config.angle.min + config.angle.max) / 2).toBeCloseTo(back);
    expect(config.angle.max - config.angle.min).toBeLessThanOrEqual(20);
    // spread speeds string the motes out along a short segment behind the start
    expect(config.speed.max).toBeGreaterThanOrEqual(4 * config.speed.min);
    expect((config.speed.max * 350) / 1000).toBeLessThanOrEqual(56);
    expect(config.tint).toEqual([
      BARROW_HEX.vellumDark,
      BARROW_HEX.vellumFaint,
    ]);
    expect(fake.timers.map((t) => t.delay).sort()).toEqual([350, 450]);
  });

  it("should draw no streak and mark nothing where the charge lands", () => {
    playCharge(fx, "self", start, target);
    expect(fake.made.filter((m) => m.kind === "image")).toEqual([]);
    const t = worldToScreen(target.x, target.y);
    for (const e of emitters())
      expect(e.calls.setPosition).not.toEqual([t.x, t.y]);
    expect(lights.added).toEqual([]);
  });

  it("should leave nothing once both have ended", () => {
    playCharge(fx, "self", start, target);
    for (const t of fake.timers) t.fire();
    expect(fake.live()).toEqual([]);
    expect(fx.playing()).toBe(0);
  });
});
