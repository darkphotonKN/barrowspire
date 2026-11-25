/**
 * Afloat's look (FS-X2CMM §I R47): the delver lifted a little off the floor, hovering gently, with a soft
 * shadow left on the floor below. The lift eases in as Levitate lands and the body drops back the frame the
 * state goes. Pitch shadow, no colour of its own.
 *
 * One of the book's looks, each in its own file so it can be swapped; `src/render/world/bookStates.ts`
 * places it. Pure: no Phaser.
 */

import type { BodyClock, LookBrush, StateLook } from "@/render/world/bookLook";
import { wave } from "@/render/world/bookLook";
import { palette } from "@/utils/canvasPalette";

/** Afloat's numbers, screen px. v1, to tune at the gallery. */
export const AFLOAT = {
  /** How high the body hangs, and the ease up to it (Sine.out). */
  lift: 10,
  riseMs: 300,
  /** Its gentle hover. */
  hover: { px: 1.5, periodMs: 1800 },
  /** The shadow's size at the feet: wide and flat, a little smaller the higher it hangs. */
  shadow: { width: 30, height: 11, alpha: 0.45 },
} as const;

/** How high the body hangs this frame. */
export function afloatLift(clock: BodyClock): number {
  const up = Math.sin((Math.min(1, clock.ageMs / AFLOAT.riseMs) * Math.PI) / 2);
  return up * (AFLOAT.lift + AFLOAT.hover.px * wave(clock, AFLOAT.hover.periodMs));
}

function paintShadow(g: LookBrush, clock: BodyClock): void {
  const up = Math.min(1, clock.ageMs / AFLOAT.riseMs);
  const { width, height, alpha } = AFLOAT.shadow;
  const shrink = 1 - 0.15 * up;
  g.fillStyle(palette.bookEffect.afloatShadow, alpha * (0.5 + 0.5 * up));
  g.fillEllipse(0, 0, width * shrink, height * shrink);
  g.fillStyle(palette.bookEffect.afloatShadow, 0.5 * alpha * up);
  g.fillEllipse(0, 0, width * shrink * 1.35, height * shrink * 1.35);
}

export const AFLOAT_LOOK: StateLook = {
  layers: { ground: paintShadow },
  lift: afloatLift,
};
