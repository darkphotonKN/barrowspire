/**
 * The dust scuff where a roll starts (FS-7P736 R15): a low kick of pale dust thrown back from the
 * push-off, played once at the start of every drawn roll, baked roll clip or in-code tumble alike.
 *
 * Signal, unchanged: the own press that starts the predicted roll, or the first state that shows
 * another delver rolling (`rollDraw.ts` `RollBodies`).
 */

import type { Point } from "@/render/iso/projection";
import type { EffectsRuntime, OwnerKey } from "./runtime";

/** The sub-layer over the body (`standAt(…, 1)`), so the body never hides its own scuff. */
export const ROLL_DUST_LAYER = 2;

/** Plays the scuff on the ground at `at` (world), thrown back against the roll's world way `dir`. */
export function playRollDust(fx: Pick<EffectsRuntime, "play">, owner: OwnerKey, at: Point, dir: Point): void {
  fx.play(owner, "rollDust", at, { direction: dir, layer: ROLL_DUST_LAYER });
}
