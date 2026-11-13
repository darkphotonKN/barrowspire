import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GAMEPLAY_SFX,
  GAMEPLAY_SFX_CEILING,
  GAMEPLAY_SFX_MAX_LENGTH,
  renderGameplaySfx,
  renderSfx,
  seededRandom,
} from "./gameplaySfx";
import { GAMEPLAY_EFFECTS } from "./gameplaySounds";

/** The largest absolute sample. */
function peak(samples: Float32Array): number {
  let top = 0;
  for (const s of samples) top = Math.max(top, Math.abs(s));
  return top;
}

/** The share of a sound's energy below about 250 Hz (a one-pole low-pass): a rough measure of how heavy it is. */
function lowShare(samples: Float32Array, rate: number): number {
  const pole = Math.exp((-2 * Math.PI * 250) / rate);
  let energy = 0;
  let low = 0;
  let held = 0;
  for (const s of samples) {
    held = (1 - pole) * s + pole * held;
    energy += s ** 2;
    low += held ** 2;
  }
  return low / energy;
}

describe("the gameplay effects' generators (FS-AND39 R9–R11)", () => {
  it("should render hit_monster at 48000 Hz within 0.6 s, from 0 to 0, peaking at the ceiling × its trim", () => {
    const samples = renderGameplaySfx("hit_monster", 48000);

    expect(samples).toBeInstanceOf(Float32Array);
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.length).toBeLessThanOrEqual(28800);
    expect(samples[0]).toBe(0);
    expect(samples[samples.length - 1]).toBe(0);
    expect(Math.abs(peak(samples) - GAMEPLAY_SFX_CEILING * GAMEPLAY_SFX.hit_monster.trim)).toBeLessThan(1e-6);
  });

  describe.each([44100, 48000])("at %i Hz", (rate) => {
    it.each(GAMEPLAY_EFFECTS)("should render %s short, finite, from 0 to 0 and at the ceiling × its trim", (effect) => {
      const samples = renderGameplaySfx(effect, rate);

      expect(samples).toBeInstanceOf(Float32Array);
      expect(samples.length).toBeGreaterThan(0);
      expect(samples.length).toBeLessThanOrEqual(GAMEPLAY_SFX_MAX_LENGTH * rate);
      expect(samples.every(Number.isFinite)).toBe(true);
      expect(samples[0]).toBe(0);
      expect(samples[samples.length - 1]).toBe(0);
      expect(Math.abs(peak(samples) - GAMEPLAY_SFX_CEILING * GAMEPLAY_SFX[effect].trim)).toBeLessThan(1e-6);
    });

    it("should render each effect the same twice, and no two effects alike", () => {
      const rendered = GAMEPLAY_EFFECTS.map((effect) => renderGameplaySfx(effect, rate));

      GAMEPLAY_EFFECTS.forEach((effect, i) => expect(renderGameplaySfx(effect, rate)).toEqual(rendered[i]));
      for (let a = 0; a < rendered.length; a++)
        for (let b = a + 1; b < rendered.length; b++) expect(rendered[a]).not.toEqual(rendered[b]);
    });
  });

  it("should move the peak with a recipe's trim and with the ceiling", () => {
    const recipe = GAMEPLAY_SFX.hit_monster;

    expect(Math.abs(peak(renderSfx({ ...recipe, trim: 0.5 }, 48000)) - 0.35)).toBeLessThan(1e-6);
    expect(Math.abs(peak(renderSfx(recipe, 48000, 0.4)) - 0.4)).toBeLessThan(1e-6);
  });

  it("should throw for a recipe that renders no sound, so the install can leave it out", () => {
    expect(() => renderSfx({ length: 0.2, seed: 1, trim: 1, layers: [] }, 48000)).toThrow();
  });

  it("should make hit_player heavier and longer than hit_monster, so the two are told apart (R10)", () => {
    const player = renderGameplaySfx("hit_player", 48000);
    const monster = renderGameplaySfx("hit_monster", 48000);

    expect(lowShare(player, 48000)).toBeGreaterThan(lowShare(monster, 48000));
    expect(player.length).toBeGreaterThan(monster.length);
  });
});

describe("the gameplay effects' tunables (FS-AND39 R11)", () => {
  it("should start at a ceiling of 0.7", () => {
    expect(GAMEPLAY_SFX_CEILING).toBe(0.7);
  });

  it("should hold one recipe per effect: at most 0.6 s, its own seed, a trim of 1.0, and its layers", () => {
    expect(Object.keys(GAMEPLAY_SFX).sort()).toEqual([...GAMEPLAY_EFFECTS].sort());
    for (const recipe of Object.values(GAMEPLAY_SFX)) {
      expect(recipe.length).toBeGreaterThan(0);
      expect(recipe.length).toBeLessThanOrEqual(0.6);
      expect(recipe.trim).toBe(1.0);
      expect(recipe.layers.length).toBeGreaterThan(0);
    }
    expect(new Set(Object.values(GAMEPLAY_SFX).map((r) => r.seed)).size).toBe(GAMEPLAY_EFFECTS.length);
  });
});

describe("seededRandom (FS-AND39 R9)", () => {
  it("should give the same stream for the same seed, a different one for another, all in [0, 1)", () => {
    const draw = (seed: number) => Array.from({ length: 64 }, seededRandom(seed));

    expect(draw(7)).toEqual(draw(7));
    expect(draw(7)).not.toEqual(draw(8));
    expect(draw(7).every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe("the generators' module (FS-AND39 R9)", () => {
  const source = readFileSync(new URL("./gameplaySfx.ts", import.meta.url), "utf8");

  it("should import neither Phaser nor any Web Audio type", () => {
    expect(source).not.toMatch(/from\s+["']phaser["']/);
    expect(source).not.toMatch(/\b(AudioBuffer|AudioContext|BaseAudioContext|AudioNode)\b/);
  });

  it("should never call Math.random", () => {
    expect(source).not.toMatch(/Math\.random/);
  });
});
