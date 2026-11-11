import { describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { palette } from "@/utils/canvasPalette";
import { BARROW_HEX } from "@/utils/theme";
import type { InkText } from "./cardDust";
import { CARD_SMOKE, CardSmoke, type SmokeInk } from "./cardSmoke";
import { fakeArt, fakeScene } from "./fakeScene";
import type { FxArt } from "./runtime";

// FS-PQ2TW §Change: Smoke, a trial alternate leave, R41–R51: the arrival card can leave as smoke,
// soft puffs rising and swelling off its strokes while its letters blur, drift up and fade.

/** A text's canvas as a Phaser Text holds it, its ink drawn from `rows` ('#' is ink, '.' is none). */
function stubText(rows: string[], { x = 100, y = 50 } = {}): InkText {
  const width = rows[0].length;
  const height = rows.length;
  const data = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, py) =>
    [...row].forEach((c, px) => {
      if (c === "#") data[(py * width + px) * 4 + 3] = 255;
    }),
  );
  return {
    canvas: { width, height },
    context: { getImageData: () => ({ data, width, height }) as ImageData },
    style: { resolution: 1 },
    x,
    y,
    displayOriginX: 0,
    displayOriginY: 0,
    scaleX: 1,
    scaleY: 1,
  };
}

/** A text that takes a blur, as a Phaser Text does under WebGL: what it was asked. */
function blurrable(text: InkText) {
  const blurs: { args: unknown[]; strength: number; padding: unknown[] }[] = [];
  const filters = {
    internal: {
      addBlur: vi.fn((...args: number[]) => {
        const blur = {
          args,
          strength: args[3],
          padding: [] as unknown[],
          setPaddingOverride: (...p: unknown[]) => void (blur.padding = p),
        };
        blurs.push(blur);
        return blur;
      }),
    },
  };
  const enableFilters = vi.fn();
  return { text: Object.assign(text, { enableFilters, filters }), blurs, enableFilters };
}

/** A seeded run of `Math.random`'s shape, so a test sees many draws but the same ones each run. */
function seeded(seed = 7): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** The card's three pieces as the smoke takes them: plain objects with a place and an alpha. */
const letters = () => [{ y: 270, alpha: 1 }, { y: 300, alpha: 1 }, { y: 320, alpha: 1 }];

/** A card's ink: one text, a small glyph, and a rule under it. */
function cardInk(text: InkText = stubText(["####", "####"], { x: 400, y: 280 })): SmokeInk {
  return { texts: [text], rule: { x1: 390, x2: 410, y: 300 }, letters: letters() };
}

function smokeStage({ art = fakeArt, reduced = false } = {}) {
  const stage = fakeScene();
  const logger = { warn: vi.fn() };
  const smoke = new CardSmoke(stage.scene, () => art, { reducedMotion: () => reduced, logger, random: seeded() });
  const gone = vi.fn();
  const emitters = () => stage.made.filter((m) => m.kind === "particles");
  const config = () => emitters()[0].args[3] as Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;
  return { ...stage, logger, smoke, gone, emitters, config };
}

type Op = {
  onEmit?: (p: object, key: string, value?: number) => number;
  onUpdate?: (p: object, key: string, t: number, value: number) => number;
};
type Puff = { x: number; y: number; velocityX: number; velocityY: number; angle: number };

/**
 * One puff's whole life, stepped as Phaser 4.2.1's `Particle.update` steps it (60 a second): its
 * x and y ops, its velocity (no acceleration: a steady speed), its turn. Where it is at each step,
 * and how far to the side of the straight line its velocity alone would have drawn.
 */
function rise(config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig, speed: number) {
  const op = (key: string) => (config as Record<string, unknown>)[key] as Op | undefined;
  const zone = config.emitZone as { source: { getRandomPoint(p: { x: number; y: number }): void } };
  const puff: Puff = { x: 0, y: 0, velocityX: 0, velocityY: 0, angle: 0 };
  zone.source.getRandomPoint(puff);
  const start = { x: puff.x, y: puff.y };
  // its turn first, then its heading, as the engine emits them (Particle.fire)
  puff.angle = op("rotate")!.onEmit!(puff, "rotate");
  const rad = (op("angle")!.onEmit!(puff, "angle") * Math.PI) / 180;
  const heading = { x: Math.cos(rad), y: Math.sin(rad) };
  puff.velocityX = heading.x * speed;
  puff.velocityY = heading.y * speed;
  const turnedFrom = puff.angle;

  const path: { t: number; x: number; y: number; side: number; angle: number }[] = [];
  const life = config.lifespan as number;
  const delta = 1000 / 60;
  let flown = 0;
  for (let left = life; left > 0; left -= delta) {
    const t = 1 - left / life;
    puff.x = op("x")?.onUpdate?.(puff, "x", t, puff.x) ?? puff.x;
    puff.y = op("y")?.onUpdate?.(puff, "y", t, puff.y) ?? puff.y;
    puff.x += (puff.velocityX * delta) / 1000;
    puff.y += (puff.velocityY * delta) / 1000;
    puff.angle = op("rotate")!.onUpdate!(puff, "rotate", t, puff.angle);
    flown += delta / 1000;
    const dx = puff.x - start.x;
    const dy = puff.y - start.y;
    path.push({ t, x: dx, y: dy, side: dx - heading.x * speed * flown, angle: puff.angle - turnedFrom });
  }
  return path;
}

/** Many puffs off a card's worth of ink, at the slowest, a middling and the fastest speed. */
function risings() {
  const { smoke, gone, config } = smokeStage();
  smoke.play(cardInk(stubText(Array(6).fill("#".repeat(30)), { x: 380, y: 270 })), 961, gone);
  const speeds = [CARD_SMOKE.speed.from, 20, CARD_SMOKE.speed.to];
  return Array.from({ length: 60 }, (_, n) => rise(config(), speeds[n % speeds.length]));
}

describe("the smoke's numbers (FS-PQ2TW R44–R49, R51)", () => {
  it("should be one typed record, at its starting values", () => {
    expect(CARD_SMOKE).toEqual({
      durationMs: 2000,
      maxParticles: 400,
      density: 0.2,
      texture: "fx_smoke",
      scale: { from: 0.3, to: 1.5 },
      speed: { from: 10, to: 30 },
      spreadDeg: 35,
      sway: { amplitude: { from: 4, to: 10 }, periodMs: { from: 1000, to: 1600 } },
      turnDegPerS: { from: -30, to: 30 },
      tint: { from: "vellum", to: "slateLight" },
      alpha: { from: 0.35, to: 0 },
      ease: { scale: "Sine.easeOut", alpha: "Sine.easeIn", color: "Linear" },
      letters: { blur: 2, rise: 8, fadeMs: 1200, ease: "Sine.easeOut" },
    });
  });

  it("should keep every FS-KYPQ9 §B rule but §B.6's count and §B.2's ceiling (R49)", () => {
    // §B.2: one fixed duration; the exception's ceiling is 2000 ms, and the letters go inside it
    expect(Number.isInteger(CARD_SMOKE.durationMs)).toBe(true);
    expect(CARD_SMOKE.durationMs).toBeLessThanOrEqual(2000);
    expect(CARD_SMOKE.letters.fadeMs).toBeLessThanOrEqual(1200);
    // §B.3: the easing allowlist
    for (const ease of [...Object.values(CARD_SMOKE.ease), CARD_SMOKE.letters.ease])
      expect(ease).toMatch(/^(Linear|(Sine|Quad|Cubic)\.ease(In|Out|InOut))$/);
    // §B.4: smoke grows, never shrinks, ends at ≤ 1.6
    expect(CARD_SMOKE.scale.to).toBeGreaterThan(CARD_SMOKE.scale.from);
    expect(CARD_SMOKE.scale.to).toBeLessThanOrEqual(1.6);
    // §B.7: BARROW keys only, at most 3 colours, no amber, no oxblood
    const colours = [CARD_SMOKE.tint.from, CARD_SMOKE.tint.to];
    for (const c of colours) expect(c in BARROW_HEX).toBe(true);
    expect(new Set(colours).size).toBeLessThanOrEqual(3);
    expect(colours).not.toContain("amber");
    expect(colours).not.toContain("oxblood");
    // the exception, bounded: a few hundred puffs, slow, rising, never sprayed
    expect(CARD_SMOKE.maxParticles).toBeLessThanOrEqual(400);
    expect(CARD_SMOKE.speed.to).toBeLessThanOrEqual(30);
    expect(CARD_SMOKE.spreadDeg).toBeLessThanOrEqual(35);
    // semi-transparent: a puff alone is never solid
    expect(CARD_SMOKE.alpha.from).toBeLessThan(0.5);
    expect(CARD_SMOKE.alpha.to).toBe(0);
  });

  it("should start in the card text's colour and go to a grey (R46)", () => {
    expect(BARROW_HEX[CARD_SMOKE.tint.from]).toBe(palette.hudText);
    expect(CARD_SMOKE.tint.to).toBe("slateLight");
  });
});

describe("CardSmoke (FS-PQ2TW §Change: Smoke)", () => {
  it("should take the card's letters away itself (R43)", () => {
    expect(smokeStage().smoke.takesLetters).toBe(true);
  });

  it("should rise from one fx_smoke emitter over the card, under the HUD, swelling and thinning (R45–R47)", () => {
    const { smoke, gone, emitters, config } = smokeStage();

    expect(smoke.play(cardInk(), 961, gone)).toBe(true);

    expect(emitters()).toHaveLength(1);
    const [emitter] = emitters();
    expect(emitter.args.slice(0, 3)).toEqual([0, 0, "art:fx-0"]);
    expect(emitter.calls.setDepth).toEqual([961]);
    expect(emitter.calls.setScrollFactor).toEqual([0]);
    expect(config()).toMatchObject({
      frame: ["fx_smoke/idle/0/0"],
      lifespan: 2000,
      speed: { min: 10, max: 30 },
      maxParticles: 400,
      emitting: false,
      scale: { start: 0.3, end: 1.5, ease: "Sine.easeOut" },
      alpha: { start: 0.35, end: 0, ease: "Sine.easeIn" },
      color: [palette.hudText, BARROW_HEX.slateLight],
      colorEase: "Linear",
    });
    // a steady speed: nothing pulls a puff faster or slower (R44)
    expect(config().accelerationX).toBeUndefined();
    expect(config().accelerationY).toBeUndefined();
    expect(gone).not.toHaveBeenCalled();
  });

  it("should emit once, every puff from a point the strokes or the rule drew, not a box (R42)", () => {
    const { smoke, gone, emitters, config } = smokeStage();
    // a ring of ink with an empty middle: a box around it would put puffs in the hole
    const ring = stubText(["######", "#....#", "#....#", "######"], { x: 400, y: 280 });
    smoke.play(cardInk(ring), 961, gone);

    // 16 view px² of ring and 20 px of rule: 0.2 puffs per px² of ink, rounded up
    expect(emitters()[0].calls.emitParticle).toEqual([8]);
    const zone = config().emitZone as { type: string; source: { getRandomPoint(p: { x: number; y: number }): void } };
    expect(zone.type).toBe("random");
    for (let n = 0; n < 200; n++) {
      const p = { x: 0, y: 0 };
      zone.source.getRandomPoint(p);
      const inRing = p.x >= 400 && p.x < 406 && p.y >= 280 && p.y < 284;
      const inHole = p.x >= 401 && p.x < 405 && p.y >= 281 && p.y < 283;
      const onRule = p.x >= 390 && p.x <= 410 && Math.abs(p.y - 300) <= 0.5;
      expect((inRing && !inHole) || onRule, `${p.x},${p.y}`).toBe(true);
    }
  });

  it.each([
    ["a little ink", ["####", "####"]],
    ["a heading's worth", Array(24).fill("#".repeat(60))],
    ["far more than the cap", Array(60).fill("#".repeat(400))],
  ])("should stay within its caps from %s: count, speed, life, size (R44, R45, R47–R49)", (_, rows) => {
    const { smoke, gone, emitters, config } = smokeStage();

    smoke.play(cardInk(stubText(rows, { x: 200, y: 100 })), 961, gone);

    const [emitted] = emitters()[0].calls.emitParticle as [number];
    const ink = rows.length * rows[0].length + 20;
    expect(emitted).toBe(Math.min(Math.ceil(0.2 * ink), 400));
    expect(config().maxParticles).toBeLessThanOrEqual(400);
    expect((config().speed as { min: number; max: number }).min).toBeGreaterThanOrEqual(10);
    expect((config().speed as { min: number; max: number }).max).toBeLessThanOrEqual(30);
    expect(config().lifespan).toBeLessThanOrEqual(2000);
    expect((config().scale as { start: number; end: number }).end).toBeLessThanOrEqual(1.6);
  });

  it("should head every puff within 35° of straight up (R44, R49)", () => {
    const { smoke, gone, config } = smokeStage();
    smoke.play(cardInk(), 961, gone);
    const angle = config().angle as Op;

    const headings = Array.from({ length: 300 }, () => angle.onEmit!({ x: 400, y: 300 }, "angle"));
    for (const deg of headings) expect(Math.abs(deg - -90)).toBeLessThanOrEqual(35);
    // spread both ways, not one column
    expect(Math.min(...headings)).toBeLessThan(-110);
    expect(Math.max(...headings)).toBeGreaterThan(-70);
  });

  describe("each puff's rise (R44)", () => {
    it("should rise: every puff ends higher than it started, and the smoke rises on average", () => {
      const paths = risings();
      for (const path of paths) expect(path.at(-1)!.y).toBeLessThan(0);
      const mean = paths.reduce((sum, p) => sum + p.at(-1)!.y, 0) / paths.length;
      // 2 s at 10–30 px/s, within 35° of up: about 20–60 px up
      expect(mean).toBeLessThan(-20);
      expect(mean).toBeGreaterThan(-60);
    });

    it("should rise at a steady speed, never fast then slow", () => {
      for (const path of risings()) {
        const early = -path[30].y / path[30].t;
        const late = -(path.at(-1)!.y - path[90].y) / (path.at(-1)!.t - path[90].t);
        expect(Math.abs(late - early) / early).toBeLessThan(0.35);
      }
    });

    it("should curl: sway to either side, from none, growing over its life, never past its widest", () => {
      for (const path of risings()) {
        for (const s of path.filter((s) => s.t <= 0.05)) expect(Math.abs(s.side)).toBeLessThan(1);
        for (const s of path) expect(Math.abs(s.side)).toBeLessThanOrEqual(CARD_SMOKE.sway.amplitude.to + 1e-9);
        const late = path.filter((s) => s.t >= 0.4).map((s) => s.side);
        expect(Math.max(...late) - Math.min(...late)).toBeGreaterThan(1);
      }
    });

    it("should turn each puff slowly, its own way, at most 30° a second", () => {
      const turns = risings().map((path) => path.at(-1)!.angle);
      for (const turn of turns) expect(Math.abs(turn)).toBeLessThanOrEqual(30 * 2 + 1e-9);
      expect(turns.some((t) => t > 5)).toBe(true);
      expect(turns.some((t) => t < -5)).toBe(true);
    });
  });

  describe("the letters (R43)", () => {
    it("should blur the texts from none, and drift heading, rule and line up as they fade by 1200 ms", () => {
      const { smoke, gone, tweens } = smokeStage();
      const { text, blurs, enableFilters } = blurrable(stubText(["####"], { x: 400, y: 280 }));
      const ink = cardInk(text);

      smoke.play(ink, 961, gone);

      expect(enableFilters).toHaveBeenCalledOnce();
      expect(blurs).toHaveLength(1);
      expect(blurs[0].strength).toBe(0);
      // padded to the blur as it grows, not clipped at the text's edge
      expect(blurs[0].padding).toEqual([null]);
      const fade = tweens.find((t) => t.config.targets === ink.letters);
      expect(fade?.config).toMatchObject({ alpha: 0, y: "-=8", duration: 1200, ease: "Sine.easeOut" });
      const blur = tweens.find((t) => Array.isArray(t.config.targets) && (t.config.targets as unknown[])[0] === blurs[0]);
      expect(blur?.config).toMatchObject({ strength: 2, duration: 1200 });
    });

    it("should still drift and fade the letters where nothing can blur (the canvas renderer)", () => {
      const { smoke, gone, tweens } = smokeStage();
      const ink = cardInk();

      smoke.play(ink, 961, gone);

      expect(tweens.map((t) => t.config.targets)).toEqual([ink.letters]);
    });

    it("should leave a text alone that has filters enabled but none to add (no WebGL)", () => {
      const { smoke, gone, tweens } = smokeStage();
      const text = Object.assign(stubText(["####"], { x: 400, y: 280 }), { enableFilters: vi.fn(), filters: null });

      expect(smoke.play(cardInk(text), 961, gone)).toBe(true);

      expect(tweens).toHaveLength(1);
    });
  });

  it("should be gone at 2000 ms, its emitter destroyed, and say so (R48, R50)", () => {
    const { smoke, gone, timers, live } = smokeStage();
    smoke.play(cardInk(), 961, gone);

    const [end] = timers;
    expect(end.delay).toBe(2000);
    end.fire();

    expect(live()).toEqual([]);
    expect(gone).toHaveBeenCalledOnce();
  });

  it("should take the puffs and the letters' tweens away at once on a stop, and not say it is gone (R50)", () => {
    const { smoke, gone, timers, tweens, live } = smokeStage();
    const { text } = blurrable(stubText(["####"], { x: 400, y: 280 }));
    smoke.play(cardInk(text), 961, gone);

    smoke.stop();

    expect(live()).toEqual([]);
    expect(timers[0].removed).toBe(true);
    expect(tweens.map((t) => t.stopped)).toEqual([true, true]);
    expect(gone).not.toHaveBeenCalled();
    smoke.stop();
  });

  it("should take the old smoke away when the next card leaves", () => {
    const { smoke, gone, emitters, timers } = smokeStage();
    smoke.play(cardInk(), 961, gone);
    smoke.play(cardInk(), 961, gone);

    expect(emitters().map((e) => e.destroyed)).toEqual([true, false]);
    expect(timers[0].removed).toBe(true);
  });

  it("should let go of the smoke without touching the scene once it has ended", () => {
    const { smoke, gone, live, timers, tweens } = smokeStage();
    smoke.play(cardInk(), 961, gone);

    smoke.forget();
    smoke.stop();

    expect(live()).toHaveLength(1);
    expect(timers[0].removed).toBe(false);
    expect(tweens.every((t) => !t.stopped)).toBe(true);
  });

  it("should make no puff and touch no letter under reduced motion, and log nothing (R50)", () => {
    const { smoke, gone, made, timers, tweens, logger } = smokeStage({ reduced: true });

    expect(smoke.play(cardInk(), 961, gone)).toBe(false);

    expect(made).toEqual([]);
    expect(timers).toEqual([]);
    expect(tweens).toEqual([]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("should play nothing without the fx_smoke sheet, logged once (R50)", () => {
    const missing: FxArt = { has: (name) => name !== "fx_smoke", resolve: fakeArt.resolve };
    const { smoke, gone, made, tweens, logger } = smokeStage({ art: missing });

    expect(smoke.play(cardInk(), 961, gone)).toBe(false);
    expect(smoke.play(cardInk(), 961, gone)).toBe(false);

    expect(made).toEqual([]);
    expect(tweens).toEqual([]);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("should play nothing, logged once, from a read that throws, and never fall back to the bounds (R50)", () => {
    const { smoke, gone, made, logger } = smokeStage();
    const tainted = stubText(["####"]);
    tainted.context = {
      getImageData: () => {
        throw new Error("The canvas has been tainted by cross-origin data.");
      },
    };

    expect(smoke.play(cardInk(tainted), 961, gone)).toBe(false);
    expect(smoke.play(cardInk(tainted), 961, gone)).toBe(false);

    expect(made).toEqual([]);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("should play nothing, logged, from texts that drew no ink (R50)", () => {
    const { smoke, gone, made, logger } = smokeStage();

    expect(smoke.play(cardInk(stubText(["....", "...."])), 961, gone)).toBe(false);

    expect(made).toEqual([]);
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});
