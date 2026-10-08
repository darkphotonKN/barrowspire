import { beforeEach, describe, expect, it } from "vitest";
import { worldToScreen } from "@/render/iso/projection";
import { BARROW_HEX } from "@/utils/theme";
import { fakeArt, fakeLights, fakeScene } from "./fakeScene";
import { playEscape } from "./escape";
import { EffectsRuntime } from "./runtime";

describe("escape (FS-KYPQ9 §G.3)", () => {
  let fake: ReturnType<typeof fakeScene>;
  let lights: ReturnType<typeof fakeLights>;
  let fx: EffectsRuntime;
  const at = { x: 300, y: 420 };

  beforeEach(() => {
    fake = fakeScene();
    lights = fakeLights();
    fx = new EffectsRuntime(fake.scene, fakeArt, lights.lights, {
      warn: () => {},
    });
  });

  it("should raise a pale column at the escape point with at most 10 slow rising motes", () => {
    playEscape(fx, "p2", at);
    const column = fake.made.find((m) => m.kind === "image")!;
    expect(column.args[3]).toBe("fx_escape_column/idle/0/0");
    const s = worldToScreen(at.x, at.y);
    expect(column.calls.setPosition).toEqual([s.x, s.y]);
    const motes = fake.made.find((m) => m.kind === "particles")!;
    const [count] = motes.calls.emitParticle as [number];
    expect(count).toBeLessThanOrEqual(10);
    const config = motes.args[3] as {
      angle: { min: number; max: number };
      accelerationY: number;
    };
    // upward on screen (270°), drifting up, never outward
    expect(config.angle.min).toBeGreaterThanOrEqual(240);
    expect(config.angle.max).toBeLessThanOrEqual(300);
    expect(config.accelerationY).toBeLessThanOrEqual(0);
  });

  it("should light a short-lived vellum pool, removed when the 1000 ms fade ends", () => {
    playEscape(fx, "p2", at);
    expect(lights.added).toHaveLength(1);
    expect(lights.added[0].spec.color).toBe(BARROW_HEX.vellum);
    expect(fake.tweens.every((t) => t.config.duration === 1000)).toBe(true);
    expect(fake.timers.map((t) => t.delay)).toEqual([1000]);

    fake.timers[0].fire();
    expect(lights.alive()).toEqual([]);
    expect(fake.live()).toEqual([]);
    expect(fx.playing()).toBe(0);
  });

  it("should end with its owner when the owner is released", () => {
    playEscape(fx, "p2", at);
    fx.release("p2");
    expect(lights.alive()).toEqual([]);
    expect(fake.live()).toEqual([]);
  });
});
