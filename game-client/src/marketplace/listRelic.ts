/**
 * The List-a-relic drawer's decisions (FS-8EGFA req 25, 29; FS-3R77D): which relics are offered,
 * what a start price and a duration become on the wire, when submit is allowed, and what a refusal
 * says. Pure, so the drawer only wires them to state.
 */

import { ApiError } from "@/utils/apiError";
import { BROWSE_UNREACHABLE } from "./browse";
import { formatCriticalRate } from "./detail";
import { EMAIL_UNVERIFIED, VERIFY_TO_LIST } from "./emailGate";

// ── Copy (req 25, 29; Edge States) ──────────────────────────────────────────

export const POSTED = "Posted — your listing will appear in a moment.";
export const POSTED_LIVE = "Your listing is live.";
export const STILL_PROCESSING = "Still processing — refresh in a minute";
export const NOTHING_LISTED = "You have nothing listed.";
/** FS-3R77D R14: the stash holds nothing that can be listed right now. */
export const NOTHING_LISTABLE =
  "Nothing in your stash to list. Move a relic into your stash in town.";
export const CANNOT_LIST =
  "That relic can't be listed right now — it may already be listed.";
export const END_TIME_PASSED = "That end time has already passed — check your clock";
export const LIST_FAILED = "That relic could not be listed — try again.";
/** FS-HBXZN R17: items-service refused a relic the member is wearing. */
export const WORN_CANNOT_LIST = "Take it off first — worn relics can't be listed.";
/** FS-3R77D R15: items-service refused a relic that is not in the stash (ADR-0065). */
export const NOT_IN_STASH_CANNOT_LIST =
  "Only relics in your stash can be listed. Move it into your stash in town.";
/** FS-49Z37 req 2: the form's own check and the server's refusal read the same. */
export const BUYOUT_NOT_ABOVE_START = "The buyout price must be above the starting bid.";
/** FS-XEDFF Req 12: marketplace refused an end less than 1 hour or more than 7 days away. */
export const LISTING_DURATION_OUT_OF_RANGE_COPY = "A listing must last between 1 hour and 7 days.";
/** FS-XEDFF Req 12: items-service refused a seller who already has 20 relics for sale. */
export const LISTING_LIMIT_REACHED_COPY =
  "You already have 20 relics for sale. Wait for one to end, or withdraw one.";

// ── Duration ────────────────────────────────────────────────────────────────

const HOUR = 60 * 60 * 1000;

export const DURATIONS = [
  { id: "1h", label: "1 hour", ms: HOUR },
  { id: "12h", label: "12 hours", ms: 12 * HOUR },
  { id: "24h", label: "24 hours", ms: 24 * HOUR },
  { id: "3d", label: "3 days", ms: 72 * HOUR },
] as const;

export type DurationId = (typeof DURATIONS)[number]["id"];

/**
 * The auction's end, computed from the local clock. A clock far enough behind the server's makes
 * this already past; the server refuses it, and {@link END_TIME_PASSED} says why.
 */
export function endsAtFor(duration: DurationId, now: number): string {
  const { ms } = DURATIONS.find((d) => d.id === duration)!;
  return new Date(now + ms).toISOString();
}

// ── Start price ─────────────────────────────────────────────────────────────

/** A whole number of gold, 1 or more; null for anything else. */
export function parseStartPrice(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const gold = Number(trimmed);
  return gold >= 1 && Number.isSafeInteger(gold) ? gold : null;
}

// ── Buyout price (FS-49Z37 req 1–2) ────────────────────────────────────────

export type BuyoutField =
  | { valid: true; buyoutPrice: number | undefined }
  | { valid: false; error?: string };

/**
 * The optional buyout price. Empty is a plain auction: valid, and nothing is sent. Filled, it
 * must be a whole amount above the start price. While the start price is not valid yet there is
 * nothing to compare against, so it is not valid and says nothing; the start field speaks.
 */
export function buyoutField(text: string, startPrice: number | null): BuyoutField {
  if (text.trim() === "") return { valid: true, buyoutPrice: undefined };
  if (startPrice === null) return { valid: false };
  const gold = parseStartPrice(text);
  return gold !== null && gold > startPrice
    ? { valid: true, buyoutPrice: gold }
    : { valid: false, error: BUYOUT_NOT_ABOVE_START };
}

// ── Picker ──────────────────────────────────────────────────────────────────

export type InstanceStatus =
  | "AVAILABLE"
  | "LISTED"
  | "IN_ESCROW"
  | "PENDING_SETTLEMENT"
  | "UNKNOWN";

/**
 * An instance's status. The generated type marks `status` optional, though the server always
 * sends it (FS-8EGFA req 11); an absent one is read as AVAILABLE, so an older server still offers
 * the relic and the server stays the authority (it refuses with ITEM_NOT_AVAILABLE,
 * {@link CANNOT_LIST}).
 * A status the page does not know is never offered.
 */
export function instanceStatus(status: string | undefined): InstanceStatus {
  if (status === undefined) return "AVAILABLE";
  const upper = status.toUpperCase();
  return upper === "AVAILABLE" ||
    upper === "LISTED" ||
    upper === "IN_ESCROW" ||
    upper === "PENDING_SETTLEMENT"
    ? upper
    : "UNKNOWN";
}

/** The `list-item-instances` fields the picker reads. The wire is snake_case. */
export interface PickerInstance {
  id?: string;
  name?: string;
  status?: string;
  /** "bag" or "stash"; only a stash relic can be listed (FS-3R77D R10, ADR-0065). */
  location?: string;
  weapon_type?: string;
  armor_slot?: string;
  attack_power?: number;
  critical_rate?: number;
  defense_rating?: number;
  magic_resistance?: number;
  healing_amount?: number;
  mana_amount?: number;
}

/** A relic the member can list right now; every card can be chosen (FS-3R77D R11). */
export interface PickerCard {
  id: string;
  name: string;
  /** The stats the relic has. No price: the picker chooses a relic, it does not sell one. */
  stats: { label: string; value: string }[];
  /** What the icon is drawn from. */
  icon: Pick<PickerInstance, "name" | "weapon_type" | "armor_slot" | "healing_amount" | "mana_amount">;
}

/**
 * One card per relic the member can list right now (FS-3R77D R10–R12): it has an id, it is in the
 * stash, its status reads AVAILABLE, and it is not in `worn`, the ids in the member's loadout.
 * Anything else gets no card and no mark (R11). An absent location is not the stash (R12). A
 * loadout that could not be read leaves `worn` empty (FS-HBXZN R16); the server stays the
 * authority.
 */
export function pickerCards(
  instances: readonly PickerInstance[],
  worn: ReadonlySet<string> = new Set(),
): PickerCard[] {
  return instances.flatMap((inst) => {
    if (!inst.id || !listable(inst, worn)) return [];
    return [
      {
        id: inst.id,
        name: inst.name?.trim() || "Unknown relic",
        stats: statsOf(inst),
        icon: {
          name: inst.name,
          weapon_type: inst.weapon_type,
          armor_slot: inst.armor_slot,
          healing_amount: inst.healing_amount,
          mana_amount: inst.mana_amount,
        },
      },
    ];
  });
}

function listable(inst: PickerInstance, worn: ReadonlySet<string>): boolean {
  return (
    inst.location?.toLowerCase() === "stash" &&
    instanceStatus(inst.status) === "AVAILABLE" &&
    !worn.has(inst.id ?? "")
  );
}

function statsOf(inst: PickerInstance): { label: string; value: string }[] {
  const stats: { label: string; value: string }[] = [];
  const add = (
    label: string,
    value: number | undefined,
    show: (v: number) => string = String,
  ) => {
    if (value) stats.push({ label, value: show(value) });
  };
  add("Attack", inst.attack_power);
  add("Crit", inst.critical_rate, formatCriticalRate);
  add("Defense", inst.defense_rating);
  add("Resist", inst.magic_resistance);
  add("Heal", inst.healing_amount);
  add("Mana", inst.mana_amount);
  return stats;
}

// ── Submit ──────────────────────────────────────────────────────────────────

export function canSubmitListing(form: {
  cards: readonly PickerCard[];
  selectedId: string | undefined;
  priceText: string;
  /** The optional buyout price; absent or empty is none. */
  buyoutText?: string;
  submitting: boolean;
}): boolean {
  if (form.submitting) return false;
  const chosen = form.cards.find((c) => c.id === form.selectedId);
  const startPrice = parseStartPrice(form.priceText);
  return (
    !!chosen &&
    startPrice !== null &&
    buyoutField(form.buyoutText ?? "", startPrice).valid
  );
}

/**
 * A create-listing refusal named by its code, read before the status so the price reading never
 * mistakes it: the email-verified gate (FS-V6SFK R38), and items-service refusing the relic itself,
 * worn or already held (FS-HBXZN R17), or not in the stash (FS-3R77D R15).
 */
const REFUSAL_COPY: Record<string, string> = {
  [EMAIL_UNVERIFIED]: VERIFY_TO_LIST,
  ITEM_WORN: WORN_CANNOT_LIST,
  ITEM_NOT_AVAILABLE: CANNOT_LIST,
  ITEM_NOT_IN_STASH: NOT_IN_STASH_CANNOT_LIST,
  LISTING_DURATION_OUT_OF_RANGE: LISTING_DURATION_OUT_OF_RANGE_COPY,
  LISTING_LIMIT_REACHED: LISTING_LIMIT_REACHED_COPY,
};

/**
 * What a refused `create-listing` says (req 29). A refusal with a code reads its own copy
 * ({@link REFUSAL_COPY}). A 404 is a relic that is not the member's, a stale page, and reads as
 * one that cannot be listed. Any other 400 is marketplace refusing the listing's terms; the page
 * sends a chosen relic's id and checked prices, so the end time is the one fact it cannot vouch
 * for, unless what was sent carries a buyout price not above the start (FS-49Z37 req 2): the
 * server answers both with the same 400, so the prices sent tell them apart. A 500 is a real
 * failure, not a refusal.
 */
export function createListingFailureMessage(
  err: unknown,
  sent?: { startPrice: number; buyoutPrice?: number },
): string {
  if (!(err instanceof ApiError) || err.status === 503) return BROWSE_UNREACHABLE;
  const named = REFUSAL_COPY[err.code];
  if (named) return named;
  if (err.status === 404) return CANNOT_LIST;
  if (err.status === 400)
    return sent?.buyoutPrice !== undefined && sent.buyoutPrice <= sent.startPrice
      ? BUYOUT_NOT_ABOVE_START
      : END_TIME_PASSED;
  return LIST_FAILED;
}
