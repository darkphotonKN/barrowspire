import { beforeEach, describe, expect, it, vi } from "vitest";
import { worldDepth } from "@/render/iso/shapes";
import { LIGHTMAP_DEPTH } from "@/render/lighting/LightMap";
import { BARROW_HEX } from "@/utils/theme";
import { fakeArt, fakeLights, fakeScene } from "./fakeScene";
import { EffectsRuntime, type FxArt } from "./runtime";
import { ChimneySmoke, SMOKE_LAYER } from "./smoke";
import { EFFECTS } from "./table";

// LightMap.ts loads Phaser, which needs a browser; only its depth constant is read here.
vi.mock("phaser", () => ({ default: {} }));

type EmitterConfig = Record<string, unknown> & {
  lifespan: number;
  maxAliveParticles: number;
  scale: { start: number; end: number; ease: string; yoyo?: unknown };
  alpha: { start: number; end: number };
  tint: number[];
  frame: string[];
};

describe("chimney smoke (FS-KYPQ9 §A.6)", () => {
  let fake: ReturnType<typeof fakeScene>;
  let lights: ReturnType<typeof fakeLights>;
  let fx: EffectsRuntime;
  const top = { x: 700, y: 230 };
  const lift = 210;

  beforeEach(() => {
    fake = fakeScene();
    lights = fakeLights();
    fx = new EffectsRuntime(fake.scene, fakeArt, lights.lights, {
      warn: () => {},
    });
  });

  const emitter = () => {
    const made = fake.made.filter((m) => m.kind === "particles");
    expect(made).toHaveLength(1);
    return { made: made[0], config: made[0].args[3] as EmitterConfig };
  };

  it("should stream one fx_smoke puff at a time from the chimney top, at most 10 alive", () => {
    new ChimneySmoke(fx, "chimney:h0", top, lift);
    const { made, config } = emitter();
    expect(config.frame.every((f) => f.startsWith("fx_smoke/"))).toBe(true);
    expect(made.calls.startFollow?.[2]).toBe(-lift);
    expect(config.emitting).toBe(true);
    expect(config.quantity).toBe(1);
    expect(config.maxAliveParticles).toBeLessThanOrEqual(10);
  });

  it("should give each puff a 4000 ms life", () => {
    new ChimneySmoke(fx, "chimney:h0", top, lift);
    expect(emitter().config.lifespan).toBe(4000);
  });

  it("should grow each puff monotonically to at most 1.6×, with no yoyo or repeat", () => {
    new ChimneySmoke(fx, "chimney:h0", top, lift);
    const { config } = emitter();
    expect(config.scale.end).toBeLessThanOrEqual(1.6);
    expect(config.scale.end).toBeGreaterThanOrEqual(config.scale.start);
    expect(config.scale).not.toHaveProperty("yoyo");
    expect(config).not.toHaveProperty("yoyo");
    expect(config).not.toHaveProperty("repeat");
    expect(fake.tweens).toEqual([]);
  });

  it("should keep the puffs faint: alpha at most 0.35", () => {
    new ChimneySmoke(fx, "chimney:h0", top, lift);
    const { config } = emitter();
    expect(Math.max(config.alpha.start, config.alpha.end)).toBeLessThanOrEqual(
      0.35,
    );
  });

  it("should tint the puffs slate and vellumFaint only", () => {
    new ChimneySmoke(fx, "chimney:h0", top, lift);
    expect(emitter().config.tint).toEqual([
      BARROW_HEX.slate,
      BARROW_HEX.vellumFaint,
    ]);
  });

  it("should draw under the light-map, sorted on the chimney's footprint, and stamp no light", () => {
    new ChimneySmoke(fx, "chimney:h0", top, lift);
    const depth = emitter().made.calls.setDepth?.[0] as number;
    expect(depth).toBe(worldDepth(top.x, top.y, SMOKE_LAYER));
    expect(depth).toBeLessThan(LIGHTMAP_DEPTH);
    expect(lights.added).toEqual([]);
  });

  it("should play the table's chimneySmoke entry, with one fixed wind for the whole hub", () => {
    new ChimneySmoke(fx, "chimney:h0", top, lift);
    new ChimneySmoke(fx, "chimney:h1", { x: 1200, y: 230 }, lift);
    const configs = fake.made
      .filter((m) => m.kind === "particles")
      .map((m) => m.args[3] as EmitterConfig);
    const { particles } = EFFECTS.chimneySmoke;
    for (const c of configs) {
      expect(c.accelerationX).toBe(particles.accel.x);
      expect(c.accelerationY).toBe(particles.accel.y);
    }
  });

  it("should stop and let its puffs burn out when hidden, then come back when shown", () => {
    const smoke = new ChimneySmoke(fx, "chimney:h0", top, lift);
    smoke.setVisible(false);
    const { made } = emitter();
    expect(fx.playing("chimney:h0")).toBe(0);
    expect(fake.timers.at(-1)?.delay).toBe(4000);
    fake.timers.at(-1)!.fire();
    expect(made.destroyed).toBe(true);

    smoke.setVisible(true);
    smoke.setVisible(true);
    expect(fx.playing("chimney:h0")).toBe(1);
  });

  it("should leave no live emitter after the runtime clears (scene SHUTDOWN/DESTROY)", () => {
    new ChimneySmoke(fx, "chimney:h0", top, lift);
    const hidden = new ChimneySmoke(fx, "chimney:h1", top, lift);
    hidden.setVisible(false); // still burning out
    fx.clearAll();
    expect(fake.live()).toEqual([]);
    expect(fx.playing()).toBe(0);
  });

  it("should draw nothing without the fx_smoke sheet", () => {
    const noSmoke: FxArt = { ...fakeArt, has: (name) => name !== "fx_smoke" };
    const warned: string[] = [];
    const bare = new EffectsRuntime(fake.scene, noSmoke, lights.lights, {
      warn: (m: string) => warned.push(m),
    });
    new ChimneySmoke(bare, "chimney:h0", top, lift);
    new ChimneySmoke(bare, "chimney:h1", top, lift);
    expect(fake.made).toEqual([]);
    expect(warned).toHaveLength(1);
  });
});
