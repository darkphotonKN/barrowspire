/**
 * What the screen says of a sealed floor (FS-5FZ4J §J R53): HUD notices in their tones, the
 * words the client's. Pure, so the copy is tested and tuned without a canvas; the run scene shows
 * what these return through its HUD notice.
 *
 * Two sources: the interact replies with the seal's reasons (§I R49), and the events read off the
 * state against the previous broadcast (§I R48), a first broadcast being the baseline (a connect,
 * a reconnect, a new floor) that says nothing but an arrival's seal.
 */

import type { SealState } from "@/types/gameState";
import type { InteractReply, NoticeTone } from "./floor";

/** One line on the HUD notice. */
export interface SealNotice {
  text: string;
  tone: NoticeTone;
}

/** The seals' names on screen (CONTEXT.md "Seal"). */
const SEAL_NAMES: Record<string, string> = {
  lever_order: "Lever Order",
  weighted_plates: "Weighted Plates",
  hidden_key: "The Hidden Key",
  chasm: "The Chasm",
  braziers: "Braziers",
};

/** Words of a wire name, each capitalised: `sunken_bell` reads "Sunken Bell". */
const titled = (name: string) =>
  name
    .split("_")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");

/** A seal's kind as the screen names it; a kind this client does not know, by its own words. */
export function sealKindName(kind: string): string {
  return SEAL_NAMES[kind] ?? titled(kind);
}

/** The interact replies' reasons on a sealed floor that the HUD notice speaks for (§I R49). */
export const SEAL_REPLY_REASONS = ["stairs_sealed", "gate_sealed", "lever_down", "lever_wrong", "mural", "shrine", "door_open"] as const;

/** A lore shrine's three lines (R53), said in turn. */
export const SHRINE_LINES = [
  "Names cut small, and scratched out. The Spire keeps no dead but its own.",
  "A candle no hand lit. Something here still tends the climb.",
  "Whoever knelt here climbed on. No stone says they came down.",
] as const;

const REPLY_NOTICES: Record<(typeof SEAL_REPLY_REASONS)[number], (reply: InteractReply, seal: SealState | undefined, pick: number) => SealNotice | null> = {
  stairs_sealed: (_, seal) => heldBy(seal),
  gate_sealed: (_, seal) => heldBy(seal),
  // a lever already down: E did nothing, and nothing is said
  lever_down: () => null,
  lever_wrong: () => ({ text: "Wrong. The levers spring back.", tone: "refused" }),
  mural: (reply) => {
    const glyphs = reply.glyphs ?? [];
    return glyphs.length ? { text: `The mural shows: ${glyphs.map(titled).join(", ")}.`, tone: "waiting" } : null;
  },
  shrine: (_, __, pick) => ({ text: SHRINE_LINES[((pick % 3) + 3) % 3], tone: "waiting" }),
  // a secret door already open: E did nothing, and nothing is said (FS-5FZ4J §F R38)
  door_open: () => null,
};

/** "Sealed. Lever Order holds it.", or plain "Sealed." with no seal in sight. */
function heldBy(seal: SealState | undefined): SealNotice {
  return { text: seal ? `Sealed. ${sealKindName(seal.kind)} holds it.` : "Sealed.", tone: "refused" };
}

/**
 * The notice an interact reply with one of the seal's reasons raises, or `null`: for a reason
 * that says nothing, and for any reply that is not the seal's. `seal` is the last state's, which
 * names the kind; `pick` turns the shrine's line.
 */
export function sealReplyNotice(reply: InteractReply, seal: SealState | undefined, pick: number): SealNotice | null {
  const reason = reply.reason as (typeof SEAL_REPLY_REASONS)[number] | undefined;
  if (!reason || !Object.hasOwn(REPLY_NOTICES, reason)) return null;
  return REPLY_NOTICES[reason](reply, seal, pick);
}

/** Arriving on a floor: its seal named, or nothing on a floor with none. */
function arrived(seal: SealState | undefined): SealNotice[] {
  return seal ? [{ text: `The stairs are sealed: ${sealKindName(seal.kind)}.`, tone: "waiting" }] : [];
}

/**
 * The seal's reply lines as a run says them (§J R53): {@link sealReplyNotice}'s, the lore shrine's
 * line turning with each shrine read this run.
 */
export class SealReplies {
  private shrineReads = 0;

  /** The notice for `reply`, or `null`; `seal` is the last state's, which names the kind. */
  notice(reply: InteractReply, seal: SealState | undefined): SealNotice | null {
    const notice = sealReplyNotice(reply, seal, this.shrineReads);
    if (reply.reason === "shrine") this.shrineReads++;
    return notice;
  }
}

/** A broadcast as the watch reads it. */
interface Seen {
  floor?: number;
  seal?: SealState;
}

/**
 * The seal's events, read off each broadcast against the one before (§I R48): arriving on a
 * sealed floor, a stage rising, the seal broken, the key taken, a Braziers window ending unbroken.
 * The first broadcast it sees, and the first of each new floor, is the baseline: arriving on a
 * floor says its seal, and nothing else of the floor's past is said. A first broadcast says the
 * seal only when it is an arrival's (floor 1 of a fresh run, FS-PQ2TW R8); a return's (a
 * reconnect) says nothing.
 */
export class SealWatch {
  private last?: Seen;

  /** This broadcast's lines, in order; `arrival` when it is the first broadcast of an arrival. */
  see(state: Seen, arrival = false): SealNotice[] {
    const before = this.last;
    this.last = { floor: state.floor, seal: state.seal && { ...state.seal } };
    const now = state.seal;
    if (!before) return arrival ? arrived(now) : [];
    if (before.floor !== state.floor) return arrived(now);
    const was = before.seal;
    if (!was || !now) return [];

    const lines: SealNotice[] = [];
    const broke = !was.broken && now.broken;
    const rose = now.stage > was.stage;
    if (broke) lines.push({ text: "The seal breaks.", tone: "done" });
    else if (rose) lines.push({ text: "The first seal breaks. Another holds.", tone: "done" });
    if (!was.key_carried && now.key_carried) lines.push({ text: "The stair key. Now the gate.", tone: "waiting" });
    if (was.window_ends_in !== undefined && now.window_ends_in === undefined && !broke && !rose)
      lines.push({ text: "The braziers gutter out.", tone: "refused" });
    return lines;
  }

  /** Forget the last broadcast: the next one is a first. */
  reset(): void {
    this.last = undefined;
  }
}
