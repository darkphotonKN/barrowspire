"use client";

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
import type { Listing } from "@/marketplace/listing";
import { mineRow } from "@/marketplace/myListings";

const SKELETON_ROWS = 3;
// Bids is the lesser column.
const SKELETON: readonly SkeletonCell[] = [
  { cell: NUMERIC, bar: "ml-auto h-4 w-14" },
  { cell: `${NUMERIC} ${LESSER}`, bar: "ml-auto h-4 w-6" },
  { cell: NUMERIC, bar: "ml-auto h-4 w-14" },
  { cell: CELL, bar: "ml-auto h-4 w-24" },
];

/**
 * The delver's own listings under Mine (FS-8EGFA req 23; design guideline Part II "Listing
 * table"). The same row anatomy as the browse table, but a status column takes the action's
 * place: nobody bids on their own relic, and a sold or withdrawn one has nothing to act on.
 * Rows arrive newest first and are shown in that order. A row opens the listing detail (req 24)
 * as a browse row does, on a click or Enter; closing it puts focus back on the row.
 */
export default function MyListingsTable({
  rows,
  loading,
  memberId,
  now,
}: {
  rows: Listing[];
  loading: boolean;
  memberId: string | undefined;
  now: number;
}) {
  const detail = useListingDetail(rows);
  return (
    <div className="overflow-hidden rounded-[10px] border border-[color:var(--color-border)] bg-card shadow-[var(--shadow-card)]">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">Your listings, newest first, in every status.</caption>
        <thead className="text-[11px] uppercase tracking-[0.15em] text-vellum-dim">
          <tr className="border-b border-[color:var(--color-border-strong)]">
            <th scope="col" className={CELL}>Item</th>
            <th scope="col" className={NUMERIC}>Price</th>
            <th scope="col" className={`${NUMERIC} ${LESSER}`}>Bids</th>
            <th scope="col" className={NUMERIC}>Time left</th>
            <th scope="col" className={`${CELL} text-right`}>Status</th>
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: SKELETON_ROWS }, (_, i) => <SkeletonRow key={i} rest={SKELETON} />)
            : detail.shown.map((listing) => (
                <MineRow key={listing.id} listing={listing} now={now} onOpen={detail.open} />
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

function MineRow({
  listing,
  now,
  onOpen,
}: {
  listing: Listing;
  now: number;
  onOpen: (id: string, row: HTMLElement) => void;
}) {
  const row = mineRow(listing, now);
  return (
    <OpenableRow listing={listing} onOpen={onOpen}>
      {() => (
        <>
          <ItemCell item={listing.item} />
          <PriceCell price={row.price} />
          <td className={`${NUMERIC} ${LESSER} text-vellum-dim`}>{listing.bidCount}</td>
          <td className={`${NUMERIC} ${row.live ? "text-vellum" : "text-vellum-dim"}`}>
            {row.timeLeft}
          </td>
          <td className={`${CELL} text-right`}>
            <span
              className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${
                row.live ? "text-brass-bright" : "text-vellum-dim"
              }`}
            >
              {row.status}
            </span>
          </td>
        </>
      )}
    </OpenableRow>
  );
}
