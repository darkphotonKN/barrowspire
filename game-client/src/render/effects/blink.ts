/**
 * Blink (FS-04EEA §H R44): the own mage's only (R42), never a teammate's.
 *
 * - Blink-out: on the send, where the mage's body stands, a necrotic glow at the body going out as pale
 *   motes are drawn in to it (`blinkOut`).
 * - Blink-in: where the jump rule places the own body when the jump arrives (R41, `render/jump.ts`), the
 *   glow and a short pool of light, motes thrown off the figure settling round it (`blinkIn`).
 *
 * The wire marks no Blink (R41's smaller v1): the jump that follows a sent Blink is taken for it, through
 * {@link BlinkLanding}. A Blink the server refused (Edge States: the target under the mage) moves nobody,
 * so no blink-in follows the blink-out it already played. Existing fx textures only (R48).
 */

import type { Point } from "@/render/iso/projection";
import type { EffectsRuntime, OwnerKey } from "./runtime";
import type { EffectName } from "./table";

export const BLINK = {
  /** Screen px above the feet the glow stands: the body's middle, under the casting hand. */
  lift: 34,
  /** The sub-layer over a standing character (`standAt(…, 1)`), so the body never hides its own glow. */
  layer: 2,
  /**
   * How long after the send a jump of the own body is still taken for the Blink: some round trips and a
   * tick or two. A refused Blink moves nobody; a later jump (a respawn) is not a Blink.
   */
  landWithinMs: 1000,
} as const;

/** Every table entry the Blink plays, for the palette check. */
export const BLINK_EFFECTS = ["blinkOut", "blinkIn"] as const satisfies readonly EffectName[];

/** The blink-out at world point `at`, where the mage stands as the Blink is sent. */
export function playBlinkOut(fx: Pick<EffectsRuntime, "play">, owner: OwnerKey, at: Point): void {
  fx.play(owner, "blinkOut", { x: at.x, y: at.y }, { lift: BLINK.lift, layer: BLINK.layer });
}

/** The blink-in at world point `at`, where the jump rule placed the own mage's body. */
export function playBlinkIn(fx: Pick<EffectsRuntime, "play">, owner: OwnerKey, at: Point): void {
  fx.play(owner, "blinkIn", { x: at.x, y: at.y }, { lift: BLINK.lift, layer: BLINK.layer });
}

/** Whether a jump of the own body is the Blink just sent: armed on the send, landed once. Pure. */
export class BlinkLanding {
  private sentAt?: number;

  /** A Blink was sent at `now`. */
  arm(now: number): void {
    this.sentAt = now;
  }

  /** The own body jumped at `now`: whether that is the Blink's landing. It lands once. */
  land(now: number): boolean {
    const sent = this.sentAt;
    if (sent === undefined || now - sent > BLINK.landWithinMs) return false;
    this.sentAt = undefined;
    return true;
  }

  /** No Blink is waiting any more: a floor change, a teardown. */
  forget(): void {
    this.sentAt = undefined;
  }
}
