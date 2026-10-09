/**
 * A floor's fixed-light budget (FS-8RBQY §C.6): the sconces, arrow slits, braziers and the stairs
 * pool stamped once per floor build are capped, so a crowded floor never stamps more pools than
 * the light-map is tuned for. The delver's carried torch and transient lights are not fixed
 * lights and never pass through here.
 *
 * Pure: it decides which lights to keep, the scene stamps them. The choice depends only on each
 * light's kind and place, never on arrival order, so every client keeps the same pools.
 */

import type { Point } from "@/render/iso";
import type { LightSource } from "@/render/lighting/lighting";
import { BARROW_HEX } from "@/utils/theme";
import { tileHash } from "./ground";

/**
 * What kind of fixed light a pool is: the budget drops by kind. `interactable` is the faint pool
 * a chest or switch stands in under the tower's dark ambient (§B.7's readability floor).
 */
export type FixedLightKind =
  | "stairs"
  | "interactable"
  | "sconce"
  | "brazier"
  | "slit";

/** The most fixed lights one floor stamps. */
export const FIXED_LIGHT_CAP = 24;

/**
 * Past the cap, lights go in this order (§C.6), an interactable's pool last of all: it is what
 * keeps a chest reading as one. The stairs pool is not on it: it is never dropped.
 */
const DROP_ORDER: readonly FixedLightKind[] = [
  "slit",
  "brazier",
  "sconce",
  "interactable",
];

/**
 * The faint warm pool an interactable stands in, so a chest or switch never sinks into the
 * ambient (FS-8RBQY §B.7). Amber, because the delver can act on it (guideline "Gameplay
 * accent"); smaller and dimmer than any sconce, so it reads as a glint, not a light.
 */
export function interactablePool(at: Point, seed: number): LightSource {
  return {
    x: at.x,
    y: at.y,
    radius: 84,
    color: BARROW_HEX.amber,
    intensity: 0.32,
    flicker: 0.12,
    seed,
  };
}

/** One fixed light: its kind, where it stands (any fixed frame), and what the scene stamps. */
export interface FixedLight<T> {
  kind: FixedLightKind;
  at: Point;
  light: T;
}

/** Which of a kind goes first: by a hash of place, so the drops scatter along a wall. */
const dropRank = (l: FixedLight<unknown>) =>
  tileHash(Math.round(l.at.x), Math.round(l.at.y), 0x4c49_4748);

/**
 * The lights to stamp, in the order given: all of them while they fit under `cap`, else less the
 * slits, then braziers, then sconces needed to fit. The stairs pool always survives.
 */
export function budgetLights<T>(
  lights: readonly FixedLight<T>[],
  cap: number = FIXED_LIGHT_CAP,
): FixedLight<T>[] {
  let over = lights.length - Math.max(cap, 0);
  if (over <= 0) return [...lights];
  const dropped = new Set<FixedLight<T>>();
  for (const kind of DROP_ORDER) {
    const ofKind = lights
      .filter((l) => l.kind === kind)
      .sort((a, b) => dropRank(b) - dropRank(a));
    for (const l of ofKind) {
      if (over <= 0) break;
      dropped.add(l);
      over--;
    }
  }
  return lights.filter((l) => !dropped.has(l));
}
