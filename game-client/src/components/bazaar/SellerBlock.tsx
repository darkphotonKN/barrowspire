"use client";

import { useEffect, useRef, useState } from "react";
import {
  NO_BIDS,
  acceptConfirmText,
  leadingBidLine,
  sellerBlock,
} from "@/marketplace/accept";
import { submitAccept } from "@/marketplace/acceptFlow";
import type { BidNote } from "@/marketplace/bid";
import type { Listing } from "@/marketplace/listing";
import { apiClient } from "@/utils/api";

const TONE: Record<BidNote["tone"], string> = {
  ok: "text-brass-bright",
  error: "text-[color:var(--color-danger-text)]",
};

const CONFIRM_ID = "bazaar-accept-confirm";

/**
 * The seller's own listing (FS-49Z37 req 13–17): the leading bid with Accept, or "No bids yet."
 * Accept asks first; Sell sends it ({@link submitAccept}). It stays mounted for the seller after
 * the listing stops being live, so the answer to Sell outlives the re-read that ends the sale;
 * with nothing to offer and nothing to say, it renders nothing.
 */
export default function SellerBlock({
  listing,
  memberId,
  now,
  refresh,
}: {
  listing: Listing;
  memberId: string | undefined;
  now: number;
  refresh: () => Promise<Listing | undefined>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sold, setSold] = useState(false);
  const [note, setNote] = useState<BidNote>();
  const inFlight = useRef(false);
  const notYet = useRef<HTMLButtonElement>(null);

  const block = sellerBlock(listing, memberId, now);
  // A listing that stops being acceptable while the confirm is open drops the confirm.
  const open = confirming && block.kind === "accept" && !sold;

  useEffect(() => {
    if (open) notYet.current?.focus();
  }, [open]);

  const sell = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setNote(undefined);
    try {
      const result = await submitAccept({
        acceptBid: () => apiClient.acceptBid(listing.id),
        refresh,
      });
      setSold(result.sold);
      setNote(result.note);
      setConfirming(false);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const status = (
    <p role="status" aria-live="polite" className="min-h-[1.25rem] text-center text-sm">
      {note && <span className={TONE[note.tone]}>{note.text}</span>}
    </p>
  );

  if (sold || block.kind === "none") return note ? status : null;

  if (block.kind === "noBids") return <p className="text-center text-vellum-dim">{NO_BIDS}</p>;

  if (open)
    return (
      <div
        role="alertdialog"
        aria-labelledby={CONFIRM_ID}
        className="surface-well flex flex-col gap-3 rounded-[8px] border border-[color:var(--color-border-strong)] p-4"
      >
        <p id={CONFIRM_ID} className="text-vellum">
          {acceptConfirmText(block.currentPrice)}
        </p>
        <div className="flex justify-end gap-3">
          <button
            ref={notYet}
            type="button"
            onClick={() => setConfirming(false)}
            disabled={submitting}
            className="btn-secondary min-h-[40px] disabled:opacity-50"
          >
            Not yet
          </button>
          <button
            type="button"
            onClick={() => void sell()}
            disabled={submitting}
            className="btn-primary min-h-[40px] disabled:transform-none disabled:opacity-50"
          >
            {submitting ? "Selling…" : "Sell"}
          </button>
        </div>
        {status}
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <span className="tabular-nums text-vellum">{leadingBidLine(block.currentPrice)}</span>
        <button
          type="button"
          onClick={() => {
            setNote(undefined);
            setConfirming(true);
          }}
          className="btn-primary min-h-[40px]"
        >
          Accept leading bid
        </button>
      </div>
      {status}
    </div>
  );
}
