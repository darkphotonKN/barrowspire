/**
 * Sorcerer fireball (FS-KYPQ9 §E): fire that reads as fire in a dark barrow, with no flat flash,
 * pulse or burst.
 *
 * - Cast (§E.1): embers drawn in toward the casting hand, at its height above the feet,
 *   brightening, and a short ember light at the caster. Signal, unchanged: the mage's own send
 *   of `CastSkill {skill_id: "fireball"}` or `{skill_id: "triple_fireball"}`, one per send. A
 *   rejected cast still plays it, as today.
 * - Flight (§E.2): the baked `fx_fire_core`, steady, trailing embers and smoke, flying at the
 *   casting hand's height ({@link HAND_LIFT}) above its footprint, with an ember light riding
 *   on it ({@link FIREBALL_FLIGHT}, flown by `ProjectileFlights`). The light pools on the
 *   ground under the flame, at the footprint.
 * - Impact (§E.3): a brief flare and embers falling from where the core was last drawn, at the
 *   same height; the light jumping up and decaying at the footprint, and a scorch fading on the
 *   ground. Hit and max range look the same: the client cannot tell them apart.
 */

import type { Point } from "@/render/iso/projection";
import { alongAim, type ProjectileKind } from "./projectile";
import type { EffectsRuntime, OwnerKey } from "./runtime";
import type { EffectName } from "./table";

/** Screen px along the aim from the delver to the casting hand, where the old flash sat. */
const HAND_REACH = 15;

/** Screen px above the delver's feet to the casting hand and staff head; the fireball flies here. */
export const HAND_LIFT = 42;

/** Plays the cast from the delver at `from` aiming at `toward`, both world positions. */
export function playFireballCast(
  fx: Pick<EffectsRuntime, "play">,
  owner: OwnerKey,
  from: Point,
  toward: Point,
): void {
  fx.play(owner, "fireballCast", alongAim(from, toward, HAND_REACH), {
    lift: HAND_LIFT,
  });
  fx.play(owner, "castLight", from);
}

/**
 * Plays the impact at the fireball's last world position: the flare and embers at the height it
 * flew, the scorch (a ground mark) and the light pool on the ground beneath.
 */
export function playFireballImpact(
  fx: Pick<EffectsRuntime, "play">,
  owner: OwnerKey,
  at: Point,
): void {
  fx.play(owner, "scorch", at);
  fx.play(owner, "impactFlare", at, { lift: HAND_LIFT });
  fx.play(owner, "lightDecay", at);
  fx.play(owner, "fallingEmbers", at, { lift: HAND_LIFT });
}

/** A fireball in flight: the steady core, its ember-and-smoke trail and riding light. */
export const FIREBALL_FLIGHT: ProjectileKind = {
  body: "fx_fire_core",
  trail: "fireballTrail",
  turns: false,
  lift: HAND_LIFT,
  impact: playFireballImpact,
};

/** Every table entry the fireball plays, for the palette check. */
export const FIREBALL_EFFECTS = [
  "fireballCast",
  "castLight",
  "fireballTrail",
  "impactFlare",
  "lightDecay",
  "fallingEmbers",
  "scorch",
] as const satisfies readonly EffectName[];
