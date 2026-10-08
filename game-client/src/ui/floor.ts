/**
 * The climb's words on the HUD (FS-F6F88 req 29, 31): which floor the party stands on, and
 * what the stairs say when the party has not gathered. Pure, so the copy is tested without a
 * canvas; the scene draws what these return.
 */

import type { ClientGameState } from "@/types/gameState";

/** "Floor N of M" from the broadcast, or `null` where there are no floors (the hub). */
export function floorLabel(
  state: Pick<ClientGameState, "floor" | "floor_count">,
): string | null {
  if (state.floor === undefined || state.floor_count === undefined) return null;
  return `Floor ${state.floor} of ${state.floor_count}`;
}

/**
 * Whether the party climbed between two broadcasts (FS-F6F88 req 28): the floor went up. With no
 * previous floor (the first broadcast after a connect or reconnect) the incoming floor is the
 * baseline, built directly with no transition (req 32).
 */
export function climbed(previous: number | undefined, incoming: number | undefined): boolean {
  return previous !== undefined && incoming !== undefined && incoming > previous;
}

const ORDINALS = [
  "First",
  "Second",
  "Third",
  "Fourth",
  "Fifth",
  "Sixth",
  "Seventh",
  "Eighth",
  "Ninth",
  "Tenth",
];

/** The card the view comes back up with after a climb (FS-F6F88 req 32): a name and one line. */
export interface FloorCard {
  title: string;
  line: string;
}

/** "The Second Floor", and what waits there: worse below the top, the end of the stair at it. */
export function floorCard(state: { floor: number; floor_count: number }): FloorCard {
  const ordinal = ORDINALS[state.floor - 1];
  const title = ordinal ? `The ${ordinal} Floor` : `Floor ${state.floor}`;
  const line =
    state.floor >= state.floor_count
      ? "No stair climbs higher. Only the way out remains."
      : "The dead walk heavier here.";
  return { title, line };
}

/** The server's `interact` reply (FS-F6F88 req 22 adds `reason` and `missing`). */
export interface InteractReply {
  success: boolean;
  message: string;
  reason?: string;
  /** Living delvers not yet in range of the stairs, on a `party_not_gathered` refusal. */
  missing?: number;
}

/**
 * How a notice reads on the HUD: `done` and `refused` keep today's colours; `waiting` is the
 * stairs holding for the party, which is neither a success nor harm done.
 */
export type NoticeTone = "done" | "refused" | "waiting";

export interface Notice {
  text: string;
  tone: NoticeTone;
}

/** The reason the server gives when the stairs refuse a party that has not gathered. */
export const PARTY_NOT_GATHERED = "party_not_gathered";

/**
 * The notice an `interact` reply raises, or `null` for one with nothing to say (the empty frame
 * that follows every reply). A gather refusal is written here in the lore voice from `missing`;
 * every other reply keeps the server's words.
 */
export function interactNotice(reply: InteractReply): Notice | null {
  if (!reply.success && reply.reason === PARTY_NOT_GATHERED) {
    return { text: gatherNotice(reply.missing), tone: "waiting" };
  }
  if (!reply.message) return null;
  return { text: reply.message, tone: reply.success ? "done" : "refused" };
}

/** "The stair waits. 2 of your party are not yet with you." */
function gatherNotice(missing?: number): string {
  if (missing === undefined || missing < 1) return "The stair waits for the whole party.";
  const verb = missing === 1 ? "is" : "are";
  return `The stair waits. ${missing} of your party ${verb} not yet with you.`;
}
