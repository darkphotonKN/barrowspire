/**
 * What the screen says of a floor's encounters (FS-4EC7Z §G R30, R31, R33): the over-head lines'
 * words, keyed on the server's line keys (§F R26); the encounters' refusals (§F R27) and the events
 * read off the state against the last broadcast as HUD notices in their tones. The words are the
 * client's. Pure, so the copy is tested and tuned without a canvas; the run scene shows what these
 * return. A first broadcast, and the first of each new floor, is the baseline and says nothing, as
 * `SealWatch` does.
 */

import type { EncounterNPCState } from "@/types/gameState";
import type { InteractReply } from "./floor";
import type { SealNotice } from "./sealLines";

/** Each over-head line, by its key (§G R30; `cutthroat_lore`, amended 2026-11-25). */
const LINES: Readonly<Record<string, string>> = {
  pilgrim_plea: "Please, they're coming!",
  pilgrim_thanks: "Bless you. Take this.",
  captive_plea: "The key! Find the key!",
  captive_freed: "We'll fight with you.",
  cutthroat_greet: "Well, well. Visitors.",
  cutthroat_turn: "Bad luck for you.",
  cutthroat_tip: "There's a door in the wall. Look there.",
  cutthroat_lore: "Nothing in these walls worth your while. Move on.",
  ally_ack: "Lead on.",
};

/** A line key's words over the NPC's head, or `null` for a key this client does not know: it says nothing. */
export function encounterLineText(key: string): string | null {
  return Object.hasOwn(LINES, key) ? LINES[key] : null;
}

/**
 * The encounters' refusal reasons (§F R27), each the HUD notice's, never a lore line; the contract's
 * top floor and no-room refusals are Take a Contract's (FS-X2CMM §J R57), and an already open cage
 * Pick the Lock's (R55), on the cast's reply.
 */
export const ENCOUNTER_REPLY_REASONS = [
  "cage_locked",
  "cage_open",
  "too_many_allies",
  "not_willing",
  "already_hired",
  "contract_taken",
  "contract_no_stairs",
  "contract_no_room",
] as const;

/**
 * Each refusal's words: the cage's is §G R31's; the rest are the client's own, for the reasons the
 * cage (a full party) and the hire and contract entry points (FS-X2CMM's pages) refuse with.
 */
const REPLY_LINES: Readonly<Record<(typeof ENCOUNTER_REPLY_REASONS)[number], string>> = {
  cage_locked: "Locked. Find the key.",
  cage_open: "The cage is already open.",
  too_many_allies: "Too many follow you already.",
  not_willing: "They will not follow you.",
  already_hired: "Already sworn to another.",
  contract_taken: "A contract is already taken this delve.",
  contract_no_stairs: "No contract can be taken on the top floor.",
  contract_no_room: "No mark can be set on this floor.",
};

/** The HUD notice an encounter refusal raises, or `null` for any other reply. */
export function encounterReplyNotice(reply: InteractReply): SealNotice | null {
  const reason = reply.reason;
  if (!reason || !Object.hasOwn(REPLY_LINES, reason)) return null;
  return { text: REPLY_LINES[reason as keyof typeof REPLY_LINES], tone: "refused" };
}

/** A broadcast as the watch reads it. */
interface Seen {
  floor?: number;
  encounter_npcs?: EncounterNPCState[];
  cage_key_carried?: boolean;
}

/**
 * A pilgrim as the watch last knew it: alive or dead in the state, or unknown, having left the state
 * alive (out of the party's interest: it may live or die unseen).
 */
type PilgrimFate = "alive" | "dead" | "unknown";

/** The floor's pilgrims as the watch has followed them. */
interface Pilgrims {
  /** Each pilgrim seen on the floor, by entity id: its fate as last known. */
  fates: Map<string, PilgrimFate>;
  /** A pilgrim gave their thanks: the wave was survived (§B R8). */
  thanked: boolean;
  /** The loss has been said. */
  lost: boolean;
}

const isPilgrim = (n: EncounterNPCState) => n.kind === "pilgrim";
/** Whether any pilgrim may still live: one alive, or one unknown. */
const mayLive = (fates: Map<string, PilgrimFate>) => [...fates.values()].some((f) => f !== "dead");

/**
 * The encounters' events, read off each broadcast against the one before: the cage key taken
 * (§G R31, `cage_key_carried` turning true) and the pilgrims lost (R33: the last living pilgrim dead
 * with no `pilgrim_thanks` said). A pilgrim that leaves the state alive (the party walked out of its
 * interest) is unknown, and the loss is not said while any is; one whose corpse has gone stays dead.
 */
export class EncounterWatch {
  private last?: { floor?: number; keyCarried: boolean };
  private pilgrims: Pilgrims = { fates: new Map(), thanked: false, lost: false };

  /** This broadcast's lines, in order. */
  see(state: Seen): SealNotice[] {
    const before = this.last;
    const keyCarried = state.cage_key_carried === true;
    this.last = { floor: state.floor, keyCarried };
    const first = !before || before.floor !== state.floor;
    if (first) this.pilgrims = { fates: new Map(), thanked: false, lost: false };
    const lostNow = this.followPilgrims(state.encounter_npcs ?? []);
    if (first) return [];

    const lines: SealNotice[] = [];
    if (!before.keyCarried && keyCarried) lines.push({ text: "The cage key.", tone: "waiting" });
    if (lostNow) lines.push({ text: "The pilgrims are lost.", tone: "refused" });
    return lines;
  }

  /** Forget the last broadcast: the next one is a first. */
  reset(): void {
    this.last = undefined;
  }

  /** Follows the pilgrims through this broadcast; whether they were lost on it. */
  private followPilgrims(npcs: readonly EncounterNPCState[]): boolean {
    const p = this.pilgrims;
    const livedBefore = mayLive(p.fates);
    const listed = npcs.filter(isPilgrim);
    const ids = new Set(listed.map((n) => n.entity_id));
    // gone alive: out of interest, unknown; gone dead: a corpse removed, still dead
    for (const [id, fate] of p.fates) if (!ids.has(id) && fate === "alive") p.fates.set(id, "unknown");
    for (const n of listed) {
      p.fates.set(n.entity_id, n.action === "dead" ? "dead" : "alive");
      if (n.line === "pilgrim_thanks") p.thanked = true;
    }
    const lost = livedBefore && p.fates.size > 0 && !mayLive(p.fates) && !p.thanked && !p.lost;
    if (lost) p.lost = true;
    return lost;
  }
}
