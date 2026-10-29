/**
 * The archer's Shadow Shot aim line (FS-JTNPR req 11, 22): a thin line from the bow toward the
 * cursor for the shot's full range, so the player sees where the bolt will fly and stop. Drawn
 * faint until a release would fire and full once it would.
 *
 * A held drawing, not a table effect: the scene redraws it every frame of a hold and clears it
 * when the hold ends. Local only (ADR-0030): nothing about it is sent, and teammates never see it.
 * World positions in; the line is projected like every other world effect, at bow height.
 */

import { worldToScreen, type Point } from "@/render/iso/projection";
import { palette } from "@/utils/canvasPalette";
import { BOW_LIFT, BOW_REACH } from "./arrow";
import { alongAim } from "./projectile";

/** World px a Shadow Shot flies before it stops: the server's projectile range (FS-JTNPR req 1). */
export const SHADOW_SHOT_RANGE = 650;

/** Over the light-map and the vignette (905), under the markers (950): read in the dark. */
export const AIM_LINE_DEPTH = 940;

/** Screen px: a thread, not a beam. */
const AIM_LINE_WIDTH = 1.5;

/** Faint while a release would cancel, full once it would fire (req 11, 13). */
export const AIM_LINE_ALPHA = { faint: 0.25, ready: 0.85 } as const;

/** The slice of a Phaser Graphics the line draws with. */
export interface AimLineGraphics {
  clear(): unknown;
  lineStyle(width: number, color: number, alpha: number): unknown;
  lineBetween(x1: number, y1: number, x2: number, y2: number): unknown;
  setDepth(depth: number): unknown;
  destroy(): void;
}

/**
 * Screen ends of the line for an archer at `from` aiming at `toward`, both world positions: from
 * the arrow's release point to {@link SHADOW_SHOT_RANGE} world px along the aim, both at bow
 * height. An aim on the archer's own footprint runs along +x, as the server fires it.
 */
export function aimLineEnds(from: Point, toward: Point): { start: Point; end: Point } {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  const len = Math.hypot(dx, dy);
  const unit = len > 0 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
  const aimAt = len > 0 ? toward : { x: from.x + 1, y: from.y };
  const bow = alongAim(from, aimAt, BOW_REACH);
  const raise = (p: Point) => {
    const s = worldToScreen(p.x, p.y);
    return { x: s.x, y: s.y - BOW_LIFT };
  };
  return {
    start: raise(bow),
    end: raise({ x: from.x + unit.x * SHADOW_SHOT_RANGE, y: from.y + unit.y * SHADOW_SHOT_RANGE }),
  };
}

/** One aim line, made on its first draw and redrawn in place each frame of the hold. */
export class AimLine {
  private graphics?: AimLineGraphics;

  constructor(private readonly make: () => AimLineGraphics) {}

  get drawn(): boolean {
    return this.graphics !== undefined;
  }

  /** Draws the line for this frame; `ready` is whether a release now would fire. */
  draw(from: Point, toward: Point, ready: boolean): void {
    if (!this.graphics) {
      this.graphics = this.make();
      this.graphics.setDepth(AIM_LINE_DEPTH);
    }
    const { start, end } = aimLineEnds(from, toward);
    this.graphics.clear();
    this.graphics.lineStyle(
      AIM_LINE_WIDTH,
      palette.aimLine,
      ready ? AIM_LINE_ALPHA.ready : AIM_LINE_ALPHA.faint,
    );
    this.graphics.lineBetween(start.x, start.y, end.x, end.y);
  }

  /** The hold is over: no line is left behind (req 15). */
  clear(): void {
    this.graphics?.destroy();
    this.graphics = undefined;
  }

  /** The scene's objects are already gone (a teardown): drop the reference, touch nothing. */
  forget(): void {
    this.graphics = undefined;
  }
}
