"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  NO_BIDS,
  acceptConfirmText,
  leadingBidLine,
  sellerBlock,
} from "@/marketplace/accept";
import { NOTE_TONE } from "@/components/bazaar/noteTone";
import { submitAccept } from "@/marketplace/acceptFlow";
import type { BidNote } from "@/marketplace/bid";
import type { Listing } from "@/marketplace/listing";
import { openSellerConfirm, type SellerConfirm } from "@/marketplace/sellerConfirm";
import { withdrawListingConfirmText, withdrawListingOffered } from "@/marketplace/withdrawListing";
import { submitWithdrawListing } from "@/marketplace/withdrawListingFlow";
import { apiClient } from "@/utils/api";

const CONFIRM_ID = "bazaar-seller-confirm";
/** Marks a confirm's back-out button, so a dialog opened straight into a confirm can focus it. */
export const CONFIRM_CANCEL = "[data-confirm-cancel]";

/**
 * The seller's own listing (FS-49Z37 req 13–17, FS-V7A5S req 14–16): the leading bid with Accept,
 * or "No bids yet.", and Withdraw while the listing may still be withdrawn. Each asks first; the
 * confirm sends it ({@link submitAccept}, {@link submitWithdrawListing}). `startWithdraw` opens
 * the withdraw confirm at once, for Withdraw pressed on a My listings row. It stays mounted for
 * the seller after the listing stops being live, so the answer outlives the re-read that ends the
 * sale or the listing; with nothing to offer and nothing to say, it renders nothing. Which
 * confirm is open is {@link openSellerConfirm}'s answer: a withdrawal that answers 503 or not at
 * all keeps its confirm open, whose button then sends it again, even once the listing stops
 * reading withdrawable here (FS-V7A5S req 16 as amended 2026-11-05).
 */
export default function SellerBlock({
  listing,
  memberId,
  now,
  refresh,
  startWithdraw = false,
}: {
  listing: Listing;
  memberId: string | undefined;
  now: number;
  refresh: () => Promise<Listing | undefined>;
  startWithdraw?: boolean;
}) {
  const [confirming, setConfirming] = useState<SellerConfirm>(startWithdraw ? "withdraw" : undefined);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [note, setNote] = useState<BidNote>();
  const [retrying, setRetrying] = useState(false);
  const inFlight = useRef(false);
  const cancel = useRef<HTMLButtonElement>(null);

  const block = sellerBlock(listing, memberId, now);
  const withdrawable = withdrawListingOffered(listing, memberId, now);
  const open = openSellerConfirm(listing, memberId, now, { asked: confirming, retrying, done });

  useEffect(() => {
    if (open) cancel.current?.focus();
  }, [open]);

  const send = async (
    submit: () => Promise<{ done: boolean; note: BidNote; retry?: boolean }>,
  ) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setNote(undefined);
    try {
      const result = await submit();
      setDone(result.done);
      setNote(result.note);
      setRetrying(result.retry === true);
      if (!result.retry) setConfirming(undefined);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const sell = () => {
    // Sell is only on the confirm, which shows only for an acceptable listing.
    if (block.kind !== "accept") return;
    // The floor is the price the confirm displays now (FS-F692V req 9).
    const minAmount = block.currentPrice;
    return send(async () => {
      const r = await submitAccept({
        acceptBid: () => apiClient.acceptBid(listing.id, minAmount),
        refresh,
      });
      return { done: r.sold, note: r.note };
    });
  };

  const withdraw = () =>
    send(async () => {
      const r = await submitWithdrawListing({
        withdrawListing: () => apiClient.withdrawListing(listing.id),
        refresh,
      });
      return { done: r.withdrawn, note: r.note, retry: r.retry };
    });

  const ask = (what: SellerConfirm) => {
    setNote(undefined);
    setRetrying(false);
    setConfirming(what);
  };

  const status = (
    <p role="status" aria-live="polite" className="min-h-[1.25rem] text-center text-sm">
      {note && <span className={NOTE_TONE[note.tone]}>{note.text}</span>}
    </p>
  );

  // Before the "nothing to offer" return: a confirm awaiting its retry outlives the listing
  // reading withdrawable, and only its button finishes the withdrawal.
  if (open === "withdraw")
    return (
      <Confirm
        text={withdrawListingConfirmText(listing.bidCount)}
        back="Keep it listed"
        go={submitting ? "Withdrawing…" : retrying ? "Withdraw again" : "Withdraw"}
        onBack={() => {
          setRetrying(false);
          setConfirming(undefined);
        }}
        onGo={() => void withdraw()}
        submitting={submitting}
        cancelRef={cancel}
        status={status}
      />
    );

  if (done || block.kind === "none") return note ? status : null;

  if (open === "accept" && block.kind === "accept")
    return (
      <Confirm
        text={acceptConfirmText(block.currentPrice)}
        back="Not yet"
        go={submitting ? "Selling…" : "Sell"}
        onBack={() => setConfirming(undefined)}
        onGo={() => void sell()}
        submitting={submitting}
        cancelRef={cancel}
        status={status}
      />
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        {block.kind === "accept" ? (
          <span className="tabular-nums text-vellum">{leadingBidLine(block.currentPrice)}</span>
        ) : (
          <span className="text-vellum-dim">{NO_BIDS}</span>
        )}
        <div className="flex items-center gap-3">
          {withdrawable && (
            <button
              type="button"
              onClick={() => ask("withdraw")}
              className="btn-secondary min-h-[40px]"
            >
              Withdraw
            </button>
          )}
          {block.kind === "accept" && (
            <button type="button" onClick={() => ask("accept")} className="btn-primary min-h-[40px]">
              Accept leading bid
            </button>
          )}
        </div>
      </div>
      {status}
    </div>
  );
}

/** One confirm of a seller action: the question, a back-out, and the action itself. */
function Confirm({
  text,
  back,
  go,
  onBack,
  onGo,
  submitting,
  cancelRef,
  status,
}: {
  text: string;
  back: string;
  go: string;
  onBack: () => void;
  onGo: () => void;
  submitting: boolean;
  cancelRef: RefObject<HTMLButtonElement | null>;
  status: React.ReactNode;
}) {
  return (
    <div
      role="alertdialog"
      aria-labelledby={CONFIRM_ID}
      className="surface-well flex flex-col gap-3 rounded-[8px] border border-[color:var(--color-border-strong)] p-4"
    >
      <p id={CONFIRM_ID} className="text-vellum">
        {text}
      </p>
      <div className="flex justify-end gap-3">
        <button
          ref={cancelRef}
          type="button"
          data-confirm-cancel
          onClick={onBack}
          disabled={submitting}
          className="btn-secondary min-h-[40px] disabled:opacity-50"
        >
          {back}
        </button>
        <button
          type="button"
          onClick={onGo}
          disabled={submitting}
          className="btn-primary min-h-[40px] disabled:transform-none disabled:opacity-50"
        >
          {go}
        </button>
      </div>
      {status}
    </div>
  );
}
