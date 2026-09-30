"use client";

import Link from "next/link";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/20/solid";
import ListingDetailDialog from "@/components/bazaar/ListingDetailDialog";
import {
  CELL,
  ItemCell,
  LESSER,
  NUMERIC,
  OpenableRow,
  PriceCell,
  SkeletonRow,
  type SkeletonCell,
} from "@/components/bazaar/cells";
import { useListingDetail } from "@/components/bazaar/useListingDetail";
import {
  SIGN_IN_TO_MARKETPLACE,
  ariaSort,
  priceCell,
  rowAction,
  typeLabel,
} from "@/marketplace/browse";
import type { Listing } from "@/marketplace/listing";
import type { RowSort, SortKey } from "@/marketplace/rows";
import { formatTimeLeft } from "@/marketplace/timeLeft";

const SKELETON_ROWS = 5;
// Type and bids are the lesser columns.
const SKELETON: readonly SkeletonCell[] = [
  { cell: `${CELL} ${LESSER}`, bar: "h-4 w-16" },
  { cell: NUMERIC, bar: "ml-auto h-4 w-14" },
  { cell: `${NUMERIC} ${LESSER}`, bar: "ml-auto h-4 w-6" },
  { cell: NUMERIC, bar: "ml-auto h-4 w-14" },
  { cell: CELL, bar: "ml-auto h-10 w-16" },
];

/**
 * The Bazaar's listing table (FS-8EGFA req 22, 27, 28; design guideline Part II "Listing
 * table"). It renders the rows it is given, already filtered and sorted; the headers ask for a
 * different sort. A row opens the listing detail (req 24): click it, press Enter on it, or press
 * its Bid. Closing the detail puts focus back on the row.
 */
export default function ListingTable({
  rows,
  loading,
  sort,
  onSort,
  memberId,
  now,
}: {
  rows: Listing[];
  loading: boolean;
  sort: RowSort;
  onSort: (key: SortKey) => void;
  memberId: string | undefined;
  now: number;
}) {
  const detail = useListingDetail(rows);

  return (
    <div className="overflow-hidden rounded-[10px] border border-[color:var(--color-border)] bg-card shadow-[var(--shadow-card)]">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">
          Relics up for auction. Column headers with buttons change the sort.
        </caption>
        <thead className="text-[11px] uppercase tracking-[0.15em] text-vellum-dim">
          <tr className="border-b border-[color:var(--color-border-strong)]">
            <SortHeader label="Item" hint="by rarity" sortKey="rarity" sort={sort} onSort={onSort} />
            <th scope="col" className={`${CELL} ${LESSER}`}>Type</th>
            <SortHeader label="Price" sortKey="price" sort={sort} onSort={onSort} numeric />
            <th scope="col" className={`${NUMERIC} ${LESSER}`}>Bids</th>
            <SortHeader label="Time left" sortKey="timeLeft" sort={sort} onSort={onSort} numeric />
            <th scope="col" className={`${CELL} text-right`}>
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: SKELETON_ROWS }, (_, i) => <SkeletonRow key={i} rest={SKELETON} />)
            : detail.shown.map((listing) => (
                <ListingRow
                  key={listing.id}
                  listing={listing}
                  memberId={memberId}
                  now={now}
                  onOpen={detail.open}
                />
              ))}
        </tbody>
      </table>
      {detail.openListing && (
        <ListingDetailDialog
          key={detail.openListing.id}
          listing={detail.openListing}
          memberId={memberId}
          onListing={detail.onListing}
          onClose={detail.close}
          returnFocus={detail.opener}
        />
      )}
    </div>
  );
}

function SortHeader({
  label,
  hint,
  sortKey,
  sort,
  onSort,
  numeric = false,
}: {
  label: string;
  /** What the column sorts by, when that is not the column's own name. */
  hint?: string;
  sortKey: SortKey;
  sort: RowSort;
  onSort: (key: SortKey) => void;
  numeric?: boolean;
}) {
  const state = ariaSort(sort, sortKey);
  const Chevron = state === "descending" ? ChevronDownIcon : ChevronUpIcon;
  return (
    <th scope="col" aria-sort={state} className={numeric ? NUMERIC : CELL}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex min-h-[40px] items-center gap-1 uppercase tracking-[0.15em] ${
          state === "none" ? "hover:text-vellum" : "text-brass-bright"
        }`}
      >
        {label}
        {hint && (
          <span className="normal-case tracking-normal text-vellum-muted">{hint}</span>
        )}
        <Chevron
          aria-hidden
          className={`h-4 w-4 ${state === "none" ? "opacity-0" : ""}`}
        />
      </button>
    </th>
  );
}

function ListingRow({
  listing,
  memberId,
  now,
  onOpen,
}: {
  listing: Listing;
  memberId: string | undefined;
  now: number;
  onOpen: (id: string, row: HTMLElement) => void;
}) {
  return (
    <OpenableRow listing={listing} onOpen={onOpen}>
      {(open) => (
        <>
          <ItemCell item={listing.item} />
          <td className={`${CELL} ${LESSER} text-vellum-dim`}>{typeLabel(listing.item)}</td>
          <PriceCell price={priceCell(listing)} />
          <td className={`${NUMERIC} ${LESSER} text-vellum-dim`}>{listing.bidCount}</td>
          <td className={`${NUMERIC} text-vellum`}>{formatTimeLeft(listing.endsAt, now)}</td>
          <td className={`${CELL} text-right`}>
            <ActionCell action={rowAction(listing, { memberId }, now)} onBid={open} />
          </td>
        </>
      )}
    </OpenableRow>
  );
}

function ActionCell({
  action,
  onBid,
}: {
  action: ReturnType<typeof rowAction>;
  onBid: () => void;
}) {
  switch (action) {
    case "own":
      return <span className="text-vellum-dim">Your listing</span>;
    case "signIn":
      return (
        <Link
          href={SIGN_IN_TO_MARKETPLACE}
          className="inline-flex min-h-[40px] items-center text-brass-bright underline-offset-4 hover:underline"
        >
          Sign in to bid
        </Link>
      );
    case "ended":
      // Nothing to press: the row still opens its detail, which says the auction has ended.
      return <span className="text-vellum-muted">Bidding closed</span>;
    case "bid":
      // Opens the listing detail, where the bid box is. Secondary style: a column of amber
      // buttons would be a column of torches (req 30); the dialog's Bid holds the torch.
      return (
        <button type="button" onClick={onBid} className="btn-secondary min-h-[40px]">
          Bid
        </button>
      );
  }
}
