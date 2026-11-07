/**
 * The HP bar's look (FS-48CTQ §F.21–23, owner playtest 2026-11-07), one for every monster bar:
 * over a head on any floor, and in the target frame. Drawn in code from palette tokens (ADR-0013),
 * no art:
 *
 * - no rim (owner, playtest 2026-11-07);
 * - a deep-red trough, the bar's full length: the health missing reads as dark red;
 * - the fill in the HP channel, shaded: a thin highlight line along its top, a darker foot, and a
 *   darker one-px cap where it ends short of full, so the end reads crisp;
 * - the **damage chip**: the health a hit just took, a lighter run from the fill's end to where it
 *   stood, held a moment and then drained ({@link DamageChip}).
 *
 * **Crisp at any render scale.** Phaser 4.2.1 rounds the vertices of quads only (images, sprites,
 * text: `TransformerImage` and its siblings ask `willRoundVertices`); a Graphics fill goes through
 * `FillRect` and is never rounded, so a fractional edge blends across two backing px. Every edge
 * here is computed in whole backing px (logical × render scale) and divided back, so with the
 * camera's scroll on the 1/rs grid (`keepOnPixelGrid`, ADR-0056/0057) it lands on a pixel. Lines are
 * filled, never stroked: a 1px stroke is centred on its edge and straddles two px. Nothing is
 * drawn outside the box.
 *
 * Phaser-free: the painter takes the two Graphics calls it needs, and is tested without a canvas.
 */

import { MARKER_BAR } from "./markers";

/** A bar's box in logical units: its trough, all the bar draws inside it. */
export interface BarBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The slice of a Phaser Graphics the painter draws through. */
export interface BarPainter {
  fillStyle(color: number, alpha?: number): unknown;
  fillRect(x: number, y: number, w: number, h: number): unknown;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const usable = (scale: number) => (scale > 0 && Number.isFinite(scale) ? scale : 1);

/** A logical coordinate moved to the nearest whole backing px at render scale `scale`. */
export function onBackingGrid(v: number, scale: number): number {
  const s = usable(scale);
  return Math.round(v * s) / s;
}

/**
 * How far the fill and the chip reach along a bar `width` logical units long, in whole backing px
 * at render scale `scale`. The chip never falls short of the fill.
 */
export function barSpans(
  width: number,
  fill: number,
  chip: number,
  scale: number,
): { fill: number; chip: number } {
  const w = Math.round(width * usable(scale));
  const f = Math.round(w * clamp01(fill));
  return { fill: f, chip: Math.max(f, Math.round(w * clamp01(chip))) };
}

/**
 * What a drawn bar shows, in backing px: equal keys draw the same pixels, so a bar is redrawn only
 * when its key changes (§F.23). A health change too small to move a backing px draws nothing.
 */
export function healthBarKey(
  size: { width: number; height: number },
  fill: number,
  chip: number,
  scale: number,
): string {
  const s = usable(scale);
  const spans = barSpans(size.width, fill, chip, s);
  return `${Math.round(size.width * s)}x${Math.round(size.height * s)}@${s}|${spans.fill}|${spans.chip}`;
}

/** The foot's share of the bar's height, in the fill's darker tone. */
const FOOT_SHARE = 0.2;

/**
 * Draws the bar in `box` (logical units) at `fill` (0–1) with the chip reaching `chip`, every edge
 * on a whole backing px at render scale `scale`. Draws over what `g` holds: clear it first.
 */
export function paintHealthBar(
  g: BarPainter,
  box: BarBox,
  fill: number,
  chip: number,
  scale: number,
): void {
  const s = usable(scale);
  const rect = (color: number, x: number, y: number, w: number, h: number) => {
    g.fillStyle(color, 1);
    g.fillRect(x / s, y / s, w / s, h / s);
  };
  const x = Math.round(box.x * s);
  const y = Math.round(box.y * s);
  const w = Math.round(box.width * s);
  const h = Math.round(box.height * s);
  /** One logical px, in whole backing px: the highlight line and the cap. */
  const line = Math.max(1, Math.round(s));
  const spans = barSpans(box.width, fill, chip, s);

  rect(MARKER_BAR.trough, x, y, w, h);
  if (spans.chip > spans.fill)
    rect(MARKER_BAR.chip, x + spans.fill, y, spans.chip - spans.fill, h);
  if (spans.fill <= 0) return;

  rect(MARKER_BAR.hp, x, y, spans.fill, h);
  const foot = Math.max(1, Math.round(h * FOOT_SHARE));
  rect(MARKER_BAR.shade, x, y + h - foot, spans.fill, foot);
  rect(MARKER_BAR.light, x, y, spans.fill, line);
  // the fill's end, short of full: a darker cap, so it ends on an edge and not a smear
  if (spans.fill < w && spans.fill > line) rect(MARKER_BAR.shade, x + spans.fill - line, y, line, h);
}

/** How long the damage chip holds before it drains, and how long the drain takes, in ms. */
export const CHIP_HOLD_MS = 300;
export const CHIP_DRAIN_MS = 450;

/** Slow out of the hold, slow onto the fill: smoothstep. */
const ease = (k: number) => k * k * (3 - 2 * k);

/**
 * A bar's fill and its damage chip (§F.22), both 0–1. A hit ({@link set} lower, chipped) leaves the
 * chip where the health stood; it holds {@link CHIP_HOLD_MS}, then drains to the fill over
 * {@link CHIP_DRAIN_MS} and stops. A hit mid-drain keeps the chip where it is and holds again, so
 * a flurry reads as one chunk. Health rising past the chip ends it.
 */
export class DamageChip {
  fill: number;
  chip: number;
  /** Where the drain starts from. */
  private from: number;
  private elapsed = 0;

  constructor(fill: number) {
    this.fill = fill;
    this.chip = fill;
    this.from = fill;
  }

  /** Whether a chip shows: it is draining or holding. */
  get draining(): boolean {
    return this.chip > this.fill;
  }

  /** The bar's health now; `chipped` false takes a drop with no chip. */
  set(fill: number, chipped: boolean): void {
    if (fill < this.fill && chipped) {
      this.from = this.chip;
      this.elapsed = 0;
    } else if (fill < this.fill || fill >= this.chip) {
      this.chip = fill;
    }
    this.fill = fill;
  }

  /** One frame of the hold and the drain. */
  step(deltaMs: number): void {
    if (!this.draining) return;
    this.elapsed += deltaMs;
    if (this.elapsed <= CHIP_HOLD_MS) return;
    const k = Math.min(1, (this.elapsed - CHIP_HOLD_MS) / CHIP_DRAIN_MS);
    this.chip = k >= 1 ? this.fill : Math.max(this.fill, this.from - (this.from - this.fill) * ease(k));
  }

  /** No chip: the bar shows its health alone. */
  clear(): void {
    this.chip = this.fill;
  }
}
