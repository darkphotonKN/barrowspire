/**
 * The archer's Shadow Shot hold (FS-JTNPR req 8, 12, 13, 15, 18): when a right-button hold is
 * aiming, and whether letting go fires or cancels. Pure and Phaser-free, so the rules are
 * tested without a canvas; the scene owns the input wiring, the send and the drawing.
 *
 * All of this is client presentation (ADR-0030): the server never learns that a hold began. It
 * receives one `cast_skill` on a release this module answers with "fire", and resolves it
 * against its own cooldown and cost.
 */

import type { ResourceState } from "@/types/gameState";
import { abilityAffordable } from "@/ui/resources";

/** A release before the button has been held this long cancels (req 13, charter default). */
export const SHADOW_SHOT_MIN_HOLD_MS = 300;

/** The client's mirror of the server's Shadow Shot cooldown, counted from the last send (req 13). */
export const SHADOW_SHOT_COOLDOWN_MS = 1200;

/** What letting go of the button did: one cast to send, or nothing at all. */
export type AimRelease = "fire" | "cancel";

export class ShadowShotAim {
  /** When the running hold began, scene ms; undefined with no hold running. */
  private heldSince?: number;
  /** When the client last sent a Shadow Shot, scene ms. Only a fire sets it (req 15). */
  private lastFired = -Infinity;

  get aiming(): boolean {
    return this.heldSince !== undefined;
  }

  /** Starts a hold; false when one is already running, which carries on unchanged. */
  press(now: number): boolean {
    if (this.aiming) return false;
    this.heldSince = now;
    return true;
  }

  /**
   * Whether a release now would fire: held long enough, off the cooldown, and the archer's
   * `resource` as it stands now can pay (req 18), judged by `abilityAffordable`, the rule the
   * ability card greys by, so the line and the card never disagree. `resource` is required: a
   * caller with no resource on the wire passes `undefined` on purpose, which is affordable (the
   * server's own refusal stands). Holding longer changes nothing (req 12).
   */
  ready(now: number, resource: ResourceState | undefined): boolean {
    if (this.heldSince === undefined) return false;
    return (
      now - this.heldSince >= SHADOW_SHOT_MIN_HOLD_MS &&
      now - this.lastFired >= SHADOW_SHOT_COOLDOWN_MS &&
      abilityAffordable(resource)
    );
  }

  /**
   * Ends the hold: "fire" starts the cooldown, "cancel" leaves it; null with no hold running.
   * Affordability is judged here, at release, not at the press (req 18).
   */
  release(now: number, resource: ResourceState | undefined): AimRelease | null {
    if (!this.aiming) return null;
    const fire = this.ready(now, resource);
    this.heldSince = undefined;
    if (!fire) return "cancel";
    this.lastFired = now;
    return "fire";
  }

  /** Ends a hold with nothing fired and no cooldown started; false when none was running. */
  cancel(): boolean {
    const was = this.aiming;
    this.heldSince = undefined;
    return was;
  }

  /** A new run: no hold, and no cooldown carried over from the last one. */
  reset(): void {
    this.heldSince = undefined;
    this.lastFired = -Infinity;
  }
}
