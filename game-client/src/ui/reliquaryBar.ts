/**
 * The reliquary bars: the art of the player's own Health and resource bars (`ResourceHud`). Each bar
 * is a sunken channel in a brass bezel on a carved stone plate, filled like a vial of its channel's
 * liquid, its left end set into an emblem socket that names the channel by a glyph: a blood drop for
 * Health, a waning moon for Mana, twin chevrons for Stamina, a heater shield for Parry.
 *
 * The liquid lives: a slow sheen walks along it, the leading edge is a bright meniscus, a loss
 * leaves a pale chip that holds and drains (the monster bars' `DamageChip`), a gain glows in and
 * rises. Each channel has its own texture: Health beats (faster and harder as it runs low, its
 * socket glowing), Mana carries drifting motes, Stamina is corded sinew that flows, a poisoned
 * Health bubbles, and parry charges are brass lozenge studs a glint runs across.
 *
 * Drawn in code from palette tokens (ADR-0013), no art, fills only (a stroke straddles two px).
 * Phaser-free: the painters take the four Graphics calls they need, and `BarMotion` is plain state,
 * so both are tested without a canvas.
 */

import { palette, type BarRamp } from "@/utils/canvasPalette";
import { DamageChip } from "@/render/markers/healthBar";
import type { HudChannel } from "./resources";

/** The slice of a Phaser Graphics the painters draw through. */
export interface BarInk {
  fillStyle(color: number, alpha?: number): unknown;
  fillRect(x: number, y: number, w: number, h: number): unknown;
  fillCircle(x: number, y: number, r: number): unknown;
  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): unknown;
}

/** A bar's channel box in logical px: its liquid stays inside, the bezel sits 2 px around it. */
export interface ChannelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Which ramp a bar draws in: its channel's, or the poison's on a poisoned Health. */
export function rampOf(channel: HudChannel, poisoned = false): BarRamp {
  return palette.hudBarRamp[poisoned && channel === "health" ? "poisoned" : channel];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const wrap = (v: number, m: number) => ((v % m) + m) % m;

// ── The plate, the bezel and the socket (the still layers) ───────────────

/** The carved stone plate the bars sit on: a dark lip, a brass hairline, the stone, studs at the corners. */
export function paintPlate(g: BarInk, x: number, y: number, w: number, h: number): void {
  g.fillStyle(palette.hudPlateDeep, 0.9);
  g.fillRect(x, y, w, h);
  // the brass hairline, lit along the top
  g.fillStyle(palette.hudBezel, 0.5);
  g.fillRect(x + 1, y + 1, w - 2, h - 2);
  g.fillStyle(palette.hudBezelLit, 0.35);
  g.fillRect(x + 1, y + 1, w - 2, 1);
  // the stone
  g.fillStyle(palette.hudPlate, 0.94);
  g.fillRect(x + 2, y + 2, w - 4, h - 4);
  g.fillStyle(palette.hudPlateLit, 0.7);
  g.fillRect(x + 2, y + 2, w - 4, 1);
  g.fillStyle(palette.hudPlateDeep, 0.55);
  g.fillRect(x + 2, y + h - 3, w - 4, 1);
  for (const [cx, cy] of [
    [x + 4, y + 4],
    [x + w - 4, y + 4],
    [x + 4, y + h - 4],
    [x + w - 4, y + h - 4],
  ])
    stud(g, cx, cy);
}

function stud(g: BarInk, cx: number, cy: number): void {
  g.fillStyle(palette.hudBezelShade, 1);
  g.fillCircle(cx, cy, 2);
  g.fillStyle(palette.hudBezel, 1);
  g.fillCircle(cx - 0.3, cy - 0.3, 1.5);
  g.fillStyle(palette.hudBezelLit, 0.9);
  g.fillRect(cx - 1, cy - 1, 1, 1);
}

/** The sunken channel: a brass bezel lit along its top, a dark gap, and the channel's own dark trough. */
export function paintChannel(g: BarInk, box: ChannelBox, ramp: BarRamp): void {
  const { x, y, w, h } = box;
  g.fillStyle(palette.hudBezelShade, 1);
  g.fillRect(x - 2, y - 2, w + 4, h + 4);
  g.fillStyle(palette.hudBezel, 1);
  g.fillRect(x - 2, y - 2, w + 4, h + 3);
  g.fillStyle(palette.hudBezelLit, 0.7);
  g.fillRect(x - 2, y - 2, w + 4, 1);
  g.fillStyle(palette.hudSocket, 1);
  g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle(ramp.trough, 1);
  g.fillRect(x, y, w, h);
  // a brass finial at the channel's far end
  g.fillStyle(palette.hudBezelShade, 1);
  g.fillRect(x + w + 2, y - 1, 2, h + 2);
  g.fillStyle(palette.hudBezel, 1);
  g.fillRect(x + w + 2, y - 1, 1, h + 1);
}

/** The emblem socket: a bevelled brass ring around a dark well holding the channel's glyph. */
export function paintSocket(g: BarInk, cx: number, cy: number, r: number, channel: HudChannel, ramp: BarRamp): void {
  g.fillStyle(palette.hudPlateDeep, 0.8);
  g.fillCircle(cx, cy + 0.5, r + 1.5);
  g.fillStyle(palette.hudBezelShade, 1);
  g.fillCircle(cx, cy, r + 0.5);
  g.fillStyle(palette.hudBezelLit, 0.85);
  g.fillCircle(cx - 0.6, cy - 0.6, r - 0.4);
  g.fillStyle(palette.hudBezel, 1);
  g.fillCircle(cx, cy, r - 0.9);
  g.fillStyle(palette.hudSocket, 1);
  g.fillCircle(cx, cy, r - 2.2);
  g.fillStyle(ramp.trough, 1);
  g.fillCircle(cx, cy + 0.6, r - 3);
  paintGlyph(g, cx, cy, r - 3.2, channel, ramp);
}

/** The channel's glyph, about `s` px from its centre to its reach. */
function paintGlyph(g: BarInk, cx: number, cy: number, s: number, channel: HudChannel, ramp: BarRamp): void {
  const carve = palette.hudSocket;
  switch (channel) {
    case "health": {
      // a blood drop
      g.fillStyle(ramp.deep, 1);
      g.fillCircle(cx, cy + s * 0.32, s * 0.62);
      g.fillTriangle(cx, cy - s * 0.95, cx - s * 0.56, cy + s * 0.18, cx + s * 0.56, cy + s * 0.18);
      g.fillStyle(ramp.lit, 1);
      g.fillCircle(cx, cy + s * 0.32, s * 0.5);
      g.fillTriangle(cx, cy - s * 0.75, cx - s * 0.45, cy + s * 0.2, cx + s * 0.45, cy + s * 0.2);
      g.fillStyle(ramp.light, 0.9);
      g.fillCircle(cx - s * 0.22, cy + s * 0.18, s * 0.16);
      return;
    }
    case "mana": {
      // a waning moon cradling a mote
      g.fillStyle(ramp.lit, 1);
      g.fillCircle(cx - s * 0.1, cy, s * 0.82);
      g.fillStyle(carve, 1);
      g.fillCircle(cx + s * 0.32, cy - s * 0.2, s * 0.68);
      g.fillStyle(ramp.spark, 1);
      g.fillCircle(cx + s * 0.38, cy - s * 0.15, s * 0.2);
      return;
    }
    case "stamina": {
      // twin chevrons, rising
      for (const tip of [cy - s * 0.85, cy - s * 0.05]) {
        g.fillStyle(ramp.lit, 1);
        g.fillTriangle(cx - s * 0.8, tip + s * 0.75, cx, tip, cx + s * 0.8, tip + s * 0.75);
        g.fillStyle(carve, 1);
        g.fillTriangle(cx - s * 0.8, tip + s * 1.2, cx, tip + s * 0.45, cx + s * 0.8, tip + s * 1.2);
      }
      return;
    }
    case "parry": {
      // a heater shield with a centre rib
      g.fillStyle(ramp.lit, 1);
      g.fillRect(cx - s * 0.68, cy - s * 0.78, s * 1.36, s * 0.78);
      g.fillTriangle(cx - s * 0.68, cy - s * 0.02, cx + s * 0.68, cy - s * 0.02, cx, cy + s * 0.92);
      g.fillStyle(ramp.deep, 1);
      g.fillRect(cx - 0.5, cy - s * 0.66, 1, s * 1.38);
      g.fillStyle(ramp.light, 0.8);
      g.fillRect(cx - s * 0.6, cy - s * 0.72, s * 1.2, 1);
      return;
    }
    default:
      g.fillStyle(ramp.lit, 1);
      g.fillCircle(cx, cy, s * 0.42);
  }
}

// ── The liquid (the live layer) ──────────────────────────────────────────

/** What a continuous bar shows this frame: all 0–1 but `low` and `beat`, which are 0–1 strengths. */
export interface LiquidFrame {
  fill: number;
  chip: number;
  /** The run a gain is glowing in, and how strongly (0 when none). */
  flash: { from: number; to: number; alpha: number } | null;
  /** The bar's clock in ms: the sheen, the motes, the sinew and the bubbles read it. */
  time: number;
}

/** How long a sheen takes to walk the bar, by channel, in ms. */
const SHEEN_MS: Readonly<Record<HudChannel, number>> = {
  health: 5200,
  mana: 3800,
  stamina: 3000,
  parry: 2600,
  unknown: 5200,
};

/** Health's beat (lub-dub) strength, 0–1, at `time` for a fill: slow and faint when hale, quick and hard when low. */
export function heartbeat(time: number, fill: number): number {
  const low = lowness(fill);
  const period = 2400 - 1500 * low;
  const p = wrap(time, period) / period;
  const bump = (c: number, w: number) => Math.max(0, 1 - Math.abs(p - c) / w);
  return bump(0.07, 0.07) + 0.6 * bump(0.25, 0.07);
}

/** How low a Health fill runs, 0 (above a third) to 1 (empty). */
export function lowness(fill: number): number {
  const at = 0.35;
  return fill >= at ? 0 : clamp01((at - fill) / at);
}

/**
 * One continuous bar's liquid in `box`: the chip, the shaded fill, the channel's texture, the sheen,
 * the meniscus, a gain's glow and the engraved quarter marks. Draws over what `g` holds.
 */
export function paintLiquid(
  g: BarInk,
  box: ChannelBox,
  channel: HudChannel,
  ramp: BarRamp,
  frame: LiquidFrame,
  poisoned = false,
): void {
  const { x, y, w, h } = box;
  const fw = Math.round(w * clamp01(frame.fill));
  const cw = Math.max(fw, Math.round(w * clamp01(frame.chip)));
  const t = frame.time;

  if (cw > fw) {
    g.fillStyle(ramp.chip, 0.85);
    g.fillRect(x + fw, y, cw - fw, h);
    g.fillStyle(ramp.light, 0.4);
    g.fillRect(x + fw, y + 1, cw - fw, 1);
  }

  if (fw > 0) {
    const lit = Math.max(1, Math.round(h * 0.3));
    const deep = Math.max(1, Math.round(h * 0.22));
    g.fillStyle(ramp.body, 1);
    g.fillRect(x, y, fw, h);
    g.fillStyle(ramp.lit, 1);
    g.fillRect(x, y + 1, fw, lit);
    g.fillStyle(ramp.light, 0.75);
    g.fillRect(x, y + 1, fw, 1);
    g.fillStyle(ramp.deep, 1);
    g.fillRect(x, y + h - deep - 1, fw, deep);
    g.fillStyle(ramp.foot, 1);
    g.fillRect(x, y + h - 1, fw, 1);

    if (channel === "health") {
      if (poisoned) bubbles(g, box, fw, ramp, t);
      const beat = heartbeat(t, frame.fill);
      const strength = 0.06 + 0.2 * lowness(frame.fill);
      if (beat > 0) {
        g.fillStyle(ramp.light, beat * strength);
        g.fillRect(x, y, fw, h);
      }
    } else if (channel === "mana") motes(g, box, fw, ramp, t);
    else if (channel === "stamina") sinew(g, box, fw, ramp, t);

    sheen(g, box, fw, ramp, t, SHEEN_MS[channel]);

    // the meniscus: the liquid's bright edge, short of full
    if (fw < w) {
      g.fillStyle(ramp.light, 0.9);
      g.fillRect(x + fw - 1, y + 1, 1, h - 2);
      g.fillStyle(ramp.spark, 0.25);
      g.fillRect(x + fw, y + 1, 1, h - 2);
    }
  }

  if (frame.flash && frame.flash.alpha > 0) {
    const from = Math.round(w * clamp01(frame.flash.from));
    const to = Math.round(w * clamp01(frame.flash.to));
    if (to > from) {
      g.fillStyle(ramp.spark, 0.55 * frame.flash.alpha);
      g.fillRect(x + from, y, to - from, h);
    }
  }

  engraving(g, box);
}

/** The quarter marks cut into the channel, and the shadow under its top lip, over the liquid. */
function engraving(g: BarInk, box: ChannelBox): void {
  const { x, y, w, h } = box;
  for (const k of [0.25, 0.5, 0.75]) {
    const nx = x + Math.round(w * k);
    g.fillStyle(palette.hudSocket, 0.5);
    g.fillRect(nx, y, 1, h);
    g.fillStyle(palette.hudBezelLit, 0.14);
    g.fillRect(nx + 1, y, 1, h);
  }
  g.fillStyle(palette.hudSocket, 0.45);
  g.fillRect(x, y, w, 1);
}

/** A soft band of light walking along the fill, then a pause before the next. */
function sheen(g: BarInk, box: ChannelBox, fw: number, ramp: BarRamp, t: number, period: number): void {
  const band = 16;
  const travel = box.w + band * 3;
  const head = (wrap(t, period) / period) * travel - band;
  for (let i = 0; i < band; i += 2) {
    const sx = Math.round(head + i);
    if (sx < 0 || sx + 2 > fw) continue;
    const k = 1 - Math.abs(i - band / 2) / (band / 2);
    g.fillStyle(ramp.light, 0.16 * k);
    g.fillRect(box.x + sx, box.y + 1, 2, box.h - 2);
  }
}

/** Mana's motes: specks drifting back along the fill, each bobbing and twinkling on its own. */
function motes(g: BarInk, box: ChannelBox, fw: number, ramp: BarRamp, t: number): void {
  if (fw < 4) return;
  for (let i = 0; i < 7; i++) {
    const speed = 0.006 + 0.0025 * i;
    const mx = box.x + fw - 1 - wrap(t * speed + i * 37, fw - 2);
    const my = box.y + 2 + wrap(i * 5, box.h - 4) + Math.sin(t / 650 + i * 1.3);
    const a = 0.25 + 0.55 * Math.sin(t / 420 + i * 1.7) ** 2;
    g.fillStyle(ramp.spark, a);
    g.fillRect(Math.round(mx), Math.round(my), i % 2 ? 2 : 1, 1);
  }
}

/** Stamina's corded sinew: slanted strands flowing slowly toward the fill's end. */
function sinew(g: BarInk, box: ChannelBox, fw: number, ramp: BarRamp, t: number): void {
  const step = 7;
  const shift = wrap(t * 0.01, step);
  for (let sx = -box.h; sx < fw; sx += step) {
    for (let r = 1; r < box.h - 1; r += 2) {
      const px = Math.round(sx + shift + (box.h - r) * 0.6);
      if (px < 0 || px + 1 > fw) continue;
      g.fillStyle(ramp.deep, 0.35);
      g.fillRect(box.x + px, box.y + r, 1, 2);
    }
  }
}

/** A poisoned Health's bubbles, rising and fading through the fill. */
function bubbles(g: BarInk, box: ChannelBox, fw: number, ramp: BarRamp, t: number): void {
  if (fw < 3) return;
  for (let i = 0; i < 6; i++) {
    const period = 1300 + i * 210;
    const p = wrap(t + i * 377, period) / period;
    const bx = box.x + 1 + wrap(i * 53 + 11, fw - 2);
    const by = box.y + box.h - 2 - p * (box.h - 3);
    g.fillStyle(ramp.spark, 0.7 * (1 - p));
    g.fillRect(Math.round(bx), Math.round(by), i % 3 ? 1 : 2, 1);
  }
}

// ── Parry charges ────────────────────────────────────────────────────────

/** Each stud's centre and half-width across `box`, one per pip. */
export function studSlots(box: ChannelBox, count: number): { cx: number; half: number }[] {
  if (count <= 0) return [];
  const slot = box.w / count;
  const half = Math.max(2, Math.min(slot / 2 - 2, box.h * 0.95));
  return Array.from({ length: count }, (_, i) => ({ cx: box.x + slot * (i + 0.5), half }));
}

/**
 * Parry charges as brass lozenge studs set in the channel, one per pip: a held charge a faceted
 * bright-brass stud a glint runs across now and then, a spent one an empty socket. `flash` (0–1 per
 * pip) lifts a charge just gained.
 */
export function paintStuds(
  g: BarInk,
  box: ChannelBox,
  ramp: BarRamp,
  pips: boolean[],
  time: number,
  flash: readonly number[] = [],
): void {
  const midY = box.y + box.h / 2;
  const halfH = box.h / 2 - 0.5;
  const glintAt = box.x + (wrap(time, 2800) / 900) * box.w;
  studSlots(box, pips.length).forEach(({ cx, half }, i) => {
    const diamond = (dx: number, dy: number) => {
      g.fillTriangle(cx - dx, midY, cx, midY - dy, cx + dx, midY);
      g.fillTriangle(cx - dx, midY, cx, midY + dy, cx + dx, midY);
    };
    if (!pips[i]) {
      g.fillStyle(palette.hudBezelShade, 1);
      diamond(half, halfH);
      g.fillStyle(palette.hudSocket, 1);
      diamond(half - 1.5, halfH - 1.5);
      return;
    }
    g.fillStyle(ramp.foot, 1);
    diamond(half + 0.5, halfH + 0.5);
    g.fillStyle(ramp.body, 1);
    diamond(half - 0.5, halfH - 0.5);
    // the upper facets catch the light
    g.fillStyle(ramp.lit, 1);
    g.fillTriangle(cx - half + 0.5, midY, cx, midY - halfH + 0.5, cx + half - 0.5, midY);
    g.fillStyle(ramp.light, 0.8);
    g.fillTriangle(cx - half * 0.6, midY - 0.5, cx, midY - halfH + 1, cx, midY - 0.5);
    const near = 1 - Math.abs(cx - glintAt) / (half * 1.5);
    const lift = Math.max(0, near) + (flash[i] ?? 0);
    if (lift > 0) {
      g.fillStyle(ramp.spark, Math.min(1, lift) * 0.9);
      g.fillRect(cx - 0.5, midY - halfH + 1, 1, halfH * 2 - 2);
      g.fillRect(cx - half * 0.5, midY - 0.5, half, 1);
    }
  });
}

// ── Motion ───────────────────────────────────────────────────────────────

/** How long a gain's glow lasts, in ms. */
export const GAIN_FLASH_MS = 520;
/** How fast a gain rises into the bar, in fill per ms (a whole bar in about 0.6 s). */
const RISE_PER_MS = 1 / 600;

/**
 * A continuous bar's motion between the states the server sends: a loss drops at once and leaves
 * the chip (held, then drained: the monster bars' `DamageChip`); a gain rises into the bar over a
 * moment with a glow over the run it gained. The first state shows as it is, with neither.
 */
export class BarMotion {
  /** The fill drawn now. */
  shown: number;
  private target: number;
  private readonly chipped: DamageChip;
  private gain: { from: number; to: number; age: number } | null = null;

  constructor(fill: number) {
    this.shown = this.target = fill;
    this.chipped = new DamageChip(fill);
  }

  get chip(): number {
    return this.chipped.chip;
  }

  /** The gain's glow now, or null. */
  get flash(): LiquidFrame["flash"] {
    if (!this.gain) return null;
    return { from: this.gain.from, to: this.gain.to, alpha: 1 - this.gain.age / GAIN_FLASH_MS };
  }

  /** The bar's fill as the server has it now. */
  set(fill: number): void {
    if (fill < this.shown) {
      this.chipped.set(fill, true);
      this.shown = fill;
      if (this.gain) this.gain = null;
    } else if (fill > this.target) {
      this.gain = { from: this.shown, to: fill, age: 0 };
      this.chipped.set(fill, false);
    }
    this.target = fill;
  }

  step(deltaMs: number): void {
    this.chipped.step(deltaMs);
    if (this.shown < this.target) this.shown = Math.min(this.target, this.shown + RISE_PER_MS * deltaMs);
    if (this.gain) {
      this.gain.age += deltaMs;
      if (this.gain.age >= GAIN_FLASH_MS) this.gain = null;
    }
  }
}

/** Parry charges' motion: each charge just gained glows a moment. */
export class StudMotion {
  private lit: boolean[];
  private ages: number[];

  constructor(pips: boolean[]) {
    this.lit = [...pips];
    this.ages = pips.map(() => GAIN_FLASH_MS);
  }

  set(pips: boolean[]): void {
    this.ages = pips.map((on, i) => (on && !this.lit[i] ? 0 : (this.ages[i] ?? GAIN_FLASH_MS)));
    this.lit = [...pips];
  }

  step(deltaMs: number): void {
    this.ages = this.ages.map((a) => Math.min(GAIN_FLASH_MS, a + deltaMs));
  }

  /** Each pip's glow now, 0–1. */
  get flash(): number[] {
    return this.ages.map((a) => 1 - a / GAIN_FLASH_MS);
  }
}
