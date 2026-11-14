/**
 * How a projectile of a server `projectile_type` is drawn in flight (FS-KYPQ9 §E.2, §F.2;
 * FS-JTNPR req 20, 23; FS-B4SG9 §D R22; FS-C8VM7 §F R38), in every world that has projectiles: a run and a field (FS-X2F2H
 * §Requirements 56). A kind with no flight of its own stays drawn as today, as a fireball.
 */

import type { ProjectileKind } from "./projectile";
import { ARROW_FLIGHT } from "./arrow";
import { BONE_ARROW_FLIGHT } from "./boneArrow";
import { FIREBALL_FLIGHT } from "./fireball";
import { OGRE_ROCK_FLIGHT } from "./ogreRock";
import { SHADOW_SHOT_FLIGHT } from "./shadowShot";
import { THROWN_DAGGER_FLIGHT } from "./thrownDagger";

const FLIGHTS: ReadonlyMap<string, ProjectileKind> = new Map([
  ["arrow", ARROW_FLIGHT],
  ["shadow_shot", SHADOW_SHOT_FLIGHT],
  // a Bone Archer's, and each arrow of a Wight Archer's volley (FS-C8VM7 §F R38)
  ["bone_arrow", BONE_ARROW_FLIGHT],
  // a goblin's dagger and an ogre's rock (FS-C8VM7 §F R38)
  ["thrown_dagger", THROWN_DAGGER_FLIGHT],
  ["ogre_rock", OGRE_ROCK_FLIGHT],
  ["fireball", FIREBALL_FLIGHT],
]);

export function projectileFlightOf(projectileType: string): ProjectileKind {
  return FLIGHTS.get(projectileType) ?? FIREBALL_FLIGHT;
}
