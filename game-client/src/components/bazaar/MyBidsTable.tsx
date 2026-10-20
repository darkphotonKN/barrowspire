"use client";

import {
  CELL,
  ItemCell,
  NUMERIC,
  PriceCell,
  SkeletonRow,
  type SkeletonCell,
} from "@/components/bazaar/cells";
import { myBidRow, type MyBidEntry } from "@/marketplace/myBids";
import { rarityOf } from "@/marketplace/rarity";

const SKELETON_ROWS = 3;
const SKELETON: readonly SkeletonCell[] = [
  { cell: NUMERIC, bar: "ml-auto h-4 w-14" },
  { cell: NUMERIC, bar: "ml-auto h-4 w-14" },
  { cell: NUMERIC, bar: "ml-auto h-4 w-14" },
  { cell: CELL, bar: "ml-auto h-4 w-20" },
];

/**
 * The delver's own bids under My bids (FS-EYQ8K req 15–17; design guideline Part II "Listing
 * table"). The listing table's row anatomy, one row per bid, newest first as the server sends
 * them: the relic, the delver's bid, what the auction stands at now, its time left, and where the
 * bid stands. No amber in a row: prices are vellum, a standing bid is brass-bright.
 */
export default function MyBidsTable({
  rows,
  loading,
  now,
}: {
  rows: MyBidEntry[];
  loading: boolean;
  now: number;
}) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-[color:var(--color-border)] bg-card shadow-[var(--shadow-card)]">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">Your bids, newest first.</caption>
        <thead className="text-[11px] uppercase tracking-[0.15em] text-vellum-dim">
          <tr className="border-b border-[color:var(--color-border-strong)]">
            <th scope="col" className={CELL}>Item</th>
            <th scope="col" className={NUMERIC}>Your bid</th>
            <th scope="col" className={NUMERIC}>Current price</th>
            <th scope="col" className={NUMERIC}>Time left</th>
            <th scope="col" className={`${CELL} text-right`}>Status</th>
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: SKELETON_ROWS }, (_, i) => <SkeletonRow key={i} rest={SKELETON} />)
            : rows.map((bid) => <BidRow key={bid.id} bid={bid} now={now} />)}
        </tbody>
      </table>
    </div>
  );
}

/** One bid. An action cell (Withdraw, FS-EYQ8K req 10) goes after the status cell. */
function BidRow({ bid, now }: { bid: MyBidEntry; now: number }) {
  const row = myBidRow(bid, now);
  return (
    <tr
      className="bazaar-row border-b border-[color:var(--color-border)] last:border-b-0"
      style={{ "--row-rarity": `var(--rarity-${rarityOf(bid.item?.rarity).token})` } as React.CSSProperties}
    >
      <ItemCell item={bid.item} />
      <PriceCell price={row.amount} />
      {row.price ? (
        <PriceCell price={row.price} badge={row.buyout} />
      ) : (
        <td className={`${NUMERIC} text-vellum-dim`}>
          —<span className="sr-only"> nobody leads</span>
        </td>
      )}
      <td className={`${NUMERIC} ${row.live ? "text-vellum" : "text-vellum-dim"}`}>
        {row.timeLeft}
      </td>
      <td className={`${CELL} text-right`}>
        <span
          className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${
            row.emphasis ? "text-brass-bright" : "text-vellum-dim"
          }`}
        >
          {row.status}
        </span>
      </td>
    </tr>
  );
}
