/**
 * Archer arrow (FS-KYPQ9 §F): a real arrow with a pale trail that goes through with it, a small
 * release at the bow and a dull puff where it lands. No white streak, no chips, no light.
 *
 * - Release (§F.1): a faint string-snap shimmer at the bow, at bow height above the feet, and a
 *   few fibre motes. Signal, unchanged: the archer's own send of `CastSkill {skill_id: "arrow"}`
 *   or `{skill_id: "triple_arrow"}`, one per send.
 * - Flight (§F.2): the baked `fx_arrow` (with a faint hairline streak behind the nock) turned
 *   to its heading, with pale air-streak motes left behind it that die with it
 *   ({@link ARROW_FLIGHT}, flown by `ProjectileFlights`).
 * - Impact (§F.3): a little dust and splinters dropping to the ground.
 */

import type { Point } from "@/render/iso/projection";
import { alongAim, type ProjectileKind } from "./projectile";
import type { EffectsRuntime, OwnerKey } from "./runtime";
import type { EffectName } from "./table";

/** Screen px along the aim from the delver to the bow, as the old release sat. */
const BOW_REACH = 16;

/** Screen px above the delver's feet to the bow hand, where the string snaps. */
export const BOW_LIFT = 38;

/** Plays the release from the delver at `from` aiming at `toward`, both world positions. */
export function playArrowRelease(
  fx: Pick<EffectsRuntime, "play">,
  owner: OwnerKey,
  from: Point,
  toward: Point,
): void {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  const direction = dx !== 0 || dy !== 0 ? { x: dx, y: dy } : undefined;
  fx.play(owner, "arrowRelease", alongAim(from, toward, BOW_REACH), {
    lift: BOW_LIFT,
    ...(direction ? { direction } : {}),
  });
}

/** Plays the impact at the arrow's last world position. */
export function playArrowImpact(
  fx: Pick<EffectsRuntime, "play">,
  owner: OwnerKey,
  at: Point,
): void {
  fx.play(owner, "arrowImpact", at);
}

/** An arrow in flight: the baked arrow turned to its heading, and its air-streak. */
export const ARROW_FLIGHT: ProjectileKind = {
  body: "fx_arrow",
  trail: "arrowTrail",
  turns: true,
  impact: playArrowImpact,
};

/** Every table entry the arrow plays, for the palette check. */
export const ARROW_EFFECTS = [
  "arrowRelease",
  "arrowTrail",
  "arrowImpact",
] as const satisfies readonly EffectName[];
