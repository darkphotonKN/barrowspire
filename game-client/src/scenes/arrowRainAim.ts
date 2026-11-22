/**
 * The archer's Arrow Rain aim (FS-04EEA R38): key 3 held shows a ground circle at the cursor, pulled in to the
 * server's reach, and letting go casts there. Pure and Phaser-free, beside the Shadow Shot hold
 * (`shadowShotAim.ts`), so the rules are tested without a canvas; the combat owns the gates and the send, the
 * scene the keys and the drawing.
 *
 * All of this is client presentation (ADR-0030): the server never learns an aim began. It receives one
 * `cast_skill {skill_id: "arrow_rain"}` on a release this module answers with "cast", and clamps the target
 * again itself (§E.23).
 */

import type { Point } from "@/render/iso";

/** The rain's circle, world px of radius: the server's (FS-04EEA §E). */
export const ARROW_RAIN_RADIUS = 70;

/** How far from the archer the circle's centre may sit, world px: the server clamps to the same (§E.23). */
export const ARROW_RAIN_REACH = 300;

/** What letting go of key 3 did: one cast to send, or nothing at all. */
export type RainRelease = "cast" | "cancel";

/**
 * The circle's centre for an archer at `from` with the cursor at the world point `cursor`: the cursor itself,
 * or the point {@link ARROW_RAIN_REACH} from the archer along the line toward it when the cursor is further.
 */
export function arrowRainCentre(from: Point, cursor: Point): Point {
  const dx = cursor.x - from.x;
  const dy = cursor.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len <= ARROW_RAIN_REACH) return { x: cursor.x, y: cursor.y };
  const k = ARROW_RAIN_REACH / len;
  return { x: from.x + dx * k, y: from.y + dy * k };
}

export class ArrowRainAim {
  private held = false;

  get aiming(): boolean {
    return this.held;
  }

  /** Starts an aim; false when one is already running, which carries on unchanged. */
  press(): boolean {
    if (this.held) return false;
    this.held = true;
    return true;
  }

  /**
   * Ends the aim: "cast" when the gates hold at the release (`ready`), "cancel" otherwise; null with no aim
   * running. There is no minimum hold: a tap casts.
   */
  release(ready: boolean): RainRelease | null {
    if (!this.held) return null;
    this.held = false;
    return ready ? "cast" : "cancel";
  }

  /** Ends an aim with nothing cast; false when none was running. */
  cancel(): boolean {
    const was = this.held;
    this.held = false;
    return was;
  }
}
