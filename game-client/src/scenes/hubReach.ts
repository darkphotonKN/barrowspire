/**
 * Who answers `E` in the hub (FS-B0H2D R28; FS-VPD8Y R34): the nearest of what the player can
 * reach, so in a crowded room it is the one they stepped up to. World positions, never sprite
 * positions: the sprites sit on the projection. Pure maths, no Phaser.
 */

import type { Point } from "@/render/iso/projection";

/**
 * The nearest candidate within `reach` world px of `from` (the edge counts as in); on a tie, the
 * one listed first. Undefined when none is in reach.
 */
export function nearestInReach<T>(
  from: Point,
  candidates: Iterable<{ at: Point; who: T }>,
  reach: number,
): T | undefined {
  let nearest: { who: T; distance: number } | undefined;
  for (const { at, who } of candidates) {
    const distance = Math.hypot(at.x - from.x, at.y - from.y);
    if (distance <= reach && distance < (nearest?.distance ?? Infinity))
      nearest = { who, distance };
  }
  return nearest?.who;
}
