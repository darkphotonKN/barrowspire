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

/**
 * The mark's plate (C9): its top below the card's and its height, the rings' radius, the room
 * left of the rings, between them and the words, and right of the words, in logical px. Its top
 * is the card's top band, its foot no lower than the name's box (14 below the card's top).
 */
export const PARTY_MARK = { top: 2, height: 12, ring: 2.5, padLeft: 4, gap: 4, padRight: 5 };

/** A point and a box, in logical px. */
export interface MarkRing {
  x: number;
  y: number;
  r: number;
}
export interface MarkRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where the mark's parts stand: the plate, the two linked rings' centres, the words' top left. */
export interface PartyMarkLayout {
  plate: MarkRect;
  rings: [MarkRing, MarkRing];
  text: { x: number; y: number };
}

/**
 * The mark on a card (C9; owner 2026-11-12: "無限符號跟in party文字 對齊一下中線 然後位置放在正中間"): the
 * plate centred across the card on a whole unit, in its top band; the rings and the words' ink on
 * the plate's midline. `words` is the words' width and how far below their box's top their ink is
 * middled (`inkMiddle`): a box centred on the line sets capitals above it, the descent being
 * empty.
 */
export function partyMarkLayout(
  card: { x: number; y: number; width: number },
  words: { width: number; inkMiddle: number },
): PartyMarkLayout {
  const { top, height, ring: r, padLeft, gap, padRight } = PARTY_MARK;
  const width = padLeft + r * 4 + gap + words.width + padRight;
  const x = Math.round(card.x + (card.width - width) / 2);
  const y = card.y + top;
  const mid = y + height / 2;
  return {
    plate: { x, y, width, height },
    rings: [
      { x: x + padLeft + r, y: mid, r },
      { x: x + padLeft + r * 3, y: mid, r },
    ],
    text: { x: x + padLeft + r * 4 + gap, y: mid - words.inkMiddle },
  };
}

/**
 * How far below a line of text's box top its ink is middled: the baseline (the font's `ascent`,
 * as Phaser draws a line) less half the ink above it plus half the ink below it. Where the ink
 * cannot be measured (`undefined`), the box's own middle.
 */
export function inkMiddle(
  ascent: number,
  ink: { ascent: number; descent: number } | undefined,
  boxHeight: number,
): number {
  if (!ink) return boxHeight / 2;
  return ascent + (ink.descent - ink.ascent) / 2;
}

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
