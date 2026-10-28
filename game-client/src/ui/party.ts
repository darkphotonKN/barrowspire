/**
 * The co-op party on the HUD (FS-77AB6 req 40; FS-QPDKN req 1, 3, 7, 8, 11): whether a delver is
 * still in the delve, which card a delver who is out of it is shown while the rest play on, and
 * whose eyes they may watch through. Pure, so the rules and the copy are tested without a
 * canvas; the scene draws what these return.
 */

import type { PlayerState } from "@/types/gameState";

/** The slice of a delver these rules read. */
type Delver = Pick<PlayerState, "escape" | "current_health">;

/**
 * Out of the delve (FS-77AB6 req 17): escaped, or fallen. A resolved delver keeps receiving
 * state until the end, but no longer acts in it. An absent delver is not one. A delver left on
 * a lower floor (FS-F6F88) arrives fallen, so they count here too.
 */
export function resolved(delver?: Delver | null): boolean {
  if (!delver) return false;
  return (
    delver.escape === true ||
    (delver.current_health !== undefined && delver.current_health <= 0)
  );
}

/** How the delver is out of the delve: escaped, or dead (left behind counts as dead). */
export type ResolvedCardKind = "dead" | "escaped";

/** The resolved delver's card: its kind and its copy. The scene adds the buttons. */
export interface ResolvedCard {
  kind: ResolvedCardKind;
  title: string;
  body: string;
}

const CARDS: Record<ResolvedCardKind, ResolvedCard> = {
  dead: {
    kind: "dead",
    title: "The barrow keeps you",
    body: "The delve goes on without you.",
  },
  escaped: {
    kind: "escaped",
    title: "You are out of the barrow",
    body: "Few return whole. The delve goes on without you.",
  },
};

/**
 * The card a resolved delver sees while another delver is still in the delve (FS-QPDKN req 1,
 * 3), or `null`. Once no one is left in it, `end_game` is on its way and carries the last word.
 */
export function resolvedCard(state: {
  current_player: Delver | null;
  other_players?: Delver[];
}): ResolvedCard | null {
  const me = state.current_player;
  if (!me || !resolved(me)) return null;
  if (!(state.other_players ?? []).some((other) => !resolved(other)))
    return null;
  return CARDS[me.escape === true ? "escaped" : "dead"];
}

/** A teammate a spectator may watch: who they are, by the name over their head. */
export interface Watchable {
  id: string;
  username: string;
}

type NamedDelver = Delver & Pick<PlayerState, "id" | "username">;

/**
 * The teammates still in play, in a stable order (by id, whatever order the broadcast lists
 * them in), never this delver (FS-QPDKN req 7, 8).
 */
export function watchable(state: {
  current_player: Pick<PlayerState, "id"> | null;
  other_players?: NamedDelver[];
}): Watchable[] {
  const me = state.current_player?.id;
  return (state.other_players ?? [])
    .filter((other) => other.id !== me && !resolved(other))
    .map(({ id, username }) => ({ id, username }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Who to watch next: the one after `current` in the list, round to the first; the first when
 * there is no current or the current has resolved (FS-QPDKN req 7, 8, 11). Nobody when the list
 * is empty: the run is ending.
 */
export function nextWatched(
  list: Watchable[],
  current?: string,
): string | undefined {
  if (list.length === 0) return undefined;
  const at = list.findIndex((w) => w.id === current);
  return list[(at + 1) % list.length].id;
}
