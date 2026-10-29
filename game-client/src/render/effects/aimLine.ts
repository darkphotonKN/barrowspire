/**
 * The archer's Shadow Shot aim line (FS-JTNPR req 11, 22): a short umbra arrow a little way out
 * from the bow, pointing where the bolt will fly. A hint of the heading, not a ruler of the range:
 * it never runs off the screen. Drawn faint until a release would fire; once it would, full and
 * haloed in a lighter umbra (the glow-up).
 *
 * A held drawing, not a table effect: the scene redraws it every frame of a hold and clears it
 * when the hold ends. Local only (ADR-0030): nothing about it is sent, and teammates never see it.
 * World positions in; the arrow is projected like every other world effect, at bow height, and
 * laid out in screen px along the projected aim so it is the same size whichever way it points.
 */

import { worldToScreen, type Point } from "@/render/iso/projection";
import { palette } from "@/utils/canvasPalette";
import { BOW_LIFT, BOW_REACH } from "./arrow";
import { alongAim } from "./projectile";

/** Over the light-map and the vignette (905), under the markers (950): read in the dark. */
export const AIM_LINE_DEPTH = 940;

/**
 * Screen px along the aim from the bow: a gap, a short shaft, then the head, `halfWidth` either
 * side of the shaft at its base. Short on purpose: a clue of where, not how far.
 */
export const AIM_ARROW = { gap: 14, shaft: 20, head: 16, halfWidth: 9 } as const;

/** Screen px: a stroke that reads at a glance, not a thread. */
export const AIM_LINE_WIDTH = 4;

/** Screen px of the ready halo drawn under the shaft and around the head. */
export const AIM_GLOW_WIDTH = 10;

/** Faint while a release would cancel, full once it would fire (req 11, 13). */
export const AIM_LINE_ALPHA = { faint: 0.4, ready: 0.95 } as const;

/** The ready halo's alpha: a soft bloom, never a light source. */
export const AIM_GLOW_ALPHA = 0.35;

/** How much larger the ready halo's head is than the head, about its centre. */
export const AIM_GLOW_GROWTH = 1.7;

/** The slice of a Phaser Graphics the arrow draws with. */
export interface AimLineGraphics {
  clear(): unknown;
  lineStyle(width: number, color: number, alpha: number): unknown;
  lineBetween(x1: number, y1: number, x2: number, y2: number): unknown;
  fillStyle(color: number, alpha: number): unknown;
  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): unknown;
  setDepth(depth: number): unknown;
  destroy(): void;
}

/** The arrow's screen points: the shaft runs `tail` to `neck`, the head `left`, `tip`, `right`. */
export interface AimArrow {
  tail: Point;
  neck: Point;
  tip: Point;
  left: Point;
  right: Point;
}

/**
 * The arrow for an archer at `from` aiming at `toward`, both world positions: out from the
 * arrow's release point along the projected aim, at bow height. An aim on the archer's own
 * footprint points along +x, as the server fires it.
 */
export function aimArrow(from: Point, toward: Point): AimArrow {
  const len = Math.hypot(toward.x - from.x, toward.y - from.y);
  const aimAt = len > 0 ? toward : { x: from.x + 1, y: from.y };
  const raise = (p: Point) => {
    const s = worldToScreen(p.x, p.y);
    return { x: s.x, y: s.y - BOW_LIFT };
  };
  const bow = raise(alongAim(from, aimAt, BOW_REACH));
  const a = worldToScreen(from.x, from.y);
  const b = worldToScreen(aimAt.x, aimAt.y);
  const run = Math.hypot(b.x - a.x, b.y - a.y);
  const dir = { x: (b.x - a.x) / run, y: (b.y - a.y) / run };
  const out = (px: number) => ({ x: bow.x + dir.x * px, y: bow.y + dir.y * px });
  const neck = out(AIM_ARROW.gap + AIM_ARROW.shaft);
  const side = (sign: number) => ({
    x: neck.x - dir.y * AIM_ARROW.halfWidth * sign,
    y: neck.y + dir.x * AIM_ARROW.halfWidth * sign,
  });
  return {
    tail: out(AIM_ARROW.gap),
    neck,
    tip: out(AIM_ARROW.gap + AIM_ARROW.shaft + AIM_ARROW.head),
    left: side(1),
    right: side(-1),
  };
}

/** The head grown about its centre by {@link AIM_GLOW_GROWTH}: the ready halo's head. */
export function glowHead(...head: Point[]): Point[] {
  const c = {
    x: head.reduce((sum, p) => sum + p.x, 0) / head.length,
    y: head.reduce((sum, p) => sum + p.y, 0) / head.length,
  };
  return head.map((p) => ({
    x: c.x + (p.x - c.x) * AIM_GLOW_GROWTH,
    y: c.y + (p.y - c.y) * AIM_GLOW_GROWTH,
  }));
}

/** One aim arrow, made on its first draw and redrawn in place each frame of the hold. */
export class AimLine {
  private graphics?: AimLineGraphics;

  constructor(private readonly make: () => AimLineGraphics) {}

  get drawn(): boolean {
    return this.graphics !== undefined;
  }

  /** Draws the arrow for this frame; `ready` is whether a release now would fire. */
  draw(from: Point, toward: Point, ready: boolean): void {
    if (!this.graphics) {
      this.graphics = this.make();
      this.graphics.setDepth(AIM_LINE_DEPTH);
    }
    const g = this.graphics;
    const { tail, neck, tip, left, right } = aimArrow(from, toward);
    g.clear();
    if (ready) {
      const [t, l, r] = glowHead(tip, left, right);
      g.lineStyle(AIM_GLOW_WIDTH, palette.aimGlow, AIM_GLOW_ALPHA);
      g.lineBetween(tail.x, tail.y, neck.x, neck.y);
      g.fillStyle(palette.aimGlow, AIM_GLOW_ALPHA);
      g.fillTriangle(t.x, t.y, l.x, l.y, r.x, r.y);
    }
    const alpha = ready ? AIM_LINE_ALPHA.ready : AIM_LINE_ALPHA.faint;
    g.lineStyle(AIM_LINE_WIDTH, palette.aimLine, alpha);
    g.lineBetween(tail.x, tail.y, neck.x, neck.y);
    g.fillStyle(palette.aimLine, alpha);
    g.fillTriangle(tip.x, tip.y, left.x, left.y, right.x, right.y);
  }

  /** The hold is over: no arrow is left behind (req 15). */
  clear(): void {
    this.graphics?.destroy();
    this.graphics = undefined;
  }

  /** The scene's objects are already gone (a teardown): drop the reference, touch nothing. */
  forget(): void {
    this.graphics = undefined;
  }
}
