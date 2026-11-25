import { beforeEach, describe, expect, it } from "vitest";
import { worldToScreen } from "@/render/iso/projection";
import { worldDepth } from "@/render/iso/shapes";
import { BARROW_HEX } from "@/utils/theme";
import { fakeArt, fakeLights, fakeScene } from "./fakeScene";
import { playRollDust } from "./rollDust";
import { EffectsRuntime } from "./runtime";

describe("the roll's dust scuff (FS-7P736 R15)", () => {
  let fake: ReturnType<typeof fakeScene>;
  let fx: EffectsRuntime;
  const start = { x: 300, y: 240 };

  beforeEach(() => {
    fake = fakeScene();
    fx = new EffectsRuntime(fake.scene, fakeArt, fakeLights().lights, { warn: () => {} });
  });

  type Config = { lifespan: number; tint: number[]; angle: { min: number; max: number } };

  it("should kick at most 6 pale dust motes on the ground where the roll starts, inside the roll's 400 ms", () => {
    playRollDust(fx, "self", start, { x: 1, y: 0 });
    const [dust] = fake.made;
    expect(dust.kind).toBe("particles");
    const [count] = dust.calls.emitParticle as [number];
    expect(count).toBeLessThanOrEqual(6);
    const config = dust.args[3] as Config;
    expect(config.lifespan).toBeLessThanOrEqual(400);
    expect(config.tint).toEqual([BARROW_HEX.vellumDark, BARROW_HEX.vellumFaint]);
    const s = worldToScreen(start.x, start.y);
    expect(dust.calls.setPosition).toEqual([s.x, s.y]);
  });

  it("should throw the dust back against the roll's way, from the push-off", () => {
    playRollDust(fx, "self", start, { x: 1, y: 0 });
    const config = fake.made[0].args[3] as Config;
    const h = worldToScreen(1, 0);
    const back = (Math.atan2(-h.y, -h.x) * 180) / Math.PI;
    expect((config.angle.min + config.angle.max) / 2).toBeCloseTo(back);
  });

  it("should sort in front of the body at its own footprint, and play nothing else", () => {
    playRollDust(fx, "p2", start, { x: 0, y: 1 });
    const [depth] = fake.made[0].calls.setDepth as [number];
    expect(depth).toBeGreaterThan(worldDepth(start.x, start.y, 1));
    expect(fake.made.map((m) => m.kind)).toEqual(["particles"]);
  });
});
