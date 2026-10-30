/**
 * The bag's rules (FS-HRH2J §B R14, R20–23): how many items it holds, when it is full, what a
 * refusal says and how its count reads. Phaser-free and free of geometry, so the overlay that
 * draws the bag, the equip HUD that pre-checks it and the hub all read one rule. The bag is the
 * carried item list the gear overlay shows, never the container view (game-client/CONTEXT.md).
 */

/** The most items a bag holds: game-service `BagCapacity` (FS-HRH2J R31). */
export const BAG_CAPACITY = 30;

/** The words a refused pickup or unequip shows (R22): plain, since the player must act on them. */
export const BAG_FULL_NOTICE = "Your bag is full.";

/** Whether a bag holding `count` items has no room for one more (R20, R21). */
export function bagFull(count: number): boolean {
  return count >= BAG_CAPACITY;
}

/** The bag's count, `N / 30` (R14); over capacity it reads e.g. `34 / 30` (R23). */
export function bagCountLabel(count: number): string {
  return `${count} / ${BAG_CAPACITY}`;
}
