/**
 * The jump rule (FS-04EEA R41): a player's body whose reported position moves more than `JUMP_PX` between
 * two consecutive states is placed at the new position at once, for every viewer, instead of glided there.
 * A Blink moves that far; a walk or a dash never does between two states. Each world scene applies it as a
 * state arrives, before its lerp (ADR-0086 2.1). Pure, so it is tested without a canvas.
 */

import type { Point } from "./iso";

/** World px a reported position may move between two states and still glide. */
export const JUMP_PX = 60;

/**
 * A body's `next` reported position, after `last`: past `JUMP_PX` the drawn position `drawn` is set to it in
 * place, so the next frame draws it there; otherwise `drawn` is left to the lerp. No earlier report, no
 * jump. Whether it jumped.
 */
export function placeOnJump(drawn: Point, last: Point | null | undefined, next: Point): boolean {
  if (!last || Math.hypot(next.x - last.x, next.y - last.y) <= JUMP_PX) return false;
  drawn.x = next.x;
  drawn.y = next.y;
  return true;
}
