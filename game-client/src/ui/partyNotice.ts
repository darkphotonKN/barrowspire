/**
 * The words for every `party_notice` (FS-R82NV R36, FS-NCC9J R29). The server sends a code and, when the
 * notice is about another player, their name; the client owns the copy, in the lore voice.
 * Each notice lands in the chat window as a system line (R31).
 */

import type { PartyNoticePayload } from "@/stores/partyStore";

/**
 * R36's table with FS-NCC9J R29's codes; `{name}` is the player the notice concerns. `pod_full`
 * and `not_in_hub` keep their words but now answer a travel (FS-NCC9J R18); `locked` keeps its
 * words and now also answers an invite or a create from a run (FS-NCC9J R9, R15).
 */
export const PARTY_NOTICE_COPY: Readonly<Record<string, string>> = {
  sent: "Word sent to {name}.",
  accepted: "{name} answers the call.",
  no_show: "{name} did not arrive.",
  declined: "{name} declines.",
  // the accepter's view: the leader's "No answer from <name>." is written by the client (FS-NCC9J R27)
  expired: "That invitation has lapsed.",
  not_found: "{name} is not here right now.",
  already_in_party: "{name} walks with another party.",
  party_full: "Your party is full.",
  pod_full: "No room where your party stands.",
  pending: "{name} has already been asked.",
  self: "You cannot invite yourself.",
  not_leader: "Only the leader may do that.",
  not_member: "They are not in your party.",
  not_in_hub: "Only from the village.",
  locked: "Not while delving.",
  queued: "Leave the queue first.",
  party_gone: "That party is no more.",
  delivery_failed: "Word could not be sent.",
  leader_away: "Your leader cannot be reached.",
  unavailable: "The party cannot be changed right now.",
  // the invite's target is in a run: named, so the inviter knows whom to ask later (FS-NCC9J R10)
  delving: "{name} is in a delve.",
};

/** Stands in for a name the server left off: the line still reads. */
export const NO_NAME = "Someone";

/** The notice's line, or null for a code with no copy (a newer server): nothing unworded is shown. */
export function partyNoticeText(notice: PartyNoticePayload): string | null {
  const copy = Object.hasOwn(PARTY_NOTICE_COPY, notice.code)
    ? PARTY_NOTICE_COPY[notice.code]
    : undefined;
  if (copy === undefined) return null;
  return copy.replace("{name}", notice.name?.trim() || NO_NAME);
}
