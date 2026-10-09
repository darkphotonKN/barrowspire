import { beforeEach, describe, expect, it } from "vitest";
import { worldToScreen } from "@/render/iso/projection";
import { BARROW_HEX } from "@/utils/theme";
import { fakeArt, fakeLights, fakeScene } from "./fakeScene";
import { CHARGE_MS, playCharge } from "./charge";
import { EffectsRuntime } from "./runtime";

type EmitterConfig = {
  lifespan: number;
  tint: number[];
  angle: { min: number; max: number };
  speed: { min: number; max: number };
  emitting: boolean;
  frequency?: number;
  quantity?: number;
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
  const configOf = (e: { args: unknown[] }) => e.args[3] as EmitterConfig;
  const burst = () => emitters().find((e) => !configOf(e).emitting)!;
  const drag = () => emitters().find((e) => configOf(e).emitting)!;

  it("should kick a low dust burst of at most 8 motes at the start over 450 ms", () => {
    playCharge(fx, "self", start, target);
    const b = burst();
    expect(configOf(b).lifespan).toBe(450);
    const [count] = b.calls.emitParticle as [number];
    expect(count).toBeLessThanOrEqual(8);
    // pale dust, so it reads on the brown ground
    expect(configOf(b).tint).toEqual([
      BARROW_HEX.vellumDark,
      BARROW_HEX.vellumFaint,
    ]);
    const s = worldToScreen(start.x, start.y);
    expect(b.calls.setPosition).toEqual([s.x, s.y]);
  });

  it("should kick dust up at the warrior's feet as the server carries them, kicked back along the heading", () => {
    playCharge(fx, "self", start, target);
    const d = drag();
    const config = configOf(d);
    // a mote at most every 40 ms, each living 350 ms, faint and pale
    expect(config.frequency).toBeGreaterThanOrEqual(40);
    expect(config.lifespan).toBe(350);
    expect(config.tint).toEqual([
      BARROW_HEX.vellumDark,
      BARROW_HEX.vellumFaint,
    ]);
    // world +x runs down-right on screen; the motes drift back along that line
    const h = worldToScreen(1, 0);
    const back = (Math.atan2(-h.y, -h.x) * 180) / Math.PI;
    expect((config.angle.min + config.angle.max) / 2).toBeCloseTo(back);
    expect(config.angle.max - config.angle.min).toBeLessThanOrEqual(40);
    // they barely drift: the dust lies where the feet were, along the path run
    expect((config.speed.max * 350) / 1000).toBeLessThanOrEqual(14);
  });

  it("should follow the drawn position, not predict where the charge lands", () => {
    const charge = playCharge(fx, "self", start, target);
    const source = drag().calls.startFollow?.[0] as { x: number; y: number };
    const s0 = worldToScreen(start.x, start.y);
    expect([source.x, source.y]).toEqual([s0.x, s0.y]);

    const mid = { x: 260, y: 200 };
    charge.follow(mid);
    const s1 = worldToScreen(mid.x, mid.y);
    expect([source.x, source.y]).toEqual([s1.x, s1.y]);
  });

  it("should stop kicking dust once the charge is over and let the motes settle", () => {
    const charge = playCharge(fx, "self", start, target);
    charge.end();
    const d = drag() as unknown as { destroyed: boolean };
    expect(fx.playing("self")).toBe(1); // the burst at the start still settling
    expect(d.destroyed).toBe(false); // the dust already kicked lives out its life
    for (const t of fake.timers) t.fire();
    expect(fake.live()).toEqual([]);
    expect(fx.playing()).toBe(0);
  });

  it("should last about as long as the server's charge plus the ease's catch-up", () => {
    // 180 px at 450 px/s is 400 ms on the server; the ease catches up within ~100 ms
    expect(CHARGE_MS).toBeGreaterThanOrEqual(400);
    expect(CHARGE_MS).toBeLessThanOrEqual(520);
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
    const charge = playCharge(fx, "self", start, target);
    charge.end();
    for (const t of fake.timers) t.fire();
    expect(fake.live()).toEqual([]);
    expect(fx.playing()).toBe(0);
  });

  it("should be harmless to follow or end after a reset cut it", () => {
    const charge = playCharge(fx, "self", start, target);
    fx.clearAll();
    expect(() => {
      charge.follow({ x: 300, y: 200 });
      charge.end();
    }).not.toThrow();
    expect(fake.live()).toEqual([]);
  });
});
