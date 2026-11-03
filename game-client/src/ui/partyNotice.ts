/**
 * The words for every `party_notice` (FS-R82NV R36, FS-NCC9J R29, FS-BJNYC R22). The server sends a
 * code and, when the notice is about another player, their name (about several, their names); the
 * client owns the copy, in the lore voice.
 * Each notice lands in the chat window as a system line (R31).
 */

import type { PartyNoticePayload } from "@/stores/partyStore";

/**
 * R36's table with FS-NCC9J R29's and FS-BJNYC's codes; `{name}` is the player the notice concerns,
 * `{names}` the players it concerns, and `{is}` agrees with how many they are. `pod_full`
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
  in_run: "{name} is in a delve.",
  // party_enter's own refusals (FS-BJNYC R5, §Copy); its others are not_member, not_leader,
  // locked and unavailable above, in their existing words
  checking: "Your party is already being asked.",
  // the gate refusal's words
  not_at_gate: "Walk to the Spire's door first.",
  // every member not in the town, in join order
  not_in_town: "{names} {is} not in the town.",
  // a party of just its leader may not enter (FS-BJNYC R5, amended 2026-11-02)
  too_few: "Your party needs at least two players.",
};

/**
 * The party_notice codes that answer a party_enter by refusing it (FS-BJNYC R5), `too_few` (a party
 * of just its leader) included. not_member, not_leader, locked and unavailable also answer other
 * party actions; they are taken as the answer only while a party_enter is unanswered, and a second
 * press is refused `checking` if a check is open.
 */
export const PARTY_ENTER_REFUSALS: ReadonlySet<string> = new Set([
  "not_member",
  "not_leader",
  "locked",
  "checking",
  "not_at_gate",
  "not_in_town",
  "unavailable",
  "too_few",
]);

/**
 * The door's own words for a refused party_enter (FS-BJNYC R22, §Copy door rows), where the chat's
 * would misread: `not_member` and `not_leader` are shared codes worded for invites, kicks and
 * transfers, and at the door the one in no party is the player who pressed.
 */
const PARTY_ENTER_DOOR_COPY: Readonly<Record<string, string>> = {
  not_member: "Form a party first.",
  not_leader: "Only your leader can lead the party in.",
};

/**
 * What the Spire's door says when it refuses Enter as a party: its own words where §Copy gives
 * them, every other code in the chat's words; null for a code with no words at all.
 */
export function partyEnterDoorText(notice: PartyNoticePayload): string | null {
  return Object.hasOwn(PARTY_ENTER_DOOR_COPY, notice.code)
    ? PARTY_ENTER_DOOR_COPY[notice.code]
    : partyNoticeText(notice);
}

/** Stands in for a name the server left off: the line still reads. */
export const NO_NAME = "Someone";

/** The notice's line, or null for a code with no copy (a newer server): nothing unworded is shown. */
export function partyNoticeText(notice: PartyNoticePayload): string | null {
  const copy = Object.hasOwn(PARTY_NOTICE_COPY, notice.code)
    ? PARTY_NOTICE_COPY[notice.code]
    : undefined;
  if (copy === undefined) return null;
  return fill(copy, notice.names ?? []).replace(
    "{name}",
    notice.name?.trim() || NO_NAME,
  );
}

/**
 * Why a ready check was cancelled (FS-BJNYC R10, §Copy), by the `reason` on its
 * `party_ready_check`; `{names}` are the players it names, in join order. `failed` reads one way
 * with a name (their gear) and another without (the run itself).
 */
export const READY_CHECK_CANCEL_COPY: Readonly<Record<string, string>> = {
  declined: "{names} declined. The party stays.",
  timeout: "{names} did not answer. The party stays.",
  left: "{names} left the town. The party stays.",
  disconnected: "{names} {is} gone. The party stays.",
  changed: "The party changed. Ask again.",
  failed: "{names}'s gear could not be read. Ask again.",
};

/** `failed` with nobody named: the run could not be built, or the party could not be read. */
const READY_CHECK_SHUT = "The way is shut for now. Ask again.";

/** The cancelled check's line, or null for a reason with no copy: nothing unworded is shown. */
export function readyCheckCancelText(
  reason: string | undefined,
  names: readonly string[],
): string | null {
  if (reason === undefined || !Object.hasOwn(READY_CHECK_CANCEL_COPY, reason))
    return null;
  if (reason === "failed" && said(names).length === 0) return READY_CHECK_SHUT;
  return fill(READY_CHECK_CANCEL_COPY[reason], names);
}

/** A line's `{names}`, and `{is}` agreeing with how many they are. */
function fill(copy: string, names: readonly string[]): string {
  const sayable = said(names);
  return copy
    .replace("{names}", joinNames(sayable))
    .replace("{is}", sayable.length > 1 ? "are" : "is");
}

/** The names that can be said: trimmed, blanks dropped. */
function said(names: readonly string[]): string[] {
  return names.map((n) => n.trim()).filter((n) => n !== "");
}

/** Names as a line says them: "Wren", "Wren and Mira", "Wren, Mira and Tobin"; NO_NAME for none. */
export function joinNames(names: readonly string[]): string {
  const sayable = said(names);
  if (sayable.length === 0) return NO_NAME;
  if (sayable.length === 1) return sayable[0];
  return `${sayable.slice(0, -1).join(", ")} and ${sayable[sayable.length - 1]}`;
}
