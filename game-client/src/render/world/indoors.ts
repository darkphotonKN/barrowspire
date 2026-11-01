/**
 * Where the player is, and what that hides (FS-9PN7X §A, §C): the one rule every scene follows
 * for whatever stands in a building the player is not in, or outside the one they are in.
 *
 * Pure maths, no Phaser.
 */

// by path, not the barrel: the barrel pulls in the Phaser drawing helpers
import type { Point } from "@/render/iso/projection";
import { insideHouse, type House } from "./houses";

/**
 * The building a world position stands in: `insideHouse`, edges inclusive (a door gap is
 * inside), the first in `houses` order when two rects both hold it (§A.2). No hysteresis
 * (§A.3): the test is used as is. Undefined outside every building, or with no position.
 */
export function buildingAt<T extends House>(pos: Point | undefined, houses: readonly T[]): T | undefined {
  return pos ? houses.find((h) => insideHouse(pos, h)) : undefined;
}

/**
 * Whether a world position is hidden from the player (§C.1): it stands in a building the player
 * is not in, or the player is in a building and it stands outside it. Put as one test: its
 * building is not the player's. The player is never hidden by it, since their building is
 * picked by the same rule (§C.3).
 */
export function hidden(pos: Point, houses: readonly House[], playerBuilding: House | undefined): boolean {
  return buildingAt(pos, houses) !== playerBuilding;
}

/**
 * Whether a function marker (a function NPC's or the stash chest's plate and sigil) shows
 * (§C.5): over a closed building from the street, and inside the player's own building, but
 * never while the player is inside a building it is not in, where the blackout hides it.
 */
export function markerShown(pos: Point, houses: readonly House[], playerBuilding: House | undefined): boolean {
  return !playerBuilding || !hidden(pos, houses, playerBuilding);
}
