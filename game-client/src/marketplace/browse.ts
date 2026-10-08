/**
 * The Bazaar browse table's decisions (FS-8EGFA req 20–22, 27–29): paging, what a row's action
 * cell offers, how its price and type read, when the countdown next moves, and the sort and chip
 * toggles. Pure, so the page only wires them to state and the clock.
 */

import { ApiError } from "@/utils/apiError";
import { formatGold } from "./gold";
import {
  rowPrice,
  type ListingRow,
  type RowSort,
  type SortDirection,
  type SortKey,
} from "./rows";
import { msUntilTimeLeftChanges } from "./timeLeft";

// ── Paging ──────────────────────────────────────────────────────────────────

export interface BrowsePage<L> {
  listings: L[];
  nextCursor?: string;
}

export interface BrowseState<L> {
  /** Every row loaded so far, in the order the pages arrived. */
  rows: L[];
  /** Where the next page starts; absent on the last page. */
  nextCursor?: string;
  /** "failed" only when the first page failed: the table never half-renders. */
  phase: "loading" | "ready" | "failed";
  loadingMore: boolean;
  /** Why the first page failed. */
  error?: string;
  /** Why a later page failed; the rows already shown stay. */
  moreError?: string;
}

export type BrowseAction<L> =
  | { type: "reload" }
  | { type: "loaded"; page: BrowsePage<L> }
  | { type: "more" }
  | { type: "moreLoaded"; page: BrowsePage<L> }
  /** The first page read again (the posted-listing poll): merged in, later pages kept. */
  | { type: "refreshed"; page: BrowsePage<L> }
  | { type: "failed"; message: string };

export const INITIAL_BROWSE: BrowseState<never> = {
  rows: [],
  phase: "loading",
  loadingMore: false,
};

export function browseReducer<L extends { id: string }>(
  state: BrowseState<L>,
  action: BrowseAction<L>,
): BrowseState<L> {
  switch (action.type) {
    case "reload":
      return INITIAL_BROWSE;
    case "loaded":
      return {
        rows: action.page.listings,
        nextCursor: action.page.nextCursor,
        phase: "ready",
        loadingMore: false,
      };
    case "more":
      return { ...state, loadingMore: true, moreError: undefined };
    case "moreLoaded": {
      const seen = new Set(state.rows.map((r) => r.id));
      return {
        ...state,
        rows: [...state.rows, ...action.page.listings.filter((l) => !seen.has(l.id))],
        nextCursor: action.page.nextCursor,
        loadingMore: false,
      };
    }
    case "refreshed": {
      if (state.phase !== "ready") return browseReducer(state, { type: "loaded", page: action.page });
      // The re-read page's rows lead; every row already shown that it lacks stays, in order, so
      // the pages loaded after the first survive. The cursor is the one past the last row shown,
      // which is still where the next page starts.
      const fresh = new Set(action.page.listings.map((l) => l.id));
      return {
        ...state,
        rows: [...action.page.listings, ...state.rows.filter((r) => !fresh.has(r.id))],
      };
    }
    case "failed":
      return state.phase === "ready"
        ? { ...state, loadingMore: false, moreError: action.message }
        : { ...INITIAL_BROWSE, phase: "failed", error: action.message };
  }
}

/** "Show more" is offered while a next page exists and none is already on its way. */
export const canShowMore = (state: BrowseState<unknown>): boolean =>
  state.phase === "ready" && !!state.nextCursor && !state.loadingMore;

/** The 503 copy (req 29); also what a gateway that never answered shows. */
export const BROWSE_UNREACHABLE = "The Bazaar is unreachable — try again shortly.";
export const BROWSE_FAILED = "The Bazaar could not be read — try again.";

export function browseFailureMessage(err: unknown): string {
  if (!(err instanceof ApiError) || err.status === 503) return BROWSE_UNREACHABLE;
  return BROWSE_FAILED;
}

// ── Rows ────────────────────────────────────────────────────────────────────

/** Sign in, then come back to the Bazaar (req 28). */
export const SIGN_IN_TO_MARKETPLACE = "/login?redirect=%2Fmarketplace";

/**
 * What a row's action cell offers: "Your listing" to its seller (req 27), nothing to act on once
 * the auction has ended — by the server's word or by the countdown running out while shown, and
 * signed in or out, since there is nothing to sign in for — "Sign in to bid" when signed out
 * (req 28), and otherwise Bid.
 */
export type RowAction = "own" | "signIn" | "ended" | "bid";

export function rowAction(
  listing: { sellerId: string; endsAt: string; ended: boolean },
  viewer: { memberId: string | undefined },
  now: number,
): RowAction {
  if (viewer.memberId && viewer.memberId === listing.sellerId) return "own";
  if (listing.ended || Date.parse(listing.endsAt) <= now) return "ended";
  if (!viewer.memberId) return "signIn";
  return "bid";
}

/** The price cell: the current price, or the start price marked opening when nobody has bid. */
export function priceCell(
  row: Pick<ListingRow, "startPrice" | "currentPrice">,
): { gold: string; opening: boolean } {
  return {
    gold: formatGold(rowPrice(row)),
    opening: row.currentPrice === undefined,
  };
}

/** The Type column: a weapon's kind, an armour's slot, otherwise the item type. */
export function typeLabel(
  item: { itemType?: string; weaponType?: string; armorSlot?: string } | undefined,
): string {
  const word = (item?.weaponType || item?.armorSlot || item?.itemType || "").trim();
  return word ? word[0].toUpperCase() + word.slice(1) : "—";
}

/**
 * How long until any row's time left reads differently: the countdown re-renders then, and not
 * before. Null when every row has ended, so the clock stops.
 */
export function nextTickIn(endsAts: readonly string[], now: number): number | null {
  let soonest: number | null = null;
  for (const endsAt of endsAts) {
    const ms = msUntilTimeLeftChanges(endsAt, now);
    if (ms !== null && (soonest === null || ms < soonest)) soonest = ms;
  }
  return soonest;
}

// ── Sort and chips ──────────────────────────────────────────────────────────

/** The way a column sorts when first chosen: cheapest, soonest, rarest first. */
const FIRST_DIRECTION: Record<SortKey, SortDirection> = {
  price: "asc",
  timeLeft: "asc",
  rarity: "desc",
};

export function toggleSort(current: RowSort, key: SortKey): RowSort {
  if (current.key === key)
    return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  return { key, direction: FIRST_DIRECTION[key] };
}

export function ariaSort(
  sort: RowSort,
  key: SortKey,
): "ascending" | "descending" | "none" {
  if (sort.key !== key) return "none";
  return sort.direction === "asc" ? "ascending" : "descending";
}

export function toggleChip(active: readonly string[], value: string): string[] {
  return active.includes(value)
    ? active.filter((v) => v !== value)
    : [...active, value];
}

const KNOWN_TYPES = ["weapon", "armor", "consumable"];

/** The item-type chips: the three known types, then any other type among the loaded rows. */
export function typeChips(
  rows: readonly { item?: { itemType?: string } }[],
): string[] {
  const extra = new Set<string>();
  for (const row of rows) {
    const type = row.item?.itemType?.trim().toLowerCase();
    if (type && !KNOWN_TYPES.includes(type)) extra.add(type);
  }
  return [...KNOWN_TYPES, ...[...extra].sort()];
}
