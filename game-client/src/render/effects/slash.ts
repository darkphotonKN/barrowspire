/**
 * Warrior slash (FS-KYPQ9 §D.1): a heavy steel smear laid on the isometric ground, swept toward
 * the target from the player's world position and fading over the table's 220 ms, with a little
 * dust settling at the feet. Drawn over the player and the target. No flash, no shake.
 *
 * Signals, unchanged: the warrior's own left click that sends `CastSkill {skill_id: "slash"}`,
 * and the rival click that sends `Attack`. It plays the moment the message is sent, as today,
 * not timed to the attack clip's strike frame. Both sends share this one implementation.
 */

import { depthKey, type Point } from "@/render/iso/projection";
import { worldDepth } from "@/render/iso/shapes";
import type { EffectsRuntime, OwnerKey } from "./runtime";

/**
 * World px along the aim that the smear covers for sorting: past the melee range (50–60), so a
 * target in reach never stands over it.
 */
export const SMEAR_REACH = 64;

/** The sub-layer over a standing character (`standAt(…, 1)`). */
const OVER_CHARACTERS = 2;

/** How many sub-layers make one world pixel of footprint, read off `worldDepth` itself. */
const LAYERS_PER_KEY =
  (worldDepth(1, 0) - worldDepth(0, 0)) /
  (worldDepth(0, 0, 1) - worldDepth(0, 0));

/**
 * Plays the slash from `from` toward `toward`, both world positions. The baked smear's arc faces
 * world +x with the player at its pivot, so it is turned by the world heading to the target.
 *
 * It lies at the player's feet but sorts over whichever stands nearer the viewer, the player or
 * anything on the aim within {@link SMEAR_REACH}, so neither the player nor the target hides it.
 */
export function playSlash(
  fx: Pick<EffectsRuntime, "play">,
  owner: OwnerKey,
  from: Point,
  toward: Point,
): void {
  const rotation = Math.atan2(toward.y - from.y, toward.x - from.x);
  fx.play(owner, "slash", from, {
    rotation,
    layer: swingLayer(from, toward),
  });
}

/**
 * The sub-layer a swing laid at `from`'s feet sorts at so that it draws over the player and over
 * anything on the aim toward `toward` within {@link SMEAR_REACH}, whichever stands nearer the
 * viewer. Shared by every melee swing drawn on the ground (the slash, the Mercenary's cut).
 */
export function swingLayer(from: Point, toward: Point): number {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  const rotation = Math.atan2(dy, dx);
  const reach = Math.min(Math.hypot(dx, dy), SMEAR_REACH);
  const front = {
    x: from.x + Math.cos(rotation) * reach,
    y: from.y + Math.sin(rotation) * reach,
  };
  const ahead = Math.max(
    0,
    depthKey(front.x, front.y) - depthKey(from.x, from.y),
  );
  return OVER_CHARACTERS + ahead * LAYERS_PER_KEY;
}
