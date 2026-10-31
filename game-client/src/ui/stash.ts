/**
 * The stash's rules (FS-VPD8Y R35–36, R39): how many items it holds, when it is full, how its
 * count reads, what a refused move says and which items may move at all. Phaser-free and free of
 * geometry, like `./bag`. The stash is the account's town storage, shown in the overlay's left
 * panel at the hub's stash chest; never the container view (game-client/CONTEXT.md).
 */

import type { ItemState } from "@/types/gameState";

/** The most items a stash holds: items-service's stash cap (FS-VPD8Y R35). */
export const STASH_CAPACITY = 60;

/** Where an unworn item is kept: carried in the bag or stored in the stash (items-service's *item location*). */
export type ItemLocation = "bag" | "stash";

/** The words a refused move into a full stash shows (R39, R42). */
export const STASH_FULL_NOTICE = "Your stash is full.";

/** The words a refused move of an item that is listed, settling or gone shows (R39, R42). */
export const NOT_FREE_NOTICE = "That item is not free to move.";

/** Whether a stash holding `count` items has no room for one more (R39). */
export function stashFull(count: number): boolean {
  return count >= STASH_CAPACITY;
}

/** The stash's count, `N / 60` (R35); over capacity it reads e.g. `64 / 60` (R36). */
export function stashCountLabel(count: number): string {
  return `${count} / ${STASH_CAPACITY}`;
}

/**
 * Whether an item may move between bag and stash: only an `AVAILABLE` one (R39). An item with no
 * status (a run's item, or an older gateway) is taken as free; the server stays the authority.
 */
export function freeToMove(item: ItemState): boolean {
  return item.status === undefined || item.status === "AVAILABLE";
}
