"use client";

import { useEffect, useRef, useState } from "react";
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
import { withdrawConfirmText, withdrawOffered } from "@/marketplace/withdrawBid";

const COLUMNS = 6;
const SKELETON_ROWS = 3;
const SKELETON: readonly SkeletonCell[] = [
  { cell: NUMERIC, bar: "ml-auto h-4 w-14" },
  { cell: NUMERIC, bar: "ml-auto h-4 w-14" },
  { cell: NUMERIC, bar: "ml-auto h-4 w-14" },
  { cell: CELL, bar: "ml-auto h-4 w-20" },
  { cell: CELL, bar: "ml-auto h-4 w-20" },
];

/**
 * The delver's own bids under My bids (FS-EYQ8K req 15–17; design guideline Part II "Listing
 * table"). The listing table's row anatomy, one row per bid, newest first as the server sends
 * them: the relic, the delver's bid, what the auction stands at now, its time left, and where the
 * bid stands. No amber in a row: prices are vellum, a standing bid is brass-bright.
 *
 * A leading or outbid bid on a live auction offers Withdraw (req 10), which asks first, in a row
 * under its own (req 11); only that confirm's Withdraw sends anything. Its answer is the caller's
 * to show: a withdraw re-reads the list, which replaces every row.
 */
export default function MyBidsTable({
  rows,
  loading,
  now,
  onWithdraw,
}: {
  rows: MyBidEntry[];
  loading: boolean;
  now: number;
  onWithdraw: (bid: MyBidEntry) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState<string>();
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);

  const withdraw = async (bid: MyBidEntry) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    try {
      await onWithdraw(bid);
    } finally {
      inFlight.current = false;
      setSending(false);
      setConfirming(undefined);
    }
  };

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
            <th scope="col" className={`${CELL} text-right`}>Action</th>
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: SKELETON_ROWS }, (_, i) => <SkeletonRow key={i} rest={SKELETON} />)
            : rows.map((bid) => (
                <BidRow
                  key={bid.id}
                  bid={bid}
                  now={now}
                  confirming={confirming === bid.id}
                  sending={sending}
                  onAsk={() => setConfirming(bid.id)}
                  onKeep={() => setConfirming(undefined)}
                  onWithdraw={() => void withdraw(bid)}
                />
              ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One bid, and under it its withdraw confirm while open. The confirm stays up if the auction ends
 * while it is open: the press is still sent, and the server's answer says why it was refused
 * (Edge States).
 */
function BidRow({
  bid,
  now,
  confirming,
  sending,
  onAsk,
  onKeep,
  onWithdraw,
}: {
  bid: MyBidEntry;
  now: number;
  confirming: boolean;
  sending: boolean;
  onAsk: () => void;
  onKeep: () => void;
  onWithdraw: () => void;
}) {
  const row = myBidRow(bid, now);
  const offered = withdrawOffered(bid, now);
  const trigger = useRef<HTMLButtonElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  const confirmId = `bazaar-withdraw-${bid.id}`;

  // Into the confirm on its safe answer; back to Withdraw when it closes and the row remains.
  useEffect(() => {
    if (confirming) keep.current?.focus();
    else if (wasConfirming.current) trigger.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  return (
    <>
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
      <td className={`${CELL} text-right`}>
        {offered && !confirming && (
          <button
            ref={trigger}
            type="button"
            onClick={onAsk}
            disabled={sending}
            className="btn-secondary min-h-[40px] disabled:transform-none disabled:opacity-50"
          >
            Withdraw
          </button>
        )}
      </td>
    </tr>
    {confirming && (
      <tr className="border-b border-[color:var(--color-border)] last:border-b-0">
        <td colSpan={COLUMNS} className={CELL}>
          <div
            role="alertdialog"
            aria-labelledby={confirmId}
            className="surface-well flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[color:var(--color-border-strong)] p-4"
          >
            <p id={confirmId} className="text-vellum">
              {withdrawConfirmText(bid)}
            </p>
            <div className="flex gap-3">
              <button
                ref={keep}
                type="button"
                onClick={onKeep}
                disabled={sending}
                className="min-h-[40px] rounded-[6px] px-3 text-vellum-dim hover:text-brass-bright disabled:opacity-50"
              >
                Keep my bid
              </button>
              <button
                type="button"
                onClick={onWithdraw}
                disabled={sending}
                className="btn-secondary min-h-[40px] disabled:transform-none disabled:opacity-50"
              >
                {sending ? "Withdrawing…" : "Withdraw"}
              </button>
            </div>
          </div>
        </td>
      </tr>
    )}
    </>
  );
}
