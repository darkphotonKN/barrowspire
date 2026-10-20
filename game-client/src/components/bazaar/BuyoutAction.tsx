"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { NOTE_TONE } from "@/components/bazaar/noteTone";
import { purseFailure, type BidNote, type Purse } from "@/marketplace/bid";
import { buyoutAction, buyoutLabel, buyoutQuestion } from "@/marketplace/buyout";
import { buyoutConfirm, submitBuyout, type BuyoutConfirm } from "@/marketplace/buyoutFlow";
import type { Listing } from "@/marketplace/listing";
import { apiClient } from "@/utils/api";

const CLOSED: BuyoutConfirm = { open: false, key: undefined };

/**
 * Buy out (FS-49Z37 req 5–12): the button where the bid box is, on a listing with a buyout price,
 * and an inline confirm that sends nothing until its own Buy out is pressed. When the confirm opens
 * and closes, and which Idempotency-Key it holds, is {@link buyoutConfirm}; the steps of a press
 * are {@link submitBuyout}. This component only renders them. It stays mounted as the listing
 * leaves ACTIVE, so the bought or refused note outlives the button.
 */
export default function BuyoutAction({
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
  const [purse, setPurse] = useState<Purse>({ state: "loading" });
  const [confirm, setConfirm] = useState<BuyoutConfirm>(CLOSED);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<BidNote>();
  const inFlight = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);

  const action = buyoutAction({ listing, memberId, now, purse });
  const price = listing.buyoutPrice;

  const loadPurse = useCallback(async () => {
    try {
      const account = await apiClient.getWalletAccount();
      setPurse({ state: "ready", availableGold: account.availableGold });
    } catch (err) {
      setPurse(purseFailure(err));
    }
  }, []);

  useEffect(() => {
    if (action.shown) void loadPurse();
  }, [action.shown, loadPurse]);

  useEffect(() => {
    if (confirm.open) confirmButton.current?.focus();
  }, [confirm.open]);

  const open = () => {
    setNote(undefined);
    setConfirm((s) => buyoutConfirm(s, { type: "open" }));
  };

  const close = () => {
    setNote(undefined);
    setConfirm((s) => buyoutConfirm(s, { type: "close" }));
    trigger.current?.focus();
  };

  const press = async () => {
    if (price === undefined || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setNote(undefined);
    try {
      const result = await submitBuyout(
        {
          price,
          key: confirm.key,
          availableGold: purse.state === "ready" ? purse.availableGold : undefined,
        },
        {
          buyout: (amount, key) => apiClient.buyout(listing.id, amount, key),
          refresh,
          reloadPurse: loadPurse,
          mint: () => uuid(),
        },
      );
      setNote(result.note);
      setConfirm((s) => buyoutConfirm(s, { type: "answered", result }));
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  const noteLine = note && (
    <p role="status" aria-live="polite" className={`text-center text-sm ${NOTE_TONE[note.tone]}`}>
      {note.text}
    </p>
  );

  // The confirm stays up if the listing ends while it is open: the press is still sent, and the
  // server's answer says the relic is no longer for sale (Edge States).
  if (confirm.open && price !== undefined)
    return (
      <div
        role="group"
        aria-label="Confirm buyout"
        className="surface-well flex flex-col gap-3 rounded-[8px] border border-[color:var(--color-border-strong)] p-4"
      >
        <p className="text-vellum">{buyoutQuestion(listing.item?.name ?? "this relic", price)}</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={close}
            className="min-h-[40px] rounded-[6px] px-3 text-vellum-dim hover:text-brass-bright"
          >
            Keep looking
          </button>
          <button
            ref={confirmButton}
            type="button"
            onClick={() => void press()}
            disabled={sending}
            className="btn-secondary min-h-[40px] disabled:transform-none disabled:opacity-50"
          >
            {sending ? "Buying…" : "Buy out"}
          </button>
        </div>
        {noteLine}
      </div>
    );

  if (!action.shown) return noteLine ?? null;

  return (
    <div className="flex flex-col gap-1">
      <button
        ref={trigger}
        type="button"
        onClick={open}
        disabled={!action.canPress}
        aria-describedby="bazaar-buyout-reason"
        className="btn-secondary min-h-[40px] disabled:transform-none disabled:opacity-50"
      >
        {buyoutLabel(action.price)}
      </button>
      <p id="bazaar-buyout-reason" role="status" aria-live="polite" className="min-h-[1.25rem] text-center text-sm">
        {note ? (
          <span className={NOTE_TONE[note.tone]}>{note.text}</span>
        ) : (
          action.reason && <span className={NOTE_TONE.muted}>{action.reason}</span>
        )}
      </p>
    </div>
  );
}
