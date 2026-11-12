/**
 * The roster and the party (FS-NCC9J §Change: Changing character leaves the party, C9-C12; owner
 * 2026-11-12). Going back to the roster keeps the party; choosing a character there is the switch.
 * The server sends the roster the party as a `party_update` sync, `locked` while its run is under
 * way on that pod (C9). The card of the character the party holds this player as is marked; that
 * character enters at once and stays in the party (C10); another asks first (C11), or, while the
 * party is locked, shows the server's own refusal instead (C12). The server decides either way:
 * this only spares the player a surprise.
 */

import type { PartyUpdatePayload } from "@/stores/partyStore";

/** A roster character, as far as the party is concerned. */
export interface RosterCharacter {
  name: string;
  className: string;
}

/** The mark on the card of the party's character. */
export const ROSTER_PARTY_MARK = "IN A PARTY";

/** The confirm's buttons. */
export const SWITCH_LEAVE_LABEL = "LEAVE PARTY";
export const SWITCH_CANCEL_LABEL = "CANCEL";

/** The server's own words for a switch while the party's run is under way (FS-BDA7X R7, C12). */
export const SWITCH_LOCKED = "You cannot change character during a delve.";

/** The confirm's line (C11). */
export function switchConfirmText(name: string): string {
  return `Entering as ${name} will leave your party.`;
}

/**
 * Whether the party holds this player as character: their member entry carries its name (unique
 * among characters, case aside) and class. False with no party or no player.
 */
export function inPartyAs(
  character: RosterCharacter,
  party: PartyUpdatePayload | null,
  selfId: string | undefined,
): boolean {
  if (!party || !selfId) return false;
  const self = party.members.find((m) => m.player_id === selfId);
  if (!self) return false;
  return (
    self.name.toLowerCase() === character.name.toLowerCase() &&
    self.class.toLowerCase() === character.className.toLowerCase()
  );
}

/** What ENTER THE TOWN does with the chosen character. */
export type EntryChoice =
  | { kind: "enter" }
  | { kind: "confirm"; text: string }
  | { kind: "refused"; text: string };

/**
 * Enter at once with no party or as the party's own character (C10); ask first as another (C11);
 * show the refusal instead while the party's run is under way (C12).
 */
export function entryChoice(
  character: RosterCharacter,
  party: PartyUpdatePayload | null,
  selfId: string | undefined,
): EntryChoice {
  const self = party && selfId ? party.members.find((m) => m.player_id === selfId) : undefined;
  if (!party || !self || inPartyAs(character, party, selfId)) return { kind: "enter" };
  if (party.locked) return { kind: "refused", text: SWITCH_LOCKED };
  return { kind: "confirm", text: switchConfirmText(character.name) };
}
