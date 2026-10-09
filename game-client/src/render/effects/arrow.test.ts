import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { worldToScreen } from "@/render/iso/projection";
import { BARROW_HEX } from "@/utils/theme";
import {
  ARROW_EFFECTS,
  ARROW_FLIGHT,
  BOW_LIFT,
  playArrowImpact,
  playArrowRelease,
} from "./arrow";
import { fakeArt, fakeLights, fakeScene } from "./fakeScene";
import { alongAim } from "./projectile";
import { EffectsRuntime } from "./runtime";
import { EFFECTS, type EffectEntry, type Token } from "./table";

describe("archer arrow (FS-KYPQ9 §F)", () => {
  let fake: ReturnType<typeof fakeScene>;
  let lights: ReturnType<typeof fakeLights>;
  let fx: EffectsRuntime;
  const me = { x: 200, y: 200 };
  const target = { x: 200, y: 420 };

  beforeEach(() => {
    fake = fakeScene();
    lights = fakeLights();
    fx = new EffectsRuntime(fake.scene, fakeArt, lights.lights, {
      warn: () => {},
    });
  });

  describe("release (§F.1)", () => {
    it("should shimmer at the bow, 16 px along the projected aim and lifted to bow height, for 140 ms", () => {
      playArrowRelease(fx, "self", me, target);
      const bow = alongAim(me, target, 16);
      const s = worldToScreen(bow.x, bow.y);
      const shimmer = fake.made.find((m) => m.kind === "image")!;
      expect(shimmer.args[3]).toBe("fx_glow/idle/0/0");
      // off the feet, at the bow hand
      expect(shimmer.calls.setPosition).toEqual([s.x, s.y - BOW_LIFT]);
      expect(BOW_LIFT).toBeGreaterThanOrEqual(30);
      expect(shimmer.calls.setTint?.[0]).toBe(BARROW_HEX.vellumDark);
      // faint: never a glow
      expect(shimmer.calls.setAlpha?.[0]).toBeLessThanOrEqual(0.45);
      expect(fake.timers.map((t) => t.delay)).toEqual([140]);
      // 16 screen px from the delver's projected position
      const from = worldToScreen(me.x, me.y);
      expect(Math.hypot(s.x - from.x, s.y - from.y)).toBeCloseTo(16);
    });

    it("should loose 2-3 fibre motes in vellumDark/vellum at the bow", () => {
      playArrowRelease(fx, "self", me, target);
      const motes = fake.made.find((m) => m.kind === "particles")!;
      const [count] = motes.calls.emitParticle as [number];
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(3);
      expect((motes.args[3] as { tint: number[] }).tint).toEqual([
        BARROW_HEX.vellumDark,
        BARROW_HEX.vellum,
      ]);
      const bow = alongAim(me, target, 16);
      const s = worldToScreen(bow.x, bow.y);
      expect(motes.calls.setPosition).toEqual([s.x, s.y - BOW_LIFT]);
    });

    it("should light nothing and leave nothing after 140 ms", () => {
      playArrowRelease(fx, "self", me, target);
      expect(lights.added).toEqual([]);
      fake.timers[0].fire();
      expect(fake.live()).toEqual([]);
    });

    it("should still play when the aim is the delver's own point", () => {
      playArrowRelease(fx, "self", me, me);
      expect(fake.made.some((m) => m.kind === "image")).toBe(true);
    });
  });

  describe("flight (§F.2)", () => {
    it("should fly the baked arrow turned to its heading, with a pale air-streak and no light", () => {
      expect(ARROW_FLIGHT.body).toBe("fx_arrow");
      expect(ARROW_FLIGHT.turns).toBe(true);
      // flies at the bow's height, where the release snapped, not out of the feet
      expect(ARROW_FLIGHT.lift).toBe(BOW_LIFT);
      const trail: EffectEntry = EFFECTS[ARROW_FLIGHT.trail];
      expect(trail.timing).toMatchObject({ kind: "stream", lifeMs: 180 });
      expect(
        trail.timing.kind === "stream" && trail.timing.intervalMs,
      ).toBeGreaterThanOrEqual(40);
      expect(trail.particles?.texture).toEqual(["fx_dust"]);
      // pale enough to read at 1x over the dark ground, never glaring (revised §F.2)
      expect(trail.particles?.tint).toEqual(["vellumDark", "vellum"]);
      expect(trail.particles?.alpha.from).toBeLessThanOrEqual(0.55);
      expect(trail.particles?.alpha.to).toBe(0);
      // at most 12 alive: two per ≥ 40 ms over a 180 ms life
      expect(trail.particles?.count).toBeLessThanOrEqual(2);
      expect(trail.timing).toMatchObject({ maxAlive: 12 });
      expect("light" in trail).toBe(false);
    });

    it("should stamp no light while its trail streams", () => {
      const played = fx.play("a1", ARROW_FLIGHT.trail, me, {
        direction: { x: 0, y: 1 },
      });
      played?.moveTo({ x: 200, y: 260 });
      expect(lights.added).toEqual([]);
      const stream = fake.made.find((m) => m.kind === "particles")!;
      const config = stream.args[3] as {
        alpha: { start: number };
        lifespan: number;
      };
      expect(config.alpha.start).toBeLessThanOrEqual(0.55);
      expect(config.lifespan).toBe(180);
    });
  });

  describe("impact (§F.3)", () => {
    const at = { x: 260, y: 380 };

    it("should drop a dull puff of at most 6 dust and splinter motes over 300 ms", () => {
      playArrowImpact(fx, "a1", at);
      const puff = fake.made.find((m) => m.kind === "particles")!;
      const [count] = puff.calls.emitParticle as [number];
      expect(count).toBeLessThanOrEqual(6);
      const config = puff.args[3] as {
        lifespan: number;
        accelerationY: number;
        tint: number[];
      };
      expect(config.lifespan).toBe(300);
      expect(config.accelerationY).toBeGreaterThan(0);
      expect(config.tint).toEqual([
        BARROW_HEX.barrowBrown,
        BARROW_HEX.vellumDark,
      ]);
      // at the arrow's flight height, where it was last drawn
      const s = worldToScreen(at.x, at.y);
      expect(puff.calls.setPosition).toEqual([s.x, s.y - BOW_LIFT]);
      expect(fake.timers.map((t) => t.delay)).toEqual([300]);
    });

    it("should light nothing, draw no sprite and leave nothing after 300 ms", () => {
      playArrowImpact(fx, "a1", at);
      expect(lights.added).toEqual([]);
      expect(fake.made.map((m) => m.kind)).toEqual(["particles"]);
      fake.timers[0].fire();
      expect(fake.live()).toEqual([]);
    });
  });

  describe("palette (§B.7)", () => {
    it("should play only steel-and-dust tokens, and never the amber accent", () => {
      // vellum joins steel and dust for the smear, the dust and the air-streak (revised §B.7)
      const dust: Token[] = [
        "slate",
        "slateLight",
        "vellum",
        "vellumDark",
        "vellumFaint",
        "barrowBrown",
      ];
      for (const name of ARROW_EFFECTS) {
        const e = EFFECTS[name];
        const tokens = [
          ...(("sprite" in e && e.sprite.tint) || []),
          ...(e.particles?.tint ?? []),
        ];
        for (const token of tokens) expect(dust).toContain(token);
        expect("light" in e).toBe(false);
      }
    });

    it("should name no amber key and no colour literal in its source", () => {
      const src = readFileSync(join(__dirname, "arrow.ts"), "utf8");
      expect(src).not.toMatch(/["'`]amber["'`]/);
      expect(src).not.toMatch(/0x[0-9a-fA-F]{6}|#[0-9a-fA-F]{6}/);
    });
  });
});
