/**
 * The mailbox presenter (FS-1GZGD R35–R38, R40; D12, D14; S8): what the envelope's wax seal shows,
 * when it pulses, which letter opens first, and every word and slot the letter panel draws.
 * Phaser-free, so the copy and the rules are tested without a canvas; `MailboxEnvelope` and
 * `LetterPanel` draw what this returns. Vocabulary: game-client/CONTEXT.md § Mailbox terms. The
 * screen says letter, mailbox and Take, never "mail" or "claim"; the API's names stay as they are.
 */

import type { components } from "@/api/generated/schema";
import { itemIcon, type ItemIconName } from "@/render/art/itemIcons";
import { getItemType, type ItemState } from "@/types/gameState";

export type MailboxSummary = components["schemas"]["MailboxSummary"];
export type Letter = components["schemas"]["Letter"];
export type Enclosure = components["schemas"]["Enclosure"];
export type ItemSnapshot = components["schemas"]["ItemSnapshot"];
export type ClaimedLetter = components["schemas"]["ClaimedLetter"];

/** The right side of an empty mailbox (R40). */
export const EMPTY_MAILBOX = "No letters wait for you.";
/** A letter that expired under the player's hand (R39, Edge States). */
export const LETTER_CRUMBLED = "This letter has crumbled to dust.";
/** The letters could not be read: the gateway or notification-service is down. */
export const MAILBOX_UNREACHABLE =
  "The letters cannot be reached. Open the mailbox again.";

/** The Take button's words: pressable, then in flight (R39, A5). */
export const TAKE_LABEL = "Take";
export const TAKING_LABEL = "Taking…";
/** The wax stamp over a taken letter's dimmed slots (A5). */
export const TAKEN_STAMP = "Taken";
/** A Take refused for any reason but a full stash, an expired letter or one already taken (R39). */
export const SEAL_WOULD_NOT_BREAK = "The seal would not break. Try again.";

/** The warning a full stash shows: room for every item the letter holds (R39, D7). */
function stashNeeds(slots: number): string {
  return `Your stash needs ${slots} free ${slots === 1 ? "slot" : "slots"}`;
}

/** Who a letter is from, as the panel names them (R36). */
export function senderName(sender: Letter["sender"]): string {
  return sender === "official" ? "The Barrowspire Wardens" : "The Spire";
}

/** Days left at or under which the panel warns (R36). */
export const EXPIRY_WARNING_DAYS = 3;

export interface SealState {
  /** Lit while anything is unread or holds untaken enclosures; dark otherwise (D12). */
  lit: boolean;
  /** The number on the lit seal: the summary's `waitingCount` (S6). */
  count: number;
}

export function sealState(summary: MailboxSummary | null): SealState {
  const count = summary?.waitingCount ?? 0;
  return { lit: count > 0, count };
}

/**
 * The pulse rule (R35): the newest letter is newer than the last one this player saw. With
 * nothing seen (or an unreadable value) there is nothing to be newer than: the caller records
 * the value without pulsing.
 */
export function isNewerLetter(
  newest: string | undefined,
  lastSeen: string | null | undefined,
): boolean {
  if (!newest || !lastSeen) return false;
  const now = Date.parse(newest);
  const seen = Date.parse(lastSeen);
  if (Number.isNaN(now) || Number.isNaN(seen)) return false;
  return now > seen;
}

/** Enclosures still to be taken: a claim in progress counts as untaken (API surface, Letter). */
export function untaken(letter: Letter): boolean {
  return letter.claimState === "unclaimed" || letter.claimState === "claiming";
}

/** What `waitingCount` counts (S6): unread, or holding untaken enclosures. */
function waiting(letter: Letter): boolean {
  return !letter.read || untaken(letter);
}

/** The letter the panel opens on (R38): the first unread, else the newest; none when empty. */
export function initialLetter(letters: readonly Letter[]): string | null {
  return (letters.find((l) => !l.read) ?? letters[0])?.id ?? null;
}

const less = (n: number) => Math.max(0, n - 1);

/** The summary once `letter` is read, so the seal lowers at once without another fetch (R38). */
export function afterRead(
  summary: MailboxSummary,
  letter: Letter,
): MailboxSummary {
  if (letter.read) return summary;
  return {
    ...summary,
    unreadCount: less(summary.unreadCount),
    waitingCount: untaken(letter)
      ? summary.waitingCount
      : less(summary.waitingCount),
  };
}

/** The summary once `letter` has left the mailbox (it expired): it counts nowhere (R9). */
export function withoutLetter(
  summary: MailboxSummary,
  letter: Letter,
): MailboxSummary {
  return uncounted(summary, letter);
}

/**
 * The summary once `letter`'s enclosures are taken, so the seal lowers at once (R39). Taking also
 * reads the letter, so a taken letter counts nowhere, as one that left the mailbox does.
 */
export function afterTake(
  summary: MailboxSummary,
  letter: Letter,
): MailboxSummary {
  return uncounted(summary, letter);
}

/** `summary` with `letter` taken out of every count it is in. */
function uncounted(summary: MailboxSummary, letter: Letter): MailboxSummary {
  return {
    ...summary,
    unreadCount: letter.read ? summary.unreadCount : less(summary.unreadCount),
    unclaimedCount: untaken(letter)
      ? less(summary.unclaimedCount)
      : summary.unclaimedCount,
    waitingCount: waiting(letter)
      ? less(summary.waitingCount)
      : summary.waitingCount,
  };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long ago a letter was sent, as a list row says it (R36). */
export function relativeTime(sentAt: string, now: number): string {
  const ago = now - Date.parse(sentAt);
  if (!(ago >= MINUTE)) return "just now";
  if (ago < HOUR) return `${Math.floor(ago / MINUTE)}m ago`;
  if (ago < DAY) return `${Math.floor(ago / HOUR)}h ago`;
  return `${Math.floor(ago / DAY)}d ago`;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** The day a letter was sent, in the player's own time zone: "4 Nov 2026" (R36). */
export function sentDate(sentAt: string): string {
  const d = new Date(sentAt);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Whole days until a letter expires, any part of a day counting as one; never below 0. */
export function daysLeft(expiresAt: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / DAY));
}

/** The days-left line, in the warning tone at three days or fewer (R36). */
export function expiryLine(days: number): { text: string; warning: boolean } {
  return {
    text: `${days} ${days === 1 ? "day" : "days"} left`,
    warning: days <= EXPIRY_WARNING_DAYS,
  };
}

/** The stash slots a letter's items take: the sum of their quantities (R39). Gold takes none. */
function slotCount(letter: Letter): number {
  return letter.enclosures.reduce(
    (n, e) => (e.kind === "item" ? n + (e.quantity ?? 1) : n),
    0,
  );
}

/** What a Take's answer does to the open letter (R39; Edge States). */
export type TakeOutcome =
  /** Taken: its slots dim under the stamp and the button goes. */
  | { kind: "taken" }
  /** It expired: it leaves the list and the panel says it crumbled. */
  | { kind: "crumbled" }
  /** Nothing was taken: a warning line, and the button stays. */
  | { kind: "refused"; warning: string };

/**
 * A refused Take, by the gateway's error `code` (undefined for a failure that never reached it).
 * A letter already taken (another tab, a double press) is shown taken.
 */
export function takeOutcome(
  code: string | undefined,
  letter: Letter,
): TakeOutcome {
  switch (code) {
    case "LETTER_ALREADY_CLAIMED":
      return { kind: "taken" };
    case "LETTER_EXPIRED":
      return { kind: "crumbled" };
    case "STASH_FULL":
      return { kind: "refused", warning: stashNeeds(slotCount(letter)) };
    default:
      return { kind: "refused", warning: SEAL_WOULD_NOT_BREAK };
  }
}

/** One row of the letter list (R36). */
export interface LetterRow {
  id: string;
  title: string;
  time: string;
  /** Unread rows are bright with a lit seal dot; read rows dim. */
  unread: boolean;
  /** The enclosure glyph: lit while untaken, dim once taken, absent without enclosures. */
  glyph: "none" | "lit" | "dim";
}

export function letterRow(letter: Letter, now: number): LetterRow {
  return {
    id: letter.id,
    title: letter.title,
    time: relativeTime(letter.sentAt, now),
    unread: !letter.read,
    glyph:
      letter.enclosures.length === 0 ? "none" : untaken(letter) ? "lit" : "dim",
  };
}

/** One slot of the Enclosed row (R37, S8). */
export type EnclosureSlot =
  | {
      kind: "item";
      /** The snapshot in the run's item shape: the item tip is built from it (`itemView`). */
      item: ItemState;
      icon: ItemIconName;
      /** "x3" for a quantity above 1, empty otherwise. */
      quantity: string;
    }
  | { kind: "gold"; icon: "coins"; amount: string };

/** The open letter as the right side of the panel draws it (R36, R37). */
export interface LetterDetail {
  id: string;
  title: string;
  sender: string;
  sent: string;
  expiry: { text: string; warning: boolean };
  body: string;
  /** Empty on a letter without enclosures: the panel draws no Enclosed row. */
  enclosed: EnclosureSlot[];
  /**
   * The enclosures are still to be taken: the seam the Take button (I-1GZGD-7) reads. False on a
   * letter without enclosures.
   */
  untaken: boolean;
}

export function letterDetail(letter: Letter, now: number): LetterDetail {
  return {
    id: letter.id,
    title: letter.title,
    sender: senderName(letter.sender),
    sent: sentDate(letter.sentAt),
    expiry: expiryLine(daysLeft(letter.expiresAt, now)),
    body: letter.body,
    enclosed: letter.enclosures.flatMap(enclosureSlot),
    untaken: letter.enclosures.length > 0 && untaken(letter),
  };
}

function enclosureSlot(enclosure: Enclosure): EnclosureSlot[] {
  if (enclosure.kind === "gold")
    return [
      {
        kind: "gold",
        icon: "coins",
        amount: (enclosure.gold ?? 0).toLocaleString("en-US"),
      },
    ];
  if (!enclosure.item) return [];
  const item = snapshotItem(enclosure.item);
  const quantity = enclosure.quantity ?? 1;
  return [
    {
      kind: "item",
      item,
      // the bag's own rule (`satchelIcon`): the stats name the item's type where the snapshot does not
      icon: itemIcon({ ...item, item_type: getItemType(item) }),
      quantity: quantity > 1 ? `x${quantity}` : "",
    },
  ];
}

/**
 * A stored snapshot in the run's item shape, so the bag's icon rule and the item tip read it as
 * they read any item (A2). It has no instance yet: the claim mints one. Zero and empty fields are
 * left out, as the loadout's instances leave them (`instanceItem`).
 */
export function snapshotItem(snapshot: ItemSnapshot): ItemState {
  const item: ItemState = {
    item_id: snapshot.templateId,
    entity_id: "",
    name: snapshot.name,
    quantity: 1,
  };
  const optional: Partial<ItemState> = {
    item_type: snapshot.itemType,
    rarity: snapshot.rarity,
    item_level: snapshot.itemLevel,
    required_level: snapshot.requiredLevel,
    affixes: snapshot.affixes?.length ? snapshot.affixes : undefined,
    unique_effect: snapshot.uniqueEffectText,
    attack_power: snapshot.attackPower,
    critical_rate: snapshot.criticalRate,
    weapon_type: snapshot.weaponType,
    defense_rating: snapshot.defenseRating,
    magic_resistance: snapshot.magicResistance,
    armor_slot: snapshot.armorSlot,
    healing_amount: snapshot.healingAmount,
    mana_amount: snapshot.manaAmount,
    description: snapshot.description,
  };
  for (const [key, value] of Object.entries(optional))
    if (value) Object.assign(item, { [key]: value });
  return item;
}

/** The Take button, the Taken stamp and a refusal's warning line, as the open letter draws them. */
export interface TakeView {
  /** Null once taken, and on a letter without enclosures. */
  button: { label: string; enabled: boolean } | null;
  /** The "Taken" wax stamp over the dimmed slots. */
  stamp: boolean;
  /** The last refusal's line (a full stash, a seal that would not break), shown over the button. */
  warning: string | null;
}

/**
 * The Take controls for the open letter (R39): "Take" while its enclosures are untaken,
 * "Taking…" and not pressable while its claim is in flight, and the stamp once taken. `taking`
 * is the letter whose claim is in flight, if any: one take at a time per panel, so while another
 * letter's is, this one's Take cannot be pressed either.
 */
export function takeView(
  detail: Pick<LetterDetail, "id" | "enclosed" | "untaken">,
  taking: string | null,
  warning: string | null,
): TakeView {
  if (detail.enclosed.length === 0)
    return { button: null, stamp: false, warning: null };
  if (!detail.untaken) return { button: null, stamp: true, warning: null };
  return {
    button:
      taking === detail.id
        ? { label: TAKING_LABEL, enabled: false }
        : { label: TAKE_LABEL, enabled: taking === null },
    stamp: false,
    warning,
  };
}
