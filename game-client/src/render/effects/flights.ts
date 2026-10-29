/**
 * How a projectile of a server `projectile_type` is drawn in flight (FS-KYPQ9 §E.2, §F.2;
 * FS-JTNPR req 20, 23), in every world that has projectiles: a run and a field (FS-X2F2H
 * §Requirements 56). A kind with no flight of its own stays drawn as today, as a fireball.
 */

import type { ProjectileKind } from "./projectile";
import { ARROW_FLIGHT } from "./arrow";
import { FIREBALL_FLIGHT } from "./fireball";
import { SHADOW_SHOT_FLIGHT } from "./shadowShot";

const FLIGHTS: ReadonlyMap<string, ProjectileKind> = new Map([
  ["arrow", ARROW_FLIGHT],
  ["shadow_shot", SHADOW_SHOT_FLIGHT],
  ["fireball", FIREBALL_FLIGHT],
]);

export function projectileFlightOf(projectileType: string): ProjectileKind {
  return FLIGHTS.get(projectileType) ?? FIREBALL_FLIGHT;
}
