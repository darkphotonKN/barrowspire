/**
 * Archer Shadow Shot (FS-JTNPR req 20–23): the arrow's baked body with a shadow on it. Effects
 * only, built on the arrow's: no new baked texture or pose.
 *
 * - Release (req 21): a dim slate snap and a puff of dark smoke at the bow, at bow height, heavier
 *   than the arrow's. Signal: the archer's own fired `CastSkill {skill_id: "shadow_shot"}`
 *   (FS-JTNPR req 14), one per send.
 * - Flight (req 20): the baked `fx_arrow` turned to its heading at bow height ({@link BOW_LIFT}),
 *   trailing dark smoke instead of the arrow's pale air-streak ({@link SHADOW_SHOT_FLIGHT}, flown
 *   by `ProjectileFlights` for a `shadow_shot` projectile). Flights are global, so teammates see
 *   the bolt as the archer does.
 * - Impact (req 21): dark smoke and steel motes settling where the bolt was last drawn, at the
 *   same bow height, heavier than the arrow's.
 */

import type { Point } from "@/render/iso/projection";
import { BOW_LIFT, playAtBow } from "./arrow";
import type { ProjectileKind } from "./projectile";
import type { EffectsRuntime, OwnerKey } from "./runtime";
import type { EffectName } from "./table";

/** Plays the release from the archer at `from` aiming at `toward`, both world positions. */
export function playShadowShotRelease(
  fx: Pick<EffectsRuntime, "play">,
  owner: OwnerKey,
  from: Point,
  toward: Point,
): void {
  playAtBow(fx, owner, "shadowShotRelease", from, toward);
}

/** Plays the impact at the bolt's last world position, at the height it flew. */
export function playShadowShotImpact(
  fx: Pick<EffectsRuntime, "play">,
  owner: OwnerKey,
  at: Point,
): void {
  fx.play(owner, "shadowShotImpact", at, { lift: BOW_LIFT });
}

/** A Shadow Shot in flight: the baked arrow turned to its heading, and its shadow trail. */
export const SHADOW_SHOT_FLIGHT: ProjectileKind = {
  body: "fx_arrow",
  trail: "shadowShotTrail",
  turns: true,
  lift: BOW_LIFT,
  impact: playShadowShotImpact,
};

/** Every table entry the Shadow Shot plays, for the palette check. */
export const SHADOW_SHOT_EFFECTS = [
  "shadowShotRelease",
  "shadowShotTrail",
  "shadowShotImpact",
] as const satisfies readonly EffectName[];
