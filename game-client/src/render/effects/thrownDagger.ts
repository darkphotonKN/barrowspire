/**
 * A goblin's thrown dagger (FS-C8VM7 §F R38): a small blade spun at a player from past a goblin's
 * reach, in the hostile channel, so a throw from the dark reads as damage coming in (guideline
 * "Enemy design language": a hostile's attack effect is in the hostile channel too).
 *
 * - Flight: the baked `fx_arrow` drawn small, turned to its heading at hand height, shaded from a
 *   steel grip to a hostile-red edge, a faint red glint trailing it ({@link THROWN_DAGGER_FLIGHT},
 *   flown by `ProjectileFlights` for a `thrown_dagger` projectile). No light: a blade, not a flame.
 * - No release of its own: the throw is the goblin's `attack` clip. It lands as an arrow does, in
 *   the arrow's dull puff of dust.
 *
 * Signal: a `ProjectileState` of type `thrown_dagger` appearing, moving and disappearing.
 */

import { ARROW_FLIGHT, BOW_LIFT } from "./arrow";
import type { ProjectileKind } from "./projectile";
import type { EffectName } from "./table";

/** A dagger is a short blade: the arrow's body at this share of its size. *Starting value.* */
const DAGGER_SCALE = 0.55;

/** A thrown dagger in flight. */
export const THROWN_DAGGER_FLIGHT: ProjectileKind = {
  body: "fx_arrow",
  tint: ["slateLight", "oxbloodText"],
  trail: "thrownDaggerTrail",
  turns: true,
  // a goblin is fodder-sized: it throws from where a Bone Archer looses
  lift: BOW_LIFT,
  scale: DAGGER_SCALE,
  impact: ARROW_FLIGHT.impact,
};

/** Every table entry the dagger plays, for the palette check. */
export const THROWN_DAGGER_EFFECTS = ["thrownDaggerTrail"] as const satisfies readonly EffectName[];
