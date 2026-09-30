/**
 * Sorting and filtering the listing table (FS-8EGFA req 22).
 *
 * Both apply to the rows loaded so far, never to the server's full set. The row shape is
 * structural: only the fields the rules read, so a generated `Listing` satisfies it as-is.
 */

import { rarityOf } from "./rarity";

export interface ListingRow {
  startPrice: number;
  /** The leading bid's amount; absent when nobody leads. */
  currentPrice?: number;
  endsAt: string;
  /** Absent when items has no such instance ("Unknown relic"). */
  item?: { rarity?: string; itemType?: string };
}

export type SortKey = "price" | "timeLeft" | "rarity";
export type SortDirection = "asc" | "desc";
export interface RowSort {
  key: SortKey;
  direction: SortDirection;
}

/** The soonest-ending auctions first. */
export const DEFAULT_SORT: RowSort = { key: "timeLeft", direction: "asc" };

/** What a row is going for: the current price, or the opening price when nobody has bid. */
export const rowPrice = (
  row: Pick<ListingRow, "startPrice" | "currentPrice">,
): number =>
  row.currentPrice ?? row.startPrice;

const SORT_VALUE: Record<SortKey, (row: ListingRow) => number> = {
  price: rowPrice,
  timeLeft: (row) => Date.parse(row.endsAt),
  rarity: (row) => rarityOf(row.item?.rarity).rank,
};

/** A sorted copy. Rows that tie keep their loaded order in either direction. */
export function sortRows<R extends ListingRow>(
  rows: readonly R[],
  sort: RowSort,
): R[] {
  const value = SORT_VALUE[sort.key];
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => sign * (value(a) - value(b)));
}

export interface RowFilter {
  /** Server tier names (`normal` … `fabled`). None means every rarity. */
  rarities?: readonly string[];
  /** Item types (`weapon`, `armor`, `consumable`). None means every type. */
  types?: readonly string[];
}

/**
 * The rows every active chip admits. Chips of one kind widen (rare or fabled); the two kinds
 * narrow each other (rare and a weapon). A row with an unknown tier or no item matches only
 * while no chip of that kind is on.
 */
export function filterRows<R extends ListingRow>(
  rows: readonly R[],
  filter: RowFilter,
): R[] {
  const rarities = normalised(filter.rarities);
  const types = normalised(filter.types);
  return rows.filter(
    (row) =>
      admits(rarities, rarityOf(row.item?.rarity).tier) &&
      admits(types, row.item?.itemType?.trim().toLowerCase()),
  );
}

const normalised = (values: readonly string[] | undefined) =>
  new Set((values ?? []).map((v) => v.trim().toLowerCase()));

const admits = (chips: Set<string>, value: string | undefined) =>
  chips.size === 0 || (value !== undefined && chips.has(value));
