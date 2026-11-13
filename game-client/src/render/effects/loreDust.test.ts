import { describe, expect, it, vi } from "vitest";
import { palette } from "@/utils/canvasPalette";
import { fakeArt, fakeScene } from "./fakeScene";
import { LORE_DUST, LoreDust, type LoreDustScene } from "./loreDust";

// FS-XWHZP §A R6-R7, §B R9. I-XWHZP-1: the fine dust off a lore line, and a dread line's embers.

type Config = Record<string, unknown>;

const AREA = { x: 100, y: 200, width: 300, height: 30 };
const TINT = { from: palette.loreText, to: palette.loreFade };
const EMBERS = { from: palette.loreEmber, to: palette.loreEmberDeep };

function stage(options: { reducedMotion?: boolean; art?: typeof fakeArt | undefined } = {}) {
  const fake = fakeScene();
  const logger = { warn: vi.fn() };
  const art = "art" in options ? options.art : fakeArt;
  const dust = new LoreDust(fake.scene as unknown as LoreDustScene, () => art, {
    reducedMotion: () => options.reducedMotion ?? false,
    logger,
    random: () => 0.5,
  });
  const config = (i = 0) => fake.made.filter((m) => m.kind === "particles")[i]?.args[3] as Config;
  return { ...fake, dust, logger, config };
}

describe("LoreDust (FS-XWHZP R6, R7, R9)", () => {
  it("should rise off the line as a trail: one mote per 80 ms at most, 40 alive, in the tone's colours", () => {
    const { dust, made, config } = stage();
    expect(dust.start(AREA, TINT, 1990)).toBe(true);

    expect(made).toHaveLength(1);
    expect(made[0].calls.setScrollFactor).toEqual([0]);
    expect(made[0].calls.setDepth).toEqual([1990]);
    const c = config();
    expect(c.frequency).toBeGreaterThanOrEqual(40);
    expect(c.frequency).toBe(LORE_DUST.trail.frequencyMs);
    expect(c.quantity).toBe(1);
    expect(c.maxAliveParticles).toBe(40);
    expect(c.color).toEqual([palette.loreText, palette.loreFade]);
    // upward: every heading within the spread of straight up
    expect(c.angle).toEqual({ min: -115, max: -65 });
  });

  it("should seed its motes inside the line's box", () => {
    const { dust, config } = stage();
    dust.start(AREA, TINT, 1990);
    const p = { x: 0, y: 0 };
    (config().emitZone as { source: { getRandomPoint(p: object): void } }).source.getRandomPoint(p);
    expect(p).toEqual({ x: 250, y: 215 });
  });

  it("should stop emitting on stop, and go once the last mote has lived its life", () => {
    const { dust, made, timers } = stage();
    dust.start(AREA, TINT, 1990);
    dust.stop();

    expect(made[0].calls.stop).toEqual([]);
    expect(made[0].destroyed).toBe(false);
    expect(timers.at(-1)?.delay).toBe(LORE_DUST.trail.lifespanMs);
    timers.at(-1)?.fire();
    expect(made[0].destroyed).toBe(true);
  });

  it("should emit at most 12 embers once from the line's foot, never as an explode", () => {
    const { dust, made, config, timers } = stage();
    expect(dust.burst(AREA, EMBERS, 1990)).toBe(true);

    const c = config();
    expect(c.emitting).toBe(false);
    expect(c.maxParticles).toBeLessThanOrEqual(12);
    expect(made[0].calls.emitParticle).toEqual([12]);
    expect(c.color).toEqual([palette.loreEmber, palette.loreEmberDeep]);
    const p = { x: 0, y: 0 };
    (c.emitZone as { source: { getRandomPoint(p: object): void } }).source.getRandomPoint(p);
    expect(p.y).toBe(AREA.y + AREA.height);
    timers.at(-1)?.fire();
    expect(made[0].destroyed).toBe(true);
  });

  it("should send embers low and mostly sideways", () => {
    const { dust, config } = stage();
    dust.burst(AREA, EMBERS, 1990);
    const angle = (config().angle as { onEmit(): number }).onEmit();
    // at random 0.5: leaned 15 degrees up, to the left
    expect(angle).toBe(-165);
  });

  it("should play nothing under reduced motion (R7)", () => {
    const { dust, made } = stage({ reducedMotion: true });
    expect(dust.start(AREA, TINT, 1990)).toBe(false);
    expect(dust.burst(AREA, EMBERS, 1990)).toBe(false);
    expect(made).toHaveLength(0);
  });

  it("should play nothing without the dust sheet, saying so once (R7)", () => {
    const { dust, made, logger } = stage({ art: undefined });
    expect(dust.start(AREA, TINT, 1990)).toBe(false);
    expect(dust.start(AREA, TINT, 1990)).toBe(false);
    expect(made).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("should take every mote away at once on clear", () => {
    const { dust, made } = stage();
    dust.start(AREA, TINT, 1990);
    dust.burst(AREA, EMBERS, 1990);
    dust.clear();
    expect(made.every((m) => m.destroyed)).toBe(true);
  });

  it("should touch nothing on forget: the scene took it", () => {
    const { dust, made } = stage();
    dust.start(AREA, TINT, 1990);
    dust.forget();
    dust.clear();
    expect(made.some((m) => m.destroyed)).toBe(false);
  });
});
