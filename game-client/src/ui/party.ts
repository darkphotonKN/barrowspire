/**
 * The co-op party on the HUD (FS-77AB6 req 40; FS-QPDKN req 1, 3, 7, 8, 11; FS-9K8EZ req 2, 3):
 * whether a player is still in the delve, which card a player who is out of it is shown while
 * the rest play on, whose eyes they may watch through, and what the run's ESC menu offers them.
 * Pure, so the rules and the copy are tested without a canvas; the scene draws what these return.
 */

import type { PlayerState } from "@/types/gameState";

/** The slice of a player these rules read. */
type Player = Pick<PlayerState, "escape" | "current_health">;

/**
 * Out of the delve (FS-77AB6 req 17): escaped, or fallen. A resolved player keeps receiving
 * state until the end, but no longer acts in it. An absent player is not one. A player left on
 * a lower floor (FS-F6F88) arrives fallen, so they count here too.
 */
export function resolved(player?: Player | null): boolean {
  if (!player) return false;
  return (
    player.escape === true ||
    (player.current_health !== undefined && player.current_health <= 0)
  );
}

/** How the player is out of the delve: escaped, or dead (left behind counts as dead). */
export type ResolvedCardKind = "dead" | "escaped";

/** The resolved player's card: its kind and its copy. The scene adds the buttons. */
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
 * The card a resolved player sees while another player is still in the delve (FS-QPDKN req 1,
 * 3), or `null`. Once no one is left in it, `end_game` is on its way and carries the last word.
 */
export function resolvedCard(state: {
  current_player: Player | null;
  other_players?: Player[];
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

type NamedPlayer = Player & Pick<PlayerState, "id" | "username">;

/**
 * The teammates still in play, in a stable order (by id, whatever order the broadcast lists
 * them in), never this player (FS-QPDKN req 7, 8).
 */
export function watchable(state: {
  current_player: Pick<PlayerState, "id"> | null;
  other_players?: NamedPlayer[];
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

/** One line of the run's ESC menu, or of the confirm that replaces its rows (FS-9K8EZ req 2, 3). */
export interface RunMenuChoice {
  id: "fall" | "leave" | "back" | "fall-now" | "not-yet";
  label: string;
  /** Amber for a thing the player can do, the cancel register for going back. */
  register: "actionable" | "cancel";
}

const BACK: RunMenuChoice = { id: "back", label: "Back  [Esc]", register: "cancel" };

/**
 * What the run's ESC menu offers, from the player's state as it opens (FS-9K8EZ req 2): a
 * living player may fall where they stand; a dead one (left behind counts as dead) may leave
 * the barrow, the same door as their card's; an escaped one waits for the run's end, so there
 * is nothing but the way back. The row says death, never a forfeit or a withdrawal.
 */
export function runMenuChoices(state: { resolved: boolean; escaped: boolean }): RunMenuChoice[] {
  if (!state.resolved)
    return [{ id: "fall", label: "Fall where you stand", register: "actionable" }, BACK];
  if (!state.escaped)
    return [{ id: "leave", label: "Leave the barrow", register: "actionable" }, BACK];
  return [BACK];
}

/** The one asking before a chosen death (FS-9K8EZ req 3): the line, and Fall or Not yet. */
export const FALL_CONFIRM: { line: string; choices: RunMenuChoice[] } = {
  line: "The barrow keeps its dead. Fall here?",
  choices: [
    { id: "fall-now", label: "Fall", register: "actionable" },
    { id: "not-yet", label: "Not yet  [Esc]", register: "cancel" },
  ],
};
