/**
 * What the world says inside the Spire (FS-XWHZP §D R16-R18): every Spire world message as a lore
 * line, its words the client's, keyed on the event or on the reply's reason, never on the server's
 * free text where a key exists. One table, pure, so the copy is tested and tuned without a canvas;
 * the run scene plays what these return through its lore lines (`loreLine.ts`).
 *
 * Interface messages (equip, the bag, the network) are not here: they stay HUD notices (R20).
 */

import { lootRefusalCopy } from "@/scenes/fieldRefusals";
import type { InteractReply } from "./floor";
import type { LoreLine } from "./loreLine";

/** The reason the server gives when the stairs refuse a party that has not gathered (FS-F6F88 req 22). */
export const PARTY_NOT_GATHERED = "party_not_gathered";

/** "The stair waits. 2 of your party are not yet with you." (FS-F6F88 req 31) */
function gatherLine(missing?: number): string {
  if (missing === undefined || missing < 1) return "The stair waits for the whole party.";
  const verb = missing === 1 ? "is" : "are";
  return `The stair waits. ${missing} of your party ${verb} not yet with you.`;
}

/**
 * The interact replies with a reason, and what each says (R16), or `null` for one that says
 * nothing. The stair's wait is worked out from the reply's `missing`.
 */
const REPLY_LINES: Record<string, ((reply: InteractReply) => LoreLine) | null> = {
  [PARTY_NOT_GATHERED]: (reply) => ({ text: gatherLine(reply.missing), tone: "lore" }),
  // the monsters around the chest say why (FS-KE075 §J R60)
  container_guarded: () => ({ text: "It will not open.", tone: "lore" }),
  // the field's words for the same reason (FS-X2F2H)
  loot_reserved: () => ({ text: lootRefusalCopy("loot_reserved") ?? "", tone: "lore" }),
  // FS-3103M R13, R16, R19 (Amendment A1): the tome and the altar
  tome_taken: () => ({ text: "Wonder if I can burn it.", tone: "lore" }),
  altar_without_tome: () => ({ text: "A tome was burned here once, they say, to insult a demon.", tone: "lore" }),
  altar_burned: null,
};

/**
 * The lore line an in-run `interact` reply raises (R16-R18), or `null`. A reason the table knows
 * is written by the client; any other reply that carries words is the world's and keeps the
 * server's words, as `lore`, until it has a reason (R17); the empty frame that follows every
 * reply says nothing (R18).
 */
export function loreForReply(reply: InteractReply): LoreLine | null {
  if (reply.reason && Object.hasOwn(REPLY_LINES, reply.reason)) return REPLY_LINES[reply.reason]?.(reply) ?? null;
  return reply.message ? { text: reply.message, tone: "lore" } : null;
}

/** The lore line a refused Fall raises (FS-9K8EZ req 4): the server's words, or the barrow's own. */
export function loreForFall(message: string | undefined): LoreLine {
  return { text: message || "The barrow will not take you yet.", tone: "lore" };
}

/**
 * What happens in the world that a line is said for (R16): the switch thrown, the server's
 * `exit_door_unlocked` one-shot, the escape door opening, a player escaping (`self` when it is the
 * player themself), and the altar's burn heard (FS-3103M R26).
 */
export type LoreEvent =
  | { kind: "switch_thrown" }
  | { kind: "exit_door_unlocked" }
  | { kind: "door_opened" }
  | { kind: "escaped"; name: string; self: boolean }
  | { kind: "burn_heard" };

/** The lore line an event raises (R16). The switch and the one-shot name one event: one line. */
export function loreForEvent(event: LoreEvent): LoreLine {
  switch (event.kind) {
    case "switch_thrown":
    case "exit_door_unlocked":
      return { text: "The seal breaks. Somewhere, a door gives.", tone: "hope" };
    case "door_opened":
      return { text: "The way out stands open.", tone: "hope" };
    case "escaped":
      return { text: event.self ? "You walk out of the dark." : `${event.name} walks out of the dark.`, tone: "hope" };
    case "burn_heard":
      return { text: "You hear a sound from hell", tone: "dread" };
  }
}

/**
 * Whether a broadcast flag turned on (R22): false on the previous broadcast, true on this one.
 * With no previous broadcast (`undefined`: after a connect, a reconnect, a restart, on a new
 * floor) this one is the baseline and says nothing (R23). The switch's `is_activated`, the escape
 * door's `is_open`, the altar's `burned`.
 */
export function turnedOn(previous: boolean | undefined, incoming: boolean): boolean {
  return previous === false && incoming;
}

/** A player as the escape check reads them off a broadcast. */
export interface EscapingPlayer {
  id: string;
  username: string;
  escape?: boolean;
}

/**
 * The players who have escaped since the last broadcast, each said once a run (R24), and every
 * player said so far. With nothing said yet (`undefined`: the first broadcast) every player
 * already out is seeded as said and none is named (R23).
 */
export function newlyEscaped(
  said: ReadonlySet<string> | undefined,
  players: readonly EscapingPlayer[],
): { said: Set<string>; escaped: { id: string; name: string }[] } {
  const next = new Set(said);
  const escaped: { id: string; name: string }[] = [];
  for (const p of players) {
    if (!p.id || p.escape !== true || next.has(p.id)) continue;
    next.add(p.id);
    if (said) escaped.push({ id: p.id, name: p.username });
  }
  return { said: next, escaped };
}
