/**
 * An ogre's thrown rock (FS-C8VM7 §F R38): slow, big and painful, easy to step out of if seen. The
 * server flies it slowly; the client draws it big, so it is seen coming.
 *
 * - Flight: a baked round body drawn large, shaded slate to a dark hostile red on its leading
 *   face, at an ogre's overhand height, shedding grit and a few hostile-red motes
 *   ({@link OGRE_ROCK_FLIGHT}, flown by `ProjectileFlights` for an `ogre_rock` projectile). It does
 *   not turn: a tumbling stone has no heading to point. No light.
 * - No release of its own: the throw is the ogre's `attack` clip. It lands in the arrow's dull puff
 *   of dust.
 *
 * Signal: a `ProjectileState` of type `ogre_rock` appearing, moving and disappearing.
 */

import { ARROW_FLIGHT } from "./arrow";
import type { ProjectileKind } from "./projectile";
import type { EffectName } from "./table";

/** Screen px above an ogre's footprint it throws from: over a brute's shoulder. *Starting value.* */
export const ROCK_LIFT = 58;

/** The body drawn this many times its baked size, so the rock reads big. *Starting value.* */
const ROCK_SCALE = 1.8;

/** An ogre's rock in flight. */
export const OGRE_ROCK_FLIGHT: ProjectileKind = {
  body: "fx_fire_core",
  tint: ["slate", "oxblood"],
  trail: "ogreRockTrail",
  turns: false,
  lift: ROCK_LIFT,
  scale: ROCK_SCALE,
  impact: ARROW_FLIGHT.impact,
};

/** Every table entry the rock plays, for the palette check. */
export const OGRE_ROCK_EFFECTS = ["ogreRockTrail"] as const satisfies readonly EffectName[];
