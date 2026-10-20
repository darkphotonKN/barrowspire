/**
 * The List-a-relic drawer's decisions (FS-8EGFA req 25, 29): which relics can be chosen, what a
 * start price and a duration become on the wire, when submit is allowed, and what a refusal says.
 * Pure, so the drawer only wires them to state.
 */

import { ApiError } from "@/utils/apiError";
import { BROWSE_UNREACHABLE } from "./browse";
import { formatCriticalRate } from "./detail";

// ── Copy (req 25, 29; Edge States) ──────────────────────────────────────────

export const POSTED = "Posted — your listing will appear in a moment.";
export const POSTED_LIVE = "Your listing is live.";
export const STILL_PROCESSING = "Still processing — refresh in a minute";
export const NOTHING_LISTED = "You have nothing listed.";
export const NOTHING_LISTABLE =
  "Every relic you hold is already listed — or you hold none yet.";
export const CANNOT_LIST =
  "That relic can't be listed right now — it may already be listed.";
export const END_TIME_PASSED = "That end time has already passed — check your clock";
export const LIST_FAILED = "That relic could not be listed — try again.";
/** FS-49Z37 req 2: the form's own check and the server's refusal read the same. */
export const BUYOUT_NOT_ABOVE_START = "The buyout price must be above the starting bid.";

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
 * sends it (FS-8EGFA req 11); an absent one is read as AVAILABLE, so an older server leaves every
 * relic choosable and the server stays the authority (a refusal answers 500, {@link CANNOT_LIST}).
 * A status the page does not know is never choosable.
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

const TAGS: Record<InstanceStatus, string | undefined> = {
  AVAILABLE: undefined,
  LISTED: "Listed",
  IN_ESCROW: "In escrow",
  PENDING_SETTLEMENT: "Settling",
  UNKNOWN: "Unavailable",
};

/** The `list-item-instances` fields the picker reads. The wire is snake_case. */
export interface PickerInstance {
  id?: string;
  name?: string;
  status?: string;
  weapon_type?: string;
  armor_slot?: string;
  attack_power?: number;
  critical_rate?: number;
  defense_rating?: number;
  magic_resistance?: number;
  healing_amount?: number;
  mana_amount?: number;
}

export interface PickerCard {
  id: string;
  name: string;
  selectable: boolean;
  /** "Listed", "In escrow" or "Unavailable" on a card that cannot be chosen. */
  tag?: string;
  /** The stats the relic has. No price: the picker chooses a relic, it does not sell one. */
  stats: { label: string; value: string }[];
  /** What the icon is drawn from. */
  icon: Pick<PickerInstance, "name" | "weapon_type" | "armor_slot" | "healing_amount" | "mana_amount">;
}

export function pickerCards(instances: readonly PickerInstance[]): PickerCard[] {
  return instances.flatMap((inst) => {
    if (!inst.id) return [];
    const status = instanceStatus(inst.status);
    return [
      {
        id: inst.id,
        name: inst.name?.trim() || "Unknown relic",
        selectable: status === "AVAILABLE",
        tag: TAGS[status],
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
    !!chosen?.selectable &&
    startPrice !== null &&
    buyoutField(form.buyoutText ?? "", startPrice).valid
  );
}

/**
 * What a refused `create-listing` says (req 29). A 500 is the items-side refusal: the relic is
 * already listed or otherwise held. A 400 is marketplace refusing the listing; the page sends a
 * chosen relic's id and checked prices, so the end time is the one fact it cannot vouch for, unless
 * what was sent carries a buyout price not above the start (FS-49Z37 req 2): the server answers
 * both with the same 400, so the prices sent tell them apart.
 */
export function createListingFailureMessage(
  err: unknown,
  sent?: { startPrice: number; buyoutPrice?: number },
): string {
  if (!(err instanceof ApiError) || err.status === 503) return BROWSE_UNREACHABLE;
  if (err.status === 500) return CANNOT_LIST;
  if (err.status === 400)
    return sent?.buyoutPrice !== undefined && sent.buyoutPrice <= sent.startPrice
      ? BUYOUT_NOT_ABOVE_START
      : END_TIME_PASSED;
  return LIST_FAILED;
}
