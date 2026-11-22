/**
 * Archer Heavy Shot (FS-1J1CB §F R39–R43): every archer's right-click but a Shadow Ranger's. The
 * Shadow Shot's slow bolt (FS-JTNPR) with the shadow taken out, read as heavier than the arrow by
 * weight, not by hue. Effects only, built on the arrow's: no new baked texture or pose.
 *
 * - Release (R40): a harder string-snap than the arrow's and a burst of fibre and dust at the bow,
 *   at bow height. Signal: the archer's own fired `CastSkill {skill_id: "shadow_shot"}`, as the
 *   Shadow Shot's (R41).
 * - Flight (R40): the baked `fx_arrow` turned to its heading at bow height ({@link BOW_LIFT}), a
 *   faint vellum glow on it and a thicker pale wake than the arrow's air-streak that hangs a little
 *   longer ({@link HEAVY_SHOT_FLIGHT}). No pitch halo, no umbra, no light.
 * - Impact (R40): a heavier thud of dust and splinters than the arrow's where the bolt was last
 *   drawn, at the same bow height.
 *
 * Which of the two a right-click is: {@link wearsShadow}. The wire's projectile is `shadow_shot`
 * for both; sounds are the Shadow Shot's for both (R43).
 */

import { specializationOf } from "@/data/specializations";
import type { Point } from "@/render/iso/projection";
import { BOW_LIFT, playAtBow } from "./arrow";
import type { ProjectileKind } from "./projectile";
import type { EffectsRuntime, OwnerKey } from "./runtime";
import { playShadowShotRelease, SHADOW_SHOT_FLIGHT } from "./shadowShot";
import type { EffectName } from "./table";

/** Plays the release from the archer at `from` aiming at `toward`, both world positions. */
export function playHeavyShotRelease(
  fx: Pick<EffectsRuntime, "play">,
  owner: OwnerKey,
  from: Point,
  toward: Point,
): void {
  playAtBow(fx, owner, "heavyShotRelease", from, toward);
}

/** Plays the impact at the bolt's last world position, at the height it flew. */
export function playHeavyShotImpact(
  fx: Pick<EffectsRuntime, "play">,
  owner: OwnerKey,
  at: Point,
): void {
  fx.play(owner, "heavyShotImpact", at, { lift: BOW_LIFT });
}

/** A Heavy Shot in flight: the baked arrow turned to its heading, and its pale wake. */
export const HEAVY_SHOT_FLIGHT: ProjectileKind = {
  body: "fx_arrow",
  trail: "heavyShotTrail",
  turns: true,
  lift: BOW_LIFT,
  impact: playHeavyShotImpact,
};

/** Every table entry the Heavy Shot plays, for the palette check. */
export const HEAVY_SHOT_EFFECTS = [
  "heavyShotRelease",
  "heavyShotTrail",
  "heavyShotImpact",
] as const satisfies readonly EffectName[];

/**
 * Whether an archer holding `specialization` shoots the shadow (R39, R42): a Shadow Ranger only.
 * No specialization, a Hunter, or an id the client does not know shoots the Heavy Shot.
 */
export function wearsShadow(specialization: string | undefined): boolean {
  return specializationOf("archer", specialization) === "shadow_ranger";
}

/** The right-click's flight: the Shadow Shot's for a Shadow Ranger, the Heavy Shot's otherwise (R41). */
export function archerShotFlight(shadow: boolean): ProjectileKind {
  return shadow ? SHADOW_SHOT_FLIGHT : HEAVY_SHOT_FLIGHT;
}

/** The right-click's release at the bow: the Shadow Shot's for a Shadow Ranger, the Heavy Shot's otherwise (R41). */
export function playArcherShotRelease(
  fx: Pick<EffectsRuntime, "play">,
  owner: OwnerKey,
  from: Point,
  toward: Point,
  shadow: boolean,
): void {
  if (shadow) playShadowShotRelease(fx, owner, from, toward);
  else playHeavyShotRelease(fx, owner, from, toward);
}
