/**
 * The gameplay sound effects, built in code (FS-AND39 R9–R11): each effect is a recipe of numbers,
 * rendered by a pure, seeded function of the sample rate to mono samples. Nothing is sourced, and
 * nothing here reads Phaser or Web Audio, so the same samples come out in a test, at boot and on
 * the dev sound board.
 *
 * Simple but medieval rustic (R10): every effect is a few layers of wood, leather, iron, cloth and
 * flesh, each one a physical gesture rather than a synth voice:
 *
 * - `noise`: a burst of band-limited noise (a slap, a rustle, a rush of cloth, a fire's roar);
 * - `strike`: a short noise tap ringing a body's inharmonic modes (a wood knock, a flesh thud,
 *   an iron ring);
 * - `creak`: a stick-slip train of ticks ringing a body (a hinge, a leather strap);
 * - `crackle`: sparse random grains (embers, grit, cloth crinkle);
 * - `pluck`: a plucked string (a bowstring), by Karplus-Strong.
 *
 * Retune by numbers in {@link GAMEPLAY_SFX} (a `Tunes FS-AND39` change). Times are seconds,
 * frequencies hertz. A layer's `gain` is its peak in the mix before the whole effect is
 * peak-normalised to {@link GAMEPLAY_SFX_CEILING} × the effect's `trim`.
 */

import type { GameplayEffect } from "./gameplaySounds";

/** Every effect's peak (R11): headroom for overlapping effects, since Web Audio clips at the output. Tunable. */
export const GAMEPLAY_SFX_CEILING = 0.7;

/** The longest an effect may last (R11). */
export const GAMEPLAY_SFX_MAX_LENGTH = 0.6;

/** The fades at each end, so an effect starts and ends at zero with no click (R11). */
export const GAMEPLAY_SFX_EDGES = { fadeIn: 0.001, fadeOut: 0.015 } as const;

/** One mode of a struck or creaking body: its frequency as a ratio of the body's, how long it rings to -60 dB, and its level. */
export type Mode = readonly [ratio: number, t60: number, level: number];

/** A burst of band-limited noise, shaped by a linear attack and an exponential decay to -60 dB. */
export interface NoiseLayer {
  kind: "noise";
  at: number;
  low: number;
  high: number;
  attack: number;
  decay: number;
  gain: number;
}

/** A body struck once: a noise tap `tap` long, softened to `tapHz`, ringing the body's modes over `freq`. */
export interface StrikeLayer {
  kind: "strike";
  at: number;
  freq: number;
  modes: readonly Mode[];
  tap: number;
  tapHz: number;
  gain: number;
}

/** A creak: stick-slip ticks, `length` long, their rate gliding from `rateFrom` to `rateTo` with `jitter` (0–1), ringing the modes over `freq`. */
export interface CreakLayer {
  kind: "creak";
  at: number;
  length: number;
  rateFrom: number;
  rateTo: number;
  jitter: number;
  freq: number;
  modes: readonly Mode[];
  gain: number;
}

/** Random grains, `density` a second for `length`, band-limited and shaped as a {@link NoiseLayer}. */
export interface CrackleLayer {
  kind: "crackle";
  at: number;
  length: number;
  density: number;
  low: number;
  high: number;
  attack: number;
  decay: number;
  gain: number;
}

/** A plucked string at `freq`, ringing to -60 dB in `t60`; `pickHz` is how bright the pluck is (its noise softened above it). */
export interface PluckLayer {
  kind: "pluck";
  at: number;
  freq: number;
  t60: number;
  pickHz: number;
  gain: number;
}

export type SfxLayer = NoiseLayer | StrikeLayer | CreakLayer | CrackleLayer | PluckLayer;

/** One effect's tunables (R11): its length (≤ 0.6 s), its PRNG seed, its trim in (0, 1], and its layers. */
export interface SfxRecipe {
  length: number;
  seed: number;
  trim: number;
  layers: readonly SfxLayer[];
}

/** A free iron bar's modes: the inharmonic ratios that make metal ring as metal. */
const IRON_BAR = [1, 2.76, 5.4, 8.93] as const;

/** The 11 effects' tunables (R10, R11), each starting from R10's character. */
export const GAMEPLAY_SFX: Record<GameplayEffect, SfxRecipe> = {
  // a dull flesh-and-leather thud: a short low thump under a brief slap of noise
  hit_monster: {
    length: 0.28,
    seed: 101,
    trim: 1.0,
    layers: [
      { kind: "strike", at: 0, freq: 95, modes: [[1, 0.09, 1], [1.6, 0.06, 0.5], [2.3, 0.04, 0.3]], tap: 0.008, tapHz: 300, gain: 1 },
      { kind: "noise", at: 0, low: 40, high: 260, attack: 0.002, decay: 0.12, gain: 0.7 },
      { kind: "noise", at: 0, low: 900, high: 3200, attack: 0.001, decay: 0.035, gain: 0.35 },
    ],
  },
  // heavier and lower than hit_monster, with a gritty crunch
  hit_player: {
    length: 0.38,
    seed: 202,
    trim: 1.0,
    layers: [
      { kind: "strike", at: 0, freq: 62, modes: [[1, 0.14, 1], [1.5, 0.1, 0.6], [2.2, 0.06, 0.3]], tap: 0.012, tapHz: 220, gain: 1 },
      { kind: "noise", at: 0, low: 30, high: 180, attack: 0.003, decay: 0.18, gain: 0.8 },
      { kind: "crackle", at: 0.002, length: 0.1, density: 260, low: 1200, high: 4500, attack: 0.002, decay: 0.09, gain: 0.3 },
      { kind: "noise", at: 0, low: 600, high: 2000, attack: 0.001, decay: 0.03, gain: 0.2 },
    ],
  },
  // a wooden lid: a short hinge creak, then a hollow wood knock
  chest_open: {
    length: 0.55,
    seed: 303,
    trim: 1.0,
    layers: [
      { kind: "creak", at: 0, length: 0.26, rateFrom: 70, rateTo: 140, jitter: 0.25, freq: 820, modes: [[1, 0.03, 1], [1.73, 0.025, 0.6], [2.9, 0.02, 0.35]], gain: 0.55 },
      { kind: "strike", at: 0.27, freq: 180, modes: [[1, 0.12, 1], [2.45, 0.07, 0.55], [4.1, 0.04, 0.3]], tap: 0.004, tapHz: 2500, gain: 1 },
      { kind: "noise", at: 0.27, low: 60, high: 400, attack: 0.002, decay: 0.08, gain: 0.5 },
    ],
  },
  // cloth and leather: a soft rustle of a sack or a heap being opened
  loot_open: {
    length: 0.42,
    seed: 404,
    trim: 1.0,
    layers: [
      { kind: "crackle", at: 0, length: 0.36, density: 900, low: 1500, high: 6000, attack: 0.04, decay: 0.3, gain: 0.6 },
      { kind: "noise", at: 0, low: 400, high: 2500, attack: 0.03, decay: 0.25, gain: 0.5 },
      { kind: "strike", at: 0.05, freq: 120, modes: [[1, 0.06, 1], [1.9, 0.04, 0.4]], tap: 0.015, tapHz: 400, gain: 0.4 },
    ],
  },
  // a heavier, iron-bound lid than chest_open: creak, an iron clink, a deep wood thump
  stash_open: {
    length: 0.6,
    seed: 505,
    trim: 1.0,
    layers: [
      { kind: "creak", at: 0, length: 0.28, rateFrom: 50, rateTo: 100, jitter: 0.3, freq: 560, modes: [[1, 0.04, 1], [1.8, 0.03, 0.6], [3.1, 0.02, 0.3]], gain: 0.55 },
      { kind: "strike", at: 0.27, freq: 1850, modes: [[IRON_BAR[0], 0.18, 1], [IRON_BAR[1], 0.11, 0.5], [IRON_BAR[2], 0.06, 0.3]], tap: 0.0015, tapHz: 8000, gain: 0.35 },
      { kind: "strike", at: 0.29, freq: 110, modes: [[1, 0.16, 1], [2.3, 0.08, 0.45], [3.8, 0.05, 0.25]], tap: 0.006, tapHz: 1200, gain: 1 },
      { kind: "noise", at: 0.29, low: 40, high: 300, attack: 0.002, decay: 0.14, gain: 0.6 },
    ],
  },
  // a leather pouch taking something in: a soft thump and a short rustle
  item_pickup: {
    length: 0.3,
    seed: 606,
    trim: 1.0,
    layers: [
      { kind: "strike", at: 0, freq: 140, modes: [[1, 0.07, 1], [1.9, 0.05, 0.4]], tap: 0.01, tapHz: 500, gain: 0.9 },
      { kind: "noise", at: 0, low: 50, high: 350, attack: 0.002, decay: 0.07, gain: 0.5 },
      { kind: "crackle", at: 0.02, length: 0.16, density: 700, low: 1800, high: 6000, attack: 0.01, decay: 0.14, gain: 0.45 },
      { kind: "noise", at: 0.02, low: 700, high: 3000, attack: 0.01, decay: 0.12, gain: 0.3 },
    ],
  },
  // a buckle and strap: a small iron tick over a leather creak
  item_swap: {
    length: 0.32,
    seed: 707,
    trim: 1.0,
    layers: [
      { kind: "creak", at: 0, length: 0.2, rateFrom: 35, rateTo: 55, jitter: 0.4, freq: 420, modes: [[1, 0.02, 1], [2.1, 0.015, 0.5]], gain: 0.6 },
      { kind: "strike", at: 0.1, freq: 3100, modes: [[IRON_BAR[0], 0.06, 1], [IRON_BAR[1], 0.035, 0.45], [IRON_BAR[2], 0.02, 0.25]], tap: 0.001, tapHz: 9000, gain: 0.45 },
      { kind: "noise", at: 0.1, low: 2500, high: 8000, attack: 0.0005, decay: 0.012, gain: 0.3 },
    ],
  },
  // a heavy stride: a boot stamp and a rush of cloth
  dash: {
    length: 0.45,
    seed: 808,
    trim: 1.0,
    layers: [
      { kind: "strike", at: 0, freq: 85, modes: [[1, 0.1, 1], [1.7, 0.07, 0.45], [2.6, 0.04, 0.25]], tap: 0.006, tapHz: 700, gain: 1 },
      { kind: "noise", at: 0, low: 40, high: 500, attack: 0.002, decay: 0.08, gain: 0.55 },
      { kind: "noise", at: 0, low: 1500, high: 5000, attack: 0.001, decay: 0.03, gain: 0.25 },
      { kind: "noise", at: 0.02, low: 500, high: 3500, attack: 0.09, decay: 0.35, gain: 0.6 },
      { kind: "crackle", at: 0.02, length: 0.35, density: 120, low: 300, high: 1500, attack: 0.06, decay: 0.3, gain: 0.25 },
    ],
  },
  // a roaring whoomp of flame: a low noise swell with crackle
  triple_fireball: {
    length: 0.6,
    seed: 909,
    trim: 1.0,
    layers: [
      { kind: "noise", at: 0, low: 40, high: 350, attack: 0.07, decay: 0.5, gain: 1 },
      { kind: "noise", at: 0, low: 250, high: 1400, attack: 0.05, decay: 0.4, gain: 0.5 },
      { kind: "crackle", at: 0.03, length: 0.5, density: 90, low: 1500, high: 6500, attack: 0.02, decay: 0.45, gain: 0.5 },
    ],
  },
  // a bowstring's release: a plucked low string with a wooden limb's knock
  shadow_shot: {
    length: 0.5,
    seed: 1010,
    trim: 1.0,
    layers: [
      { kind: "pluck", at: 0, freq: 98, t60: 0.35, pickHz: 1400, gain: 1 },
      { kind: "strike", at: 0, freq: 240, modes: [[1, 0.06, 1], [2.6, 0.04, 0.5], [4.3, 0.025, 0.3]], tap: 0.003, tapHz: 3000, gain: 0.6 },
      { kind: "noise", at: 0, low: 800, high: 4000, attack: 0.0005, decay: 0.02, gain: 0.3 },
    ],
  },
  // steel on steel: a short, bright iron ring with a quick decay
  parry: {
    length: 0.5,
    seed: 1111,
    trim: 1.0,
    layers: [
      { kind: "strike", at: 0, freq: 1320, modes: [[IRON_BAR[0], 0.32, 1], [IRON_BAR[1], 0.22, 0.7], [IRON_BAR[2], 0.14, 0.45], [IRON_BAR[3], 0.08, 0.3]], tap: 0.0012, tapHz: 10000, gain: 1 },
      { kind: "strike", at: 0, freq: 1475, modes: [[1, 0.26, 1], [2.53, 0.18, 0.6], [4.9, 0.1, 0.35]], tap: 0.0012, tapHz: 10000, gain: 0.6 },
      { kind: "noise", at: 0, low: 2500, high: 9000, attack: 0.0005, decay: 0.04, gain: 0.5 },
    ],
  },
};

/** `effect`'s samples at `sampleRate` (R9): mono, the same on every call. */
export function renderGameplaySfx(effect: GameplayEffect, sampleRate: number): Float32Array {
  return renderSfx(GAMEPLAY_SFX[effect], sampleRate);
}

/**
 * A recipe's samples at `sampleRate`: its layers mixed, the DC taken out, faded to zero at both
 * ends and peak-normalised to `ceiling × trim` (R11). Throws for a recipe that renders silent or
 * not finite, so the boot install leaves it out (R12).
 */
export function renderSfx(recipe: SfxRecipe, sampleRate: number, ceiling: number = GAMEPLAY_SFX_CEILING): Float32Array {
  const n = Math.floor(Math.min(recipe.length, GAMEPLAY_SFX_MAX_LENGTH) * sampleRate);
  const mix = new Float64Array(n);
  recipe.layers.forEach((layer, index) => {
    const start = Math.round(layer.at * sampleRate);
    if (start >= n) return;
    const random = seededRandom(recipe.seed * 7919 + index * 104729);
    const sound = normalised(renderLayer(layer, n - start, sampleRate, random));
    for (let i = 0; i < sound.length; i++) mix[start + i] += sound[i] * layer.gain;
  });
  blockDc(mix, sampleRate);
  fadeEdges(mix, sampleRate);

  const top = peakOf(mix);
  if (!(top > 0) || !Number.isFinite(top)) throw new Error(`sound effect renders no sound (peak ${top})`);
  const scale = (ceiling * recipe.trim) / top;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = mix[i] * scale;
  return out;
}

/**
 * Mulberry32, a small 32-bit PRNG: the same stream for the same seed on every engine, so an
 * effect renders the same on every boot (R9). The platform's own random is never used.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One layer, `n` samples from its start. */
function renderLayer(layer: SfxLayer, n: number, rate: number, random: () => number): Float64Array {
  switch (layer.kind) {
    case "noise":
      return renderNoise(layer, n, rate, random);
    case "strike":
      return renderStrike(layer, n, rate, random);
    case "creak":
      return renderCreak(layer, n, rate, random);
    case "crackle":
      return renderCrackle(layer, n, rate, random);
    case "pluck":
      return renderPluck(layer, n, rate, random);
  }
}

function renderNoise(layer: NoiseLayer, n: number, rate: number, random: () => number): Float64Array {
  return shaped(whiteNoise(n, random), layer, rate);
}

function renderStrike(layer: StrikeLayer, n: number, rate: number, random: () => number): Float64Array {
  const tap = new Float64Array(n);
  const tapLength = Math.max(1, Math.round(layer.tap * rate));
  for (let i = 0; i < Math.min(tapLength, n); i++) tap[i] = (random() * 2 - 1) * (1 - i / tapLength);
  return ringModes(biquad(tap, "lowpass", layer.tapHz, Math.SQRT1_2, rate), layer.freq, layer.modes, rate);
}

function renderCreak(layer: CreakLayer, n: number, rate: number, random: () => number): Float64Array {
  const ticks = new Float64Array(n);
  for (let t = 0; t < layer.length; ) {
    const i = Math.round(t * rate);
    if (i >= n) break;
    const along = t / layer.length;
    ticks[i] += (0.5 + 0.5 * random()) * Math.sin(Math.PI * along);
    const tickRate = layer.rateFrom + (layer.rateTo - layer.rateFrom) * along;
    t += (1 + layer.jitter * (random() * 2 - 1)) / tickRate;
  }
  return ringModes(ticks, layer.freq, layer.modes, rate);
}

function renderCrackle(layer: CrackleLayer, n: number, rate: number, random: () => number): Float64Array {
  const grains = new Float64Array(n);
  // grains fall at random, `density` a second on average; most are faint, a few loud
  const gap = () => -Math.log(1 - random()) / layer.density;
  for (let t = gap(); t < layer.length; t += gap()) {
    const start = Math.round(t * rate);
    const size = Math.max(1, Math.round((0.0005 + 0.002 * random()) * rate));
    const loudness = random() ** 2;
    for (let i = 0; i < size && start + i < n; i++) grains[start + i] += (random() * 2 - 1) * loudness * (1 - i / size);
  }
  return shaped(grains, layer, rate);
}

/** `x` kept to the layer's band and shaped by its attack and decay. */
function shaped(x: Float64Array, layer: NoiseLayer | CrackleLayer, rate: number): Float64Array {
  const out = band(x, layer.low, layer.high, rate);
  for (let i = 0; i < out.length; i++) out[i] *= envelope(i / rate, layer.attack, layer.decay);
  return out;
}

/** Karplus-Strong: a delay line one period long, seeded with noise softened above `pickHz`, averaged and damped on each pass. */
function renderPluck(layer: PluckLayer, n: number, rate: number, random: () => number): Float64Array {
  const period = Math.max(2, Math.round(rate / layer.freq));
  const line = biquad(whiteNoise(period, random), "lowpass", layer.pickHz, Math.SQRT1_2, rate);
  const loss = Math.pow(10, -3 / (layer.t60 * layer.freq));
  const out = new Float64Array(n);
  for (let i = 0, at = 0; i < n; i++) {
    out[i] = line[at];
    line[at] = loss * 0.5 * (line[at] + line[(at + 1) % period]);
    at = (at + 1) % period;
  }
  return out;
}

/** `excitation` ringing each mode of a body over `freq`: a two-pole resonator per mode, decaying to -60 dB in its t60. */
function ringModes(excitation: Float64Array, freq: number, modes: readonly Mode[], rate: number): Float64Array {
  const out = new Float64Array(excitation.length);
  for (const [ratio, t60, level] of modes) {
    const f = freq * ratio;
    if (f >= rate * 0.45) continue;
    const r = Math.pow(10, -3 / (t60 * rate));
    const a1 = 2 * r * Math.cos((2 * Math.PI * f) / rate);
    const a2 = -r * r;
    const mode = new Float64Array(excitation.length);
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < excitation.length; i++) {
      const y = excitation[i] + a1 * y1 + a2 * y2;
      mode[i] = y;
      y2 = y1;
      y1 = y;
    }
    const top = peakOf(mode);
    if (top > 0) for (let i = 0; i < out.length; i++) out[i] += (mode[i] / top) * level;
  }
  return out;
}

/** A linear rise over `attack`, then an exponential fall reaching -60 dB `decay` later. */
function envelope(t: number, attack: number, decay: number): number {
  if (t < attack) return t / attack;
  return Math.exp((-Math.LN10 * 3 * (t - attack)) / decay);
}

function whiteNoise(n: number, random: () => number): Float64Array {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = random() * 2 - 1;
  return out;
}

/** `x` kept between `low` and `high` hertz: a 12 dB/octave high-pass, then a low-pass. */
function band(x: Float64Array, low: number, high: number, rate: number): Float64Array {
  return biquad(biquad(x, "highpass", low, Math.SQRT1_2, rate), "lowpass", high, Math.SQRT1_2, rate);
}

/** An RBJ-cookbook two-pole filter over `x`, its corner held below Nyquist. */
function biquad(x: Float64Array, type: "lowpass" | "highpass", freq: number, q: number, rate: number): Float64Array {
  const w = (2 * Math.PI * Math.min(freq, rate * 0.45)) / rate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  const b1 = type === "lowpass" ? 1 - cos : -(1 + cos);
  const b0 = Math.abs(b1) / 2;
  const a0 = 1 + alpha;
  const [nb0, nb1, nb2, na1, na2] = [b0 / a0, b1 / a0, b0 / a0, (-2 * cos) / a0, (1 - alpha) / a0];
  const out = new Float64Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = nb0 * x[i] + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
    out[i] = y;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = y;
  }
  return out;
}

/** Takes out any DC a layer left: a one-pole high-pass at 25 Hz. */
function blockDc(x: Float64Array, rate: number): void {
  const pole = 1 - (2 * Math.PI * 25) / rate;
  let lastIn = 0;
  let lastOut = 0;
  for (let i = 0; i < x.length; i++) {
    const y = x[i] - lastIn + pole * lastOut;
    lastIn = x[i];
    lastOut = y;
    x[i] = y;
  }
}

/** A linear fade-in from exactly 0 and a raised-cosine fade-out to exactly 0 (R11). */
function fadeEdges(x: Float64Array, rate: number): void {
  const fadeIn = Math.max(1, Math.round(GAMEPLAY_SFX_EDGES.fadeIn * rate));
  const fadeOut = Math.max(1, Math.round(GAMEPLAY_SFX_EDGES.fadeOut * rate));
  for (let i = 0; i < Math.min(fadeIn, x.length); i++) x[i] *= i / fadeIn;
  for (let k = 0; k < Math.min(fadeOut, x.length); k++) x[x.length - 1 - k] *= 0.5 * (1 - Math.cos((Math.PI * k) / fadeOut));
  // the fades leave ±0 there; a plain 0, so no sign survives into the samples
  if (x.length > 0) x[0] = x[x.length - 1] = 0;
}

function normalised(x: Float64Array): Float64Array {
  const top = peakOf(x);
  if (top > 0) for (let i = 0; i < x.length; i++) x[i] /= top;
  return x;
}

function peakOf(x: Float64Array): number {
  let top = 0;
  for (let i = 0; i < x.length; i++) top = Math.max(top, Math.abs(x[i]));
  return top;
}
