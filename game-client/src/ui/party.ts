/**
 * The co-op party on the HUD (FS-77AB6 req 40, 42): whether a delver is still in the delve, and
 * what a delver who is out of it is told while the rest play on. Pure, so the rule and the copy
 * are tested without a canvas; the scene draws what these return.
 */

import type { PlayerState } from "@/types/gameState";

/** The slice of a delver these rules read. */
type Delver = Pick<PlayerState, "escape" | "current_health">;

/**
 * Out of the delve (FS-77AB6 req 17): escaped, or fallen. A resolved delver keeps receiving
 * state until the end, but no longer acts in it. An absent delver is not one.
 */
export function resolved(delver?: Delver | null): boolean {
  if (!delver) return false;
  return (
    delver.escape === true ||
    (delver.current_health !== undefined && delver.current_health <= 0)
  );
}

/**
 * The notice a resolved delver sees while another delver is still in the delve (req 42), or
 * `null`. Once no one is left in it, `end_game` is on its way and carries the last word.
 */
export function delveNotice(state: {
  current_player: Delver | null;
  other_players?: Delver[];
}): string | null {
  const me = state.current_player;
  if (!me || !resolved(me)) return null;
  if (!(state.other_players ?? []).some((other) => !resolved(other)))
    return null;
  return me.escape === true
    ? "You are out of the barrow. The delve goes on without you."
    : "The barrow keeps you. The delve goes on without you.";
}
