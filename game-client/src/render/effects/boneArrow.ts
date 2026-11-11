/**
 * A Bone Archer's arrow (FS-B4SG9 §D R22): the arrow's shape in the hostile channel, so a shot
 * from the dark is read as damage coming in and never as a party archer's own (guideline "Enemy
 * design language": a hostile's attack effect is in the hostile channel too).
 *
 * - Flight: the baked `fx_arrow` turned to its heading at bow height ({@link BOW_LIFT}), shaded
 *   from a bone tail to a hostile-red head, wrapped in a dim glow of the same red and
 *   a few ember motes shed behind it that die with it ({@link BONE_ARROW_FLIGHT}, flown by
 *   `ProjectileFlights` for a `bone_arrow` projectile). Ember and lifted oxblood only: never
 *   amber, which means *interactable*, never arcane green, never the party arrow's pale streak.
 *   No light: an arrow, not a flame.
 * - No release and no hit effect of its own (§Out of Scope): the draw is the sheet's `attack`
 *   clip, and it lands as any arrow does, in the arrow's dull puff of dust.
 *
 * Signal, unchanged: a `ProjectileState` of type `bone_arrow` appearing, moving and disappearing.
 */

import { ARROW_FLIGHT, BOW_LIFT } from "./arrow";
import type { ProjectileKind } from "./projectile";
import type { EffectName } from "./table";

/** A bone arrow in flight: the baked arrow in bone and hostile red, and its ember trail. */
export const BONE_ARROW_FLIGHT: ProjectileKind = {
  body: "fx_arrow",
  tint: ["vellum", "oxbloodText"],
  trail: "boneArrowTrail",
  turns: true,
  lift: BOW_LIFT,
  impact: ARROW_FLIGHT.impact,
};

/** Every table entry the bone arrow plays, for the palette check. */
export const BONE_ARROW_EFFECTS = [
  "boneArrowTrail",
] as const satisfies readonly EffectName[];
