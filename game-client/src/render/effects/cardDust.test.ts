import { describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { palette } from "@/utils/canvasPalette";
import { BARROW_HEX } from "@/utils/theme";
import {
  CARD_DUST,
  CardDust,
  driftAngle,
  ruleCells,
  seedPoints,
  strokeCells,
  type CardInk,
  type InkText,
} from "./cardDust";
import { fakeArt, fakeScene } from "./fakeScene";
import type { FxArt } from "./runtime";

// FS-PQ2TW §D R24–R36. I-PQ2TW-5: the arrival card leaves as dust off its letters.

/**
 * A text's canvas as a Phaser Text holds it, its ink drawn from `rows` ('#' is ink, '.' is
 * none), at `resolution` canvas px per view px, its display origin at `origin` view px.
 */
function stubText(
  rows: string[],
  { x = 100, y = 50, resolution = 1, origin = { x: 0, y: 0 }, alpha = 255 } = {},
): InkText {
  const width = rows[0].length;
  const height = rows.length;
  const data = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, py) =>
    [...row].forEach((c, px) => {
      if (c === "#") data[(py * width + px) * 4 + 3] = alpha;
    }),
  );
  return {
    canvas: { width, height },
    context: {
      getImageData: (sx: number, sy: number, sw: number, sh: number) => {
        expect([sx, sy, sw, sh]).toEqual([0, 0, width, height]);
        return { data, width, height } as ImageData;
      },
    },
    style: { resolution },
    x,
    y,
    displayOriginX: origin.x,
    displayOriginY: origin.y,
    scaleX: 1,
    scaleY: 1,
  };
}

/** A seeded run of `Math.random`'s shape, so a test sees many draws but the same ones each run. */
function seeded(seed = 7): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Whether view point `p` falls inside an inked pixel of `rows` drawn as `stubText` lays it. */
function onInk(rows: string[], p: { x: number; y: number }, left: number, top: number, resolution: number) {
  const px = Math.floor((p.x - left) * resolution);
  const py = Math.floor((p.y - top) * resolution);
  return rows[py]?.[px] === "#";
}

describe("the dust's start points (FS-PQ2TW R25)", () => {
  const GLYPH = [
    "..........",
    ".##....##.",
    ".##....##.",
    ".########.",
    ".##....##.",
    ".##....##.",
    "..........",
  ];

  it.each([1, 2, 1.5])("should start every point on a pixel the text drew, at resolution %s", (resolution) => {
    const text = stubText(GLYPH, { x: 100, y: 50, resolution, origin: { x: 3, y: 2 } });

    const points = seedPoints(strokeCells([text]), 400, seeded());

    expect(points).toHaveLength(400);
    // the canvas' top left sits at the text's position less its display origin, in view px
    for (const p of points) expect(onInk(GLYPH, p, 97, 48, resolution), `${p.x},${p.y}`).toBe(true);
  });

  it("should reach every stroke of the glyph, the bar and both stems", () => {
    const points = seedPoints(strokeCells([stubText(GLYPH)]), 400, seeded());
    const at = (px: number, py: number) => points.some((p) => Math.floor(p.x - 100) === px && Math.floor(p.y - 50) === py);

    expect(at(1, 1)).toBe(true);
    expect(at(8, 5)).toBe(true);
    expect(at(4, 3)).toBe(true);
  });

  it("should take a faint edge of a stroke as no ink", () => {
    expect(strokeCells([stubText(GLYPH, { alpha: 40 })])).toEqual([]);
  });

  it("should lay points along the rule's line and nowhere off it", () => {
    const points = seedPoints(ruleCells({ x1: 310, x2: 490, y: 308 }), 300, seeded());

    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(310);
      expect(p.x).toBeLessThanOrEqual(490);
      expect(Math.abs(p.y - 308)).toBeLessThanOrEqual(0.5);
    }
    expect(Math.min(...points.map((p) => p.x))).toBeLessThan(330);
    expect(Math.max(...points.map((p) => p.x))).toBeGreaterThan(470);
  });

  it("should spread the points over heading, rule and subtitle in proportion to their ink", () => {
    // 40 view px² of ink at resolution 2 (160 canvas px), 40 at resolution 1, and a 40 px rule
    const heading = stubText(Array(10).fill("#".repeat(16)), { x: 0, y: 0, resolution: 2 });
    const subtitle = stubText(Array(4).fill("#".repeat(10)), { x: 0, y: 100 });
    const cells = [...strokeCells([heading, subtitle]), ...ruleCells({ x1: 0, x2: 40, y: 200 })];

    const points = seedPoints(cells, 3000, seeded());
    const share = (from: number, to: number) => points.filter((p) => p.y >= from && p.y < to).length / points.length;

    expect(share(0, 50)).toBeCloseTo(1 / 3, 1);
    expect(share(50, 150)).toBeCloseTo(1 / 3, 1);
    expect(share(150, 250)).toBeCloseTo(1 / 3, 1);
  });

  it("should make no point from no ink", () => {
    expect(seedPoints([], 600, seeded())).toEqual([]);
  });
});

describe("the dust's numbers (FS-PQ2TW R26–R28, R32–R34)", () => {
  it("should be one typed record, as the owner tuned it on 2026-11-12", () => {
    expect(CARD_DUST).toEqual({
      durationMs: 1300,
      maxParticles: 1500,
      texture: "fx_dust",
      scale: { from: 0.15, to: 0.15 },
      speed: { from: 25, to: 110 },
      lean: 0.5,
      drag: 1,
      tint: { from: "vellum", to: "vellumDark" },
      alpha: { from: 1, to: 0 },
      ease: "Sine.easeIn",
    });
  });

  it("should keep every FS-KYPQ9 §B rule but §B.6's count and spread and §B.2's ceiling (R33)", () => {
    // §B.2: one fixed duration; the exception's ceiling is 1300 ms, not 1200
    expect(Number.isInteger(CARD_DUST.durationMs)).toBe(true);
    expect(CARD_DUST.durationMs).toBeLessThanOrEqual(1300);
    // §B.3: the easing allowlist
    expect(CARD_DUST.ease).toMatch(/^(Linear|(Sine|Quad|Cubic)\.ease(In|Out|InOut))$/);
    // §B.4: dust may grow, never shrinks, ends at ≤ 1.6
    expect(CARD_DUST.scale.to).toBeGreaterThanOrEqual(CARD_DUST.scale.from);
    expect(CARD_DUST.scale.to).toBeLessThanOrEqual(1.6);
    // §B.7: BARROW keys only, at most 3 colours, no amber, no oxblood
    const colours = [CARD_DUST.tint.from, CARD_DUST.tint.to];
    for (const c of colours) expect(c in BARROW_HEX).toBe(true);
    expect(new Set(colours).size).toBeLessThanOrEqual(3);
    expect(colours).not.toContain("amber");
    expect(colours).not.toContain("oxblood");
    // the exception, bounded: a drift, not a burst
    expect(CARD_DUST.maxParticles).toBeLessThanOrEqual(1500);
    expect(CARD_DUST.speed.from).toBeLessThanOrEqual(CARD_DUST.speed.to);
    expect(CARD_DUST.speed.to).toBeLessThanOrEqual(110);
    expect(CARD_DUST.drag).toBeGreaterThan(0);
  });

  it("should start in the heading's colour and darken to the subtitle's (R28)", () => {
    expect(BARROW_HEX[CARD_DUST.tint.from]).toBe(palette.hudText);
    expect(BARROW_HEX[CARD_DUST.tint.to]).toBe(palette.hudLabel);
  });
});

describe("the dust's drift (FS-PQ2TW R26)", () => {
  const centre = { x: 400, y: 300 };
  const heading = (deg: number) => ({ x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180) });

  it.each([
    [{ x: 300, y: 290 }],
    [{ x: 500, y: 290 }],
    [{ x: 410, y: 280 }],
    [{ x: 380, y: 330 }],
    [{ x: 520, y: 330 }],
  ])("should carry a mote at %o away from the card's centre, leaning up", (at) => {
    const d = heading(driftAngle(at, centre, CARD_DUST.lean));
    const out = { x: at.x - centre.x, y: at.y - centre.y };
    const len = Math.hypot(out.x, out.y);

    expect(d.x * out.x + d.y * out.y).toBeGreaterThan(0);
    // leaning up: higher on the screen than straight outward
    expect(d.y).toBeLessThan(out.y / len);
  });

  it("should lift a mote at the very centre straight up", () => {
    expect(driftAngle(centre, centre, CARD_DUST.lean)).toBeCloseTo(-90);
  });

  it("should keep the lean under the outward pull, so a mote under the centre still goes out", () => {
    expect(CARD_DUST.lean).toBeGreaterThan(0);
    expect(CARD_DUST.lean).toBeLessThan(1);
  });
});

/** A card's ink: one text, the glyph below, and a rule under it. */
function cardInk(text: InkText = stubText(["####", "####"], { x: 400, y: 280 })): CardInk {
  return { texts: [text], rule: { x1: 390, x2: 410, y: 300 } };
}

function dustStage({ art = fakeArt, reduced = false } = {}) {
  const stage = fakeScene();
  const logger = { warn: vi.fn() };
  const dust = new CardDust(stage.scene, () => art, { reducedMotion: () => reduced, logger, random: seeded() });
  const gone = vi.fn();
  const emitters = () => stage.made.filter((m) => m.kind === "particles");
  const config = () => emitters()[0].args[3] as Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;
  return { ...stage, logger, dust, gone, emitters, config };
}

describe("CardDust (FS-PQ2TW §D)", () => {
  it("should break the card to dust from one emitter over the card, under the HUD (R29, R32)", () => {
    const { dust, gone, emitters, config } = dustStage();

    expect(dust.play(cardInk(), 951, gone)).toBe(true);

    expect(emitters()).toHaveLength(1);
    const [emitter] = emitters();
    expect(emitter.args.slice(0, 3)).toEqual([0, 0, "art:fx-0"]);
    expect(emitter.calls.setDepth).toEqual([951]);
    expect(emitter.calls.setScrollFactor).toEqual([0]);
    expect(config()).toMatchObject({
      frame: ["fx_dust/idle/0/0"],
      lifespan: 1300,
      speed: { min: 25, max: 110 },
      maxParticles: 1500,
      emitting: false,
      scale: { start: 0.15, end: 0.15, ease: "Sine.easeIn" },
      alpha: { start: 1, end: 0, ease: "Sine.easeIn" },
      color: [palette.hudText, palette.hudLabel],
      colorEase: "Sine.easeIn",
    });
    expect(gone).not.toHaveBeenCalled();
  });

  it("should emit once, every mote from a point the strokes or the rule drew (R25)", () => {
    const { dust, gone, emitters, config } = dustStage();
    dust.play(cardInk(), 951, gone);

    // 8 view px² of glyph and 20 px of rule: one mote per px² of ink, under the cap
    expect(emitters()[0].calls.emitParticle).toEqual([28]);
    const zone = config().emitZone as { type: string; source: { getRandomPoint(p: { x: number; y: number }): void } };
    expect(zone.type).toBe("random");
    for (let n = 0; n < 28; n++) {
      const p = { x: 0, y: 0 };
      zone.source.getRandomPoint(p);
      const onGlyph = p.x >= 400 && p.x < 404 && p.y >= 280 && p.y < 282;
      const onRule = p.x >= 390 && p.x <= 410 && Math.abs(p.y - 300) <= 0.5;
      expect(onGlyph || onRule, `${p.x},${p.y}`).toBe(true);
    }
  });

  it("should make at most 1500 motes, however much ink there is (R32)", () => {
    const { dust, gone, emitters } = dustStage();
    const big = stubText(Array(40).fill("#".repeat(300)), { x: 250, y: 260 });

    dust.play(cardInk(big), 951, gone);

    expect(emitters()[0].calls.emitParticle).toEqual([1500]);
  });

  it.each([
    ["a little ink", ["####", "####"]],
    ["a heading's worth", Array(24).fill("#".repeat(60))],
    ["far more than the cap", Array(60).fill("#".repeat(400))],
  ])("should stay within its caps from %s: count, start speed, life, size (R26, R27, R32, R33)", (_, rows) => {
    const { dust, gone, emitters, config } = dustStage();

    dust.play(cardInk(stubText(rows, { x: 200, y: 100 })), 951, gone);

    const [emitted] = emitters()[0].calls.emitParticle as [number];
    const ink = rows.length * rows[0].length + 20;
    // one mote per view px² of ink (glyph and the 20 px rule), capped
    expect(emitted).toBe(Math.min(ink, 1500));
    expect(config().maxParticles).toBeLessThanOrEqual(1500);
    expect((config().speed as { min: number; max: number }).min).toBeGreaterThanOrEqual(25);
    expect((config().speed as { min: number; max: number }).max).toBeLessThanOrEqual(110);
    expect(config().lifespan).toBeLessThanOrEqual(1300);
    expect((config().scale as { start: number; end: number }).end).toBeLessThanOrEqual(0.15);
  });

  it("should send each mote out from the card's centre, never faster than 110 px/s at the start (R26)", () => {
    const { dust, gone, config } = dustStage();
    dust.play(cardInk(), 951, gone);
    const angle = config().angle as { onEmit: (p: { x: number; y: number }) => number };

    // the ink spans x 390..410 and y 280..300.5: its centre is (400, 290.25)
    expect(angle.onEmit({ x: 409, y: 300 })).toBeCloseTo(driftAngle({ x: 409, y: 300 }, { x: 400, y: 290.25 }, CARD_DUST.lean));
    expect((config().speed as { max: number }).max).toBeLessThanOrEqual(110);
  });

  it("should slow every mote as it drifts (R26)", () => {
    const { dust, gone, config } = dustStage();
    dust.play(cardInk(), 951, gone);
    const ax = config().accelerationX as { onUpdate: (p: object, k: string, t: number, v: number) => number };
    const ay = config().accelerationY as { onUpdate: (p: object, k: string, t: number, v: number) => number };

    // a mote integrated as Phaser does, 60 steps a second for its whole life
    const mote = { velocityX: 40, velocityY: -30 };
    const speeds: number[] = [];
    for (let i = 0; i < 60; i++) {
      mote.velocityX += ax.onUpdate(mote, "accelerationX", i / 60, 0) / 60;
      mote.velocityY += ay.onUpdate(mote, "accelerationY", i / 60, 0) / 60;
      speeds.push(Math.hypot(mote.velocityX, mote.velocityY));
    }
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]).toBeLessThan(speeds[i - 1]);
    expect(Math.sign(mote.velocityX)).toBe(1);
    expect(speeds.at(-1)!).toBeLessThan(50 / 2);
  });

  it("should be gone at 1300 ms, its emitter destroyed, and say so (R27, R36)", () => {
    const { dust, gone, timers, live } = dustStage();
    dust.play(cardInk(), 951, gone);

    const [end] = timers;
    expect(end.delay).toBe(1300);
    end.fire();

    expect(live()).toEqual([]);
    expect(gone).toHaveBeenCalledOnce();
  });

  it("should take the dust away at once on a stop, and not say it is gone", () => {
    const { dust, gone, timers, live } = dustStage();
    dust.play(cardInk(), 951, gone);

    dust.stop();

    expect(live()).toEqual([]);
    expect(timers[0].removed).toBe(true);
    expect(gone).not.toHaveBeenCalled();
    dust.stop();
  });

  it("should take the old dust away when the next card breaks", () => {
    const { dust, gone, emitters, timers } = dustStage();
    dust.play(cardInk(), 951, gone);
    dust.play(cardInk(), 951, gone);

    expect(emitters().map((e) => e.destroyed)).toEqual([true, false]);
    expect(timers[0].removed).toBe(true);
  });

  it("should let go of the dust without touching the scene once it has ended", () => {
    const { dust, gone, live, timers } = dustStage();
    dust.play(cardInk(), 951, gone);

    dust.forget();
    dust.stop();

    expect(live()).toHaveLength(1);
    expect(timers[0].removed).toBe(false);
  });

  it("should make no mote under reduced motion, and log nothing (R31)", () => {
    const { dust, gone, made, timers, logger } = dustStage({ reduced: true });

    expect(dust.play(cardInk(), 951, gone)).toBe(false);

    expect(made).toEqual([]);
    expect(timers).toEqual([]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("should play nothing without the fx sheet, logged once (FS-KYPQ9 §B.10)", () => {
    const missing: FxArt = { has: () => false, resolve: fakeArt.resolve };
    const { dust, gone, made, logger } = dustStage({ art: missing });

    expect(dust.play(cardInk(), 951, gone)).toBe(false);
    expect(dust.play(cardInk(), 951, gone)).toBe(false);

    expect(made).toEqual([]);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("should play nothing, logged once, from a read that throws, and never fall back to the bounds (R35)", () => {
    const { dust, gone, made, logger } = dustStage();
    const tainted = stubText(["####"]);
    tainted.context = {
      getImageData: () => {
        throw new Error("The canvas has been tainted by cross-origin data.");
      },
    };

    expect(dust.play(cardInk(tainted), 951, gone)).toBe(false);
    expect(dust.play(cardInk(tainted), 951, gone)).toBe(false);

    expect(made).toEqual([]);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("should play nothing, logged, from texts that drew no ink, the rule's line alone included (R35)", () => {
    const { dust, gone, made, logger } = dustStage();

    expect(dust.play(cardInk(stubText(["....", "...."])), 951, gone)).toBe(false);

    expect(made).toEqual([]);
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});
