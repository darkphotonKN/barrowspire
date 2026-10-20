"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { v4 as uuid } from "uuid";
import ItemIcon from "@/components/ItemIcon";
import RarityBadge from "@/components/RarityBadge";
import SellerBlock from "@/components/bazaar/SellerBlock";
import { useDialogFocus } from "@/components/bazaar/useDialogFocus";
import type { ItemLines } from "@/items/itemLines";
import {
  BID_ENDED,
  bidBox,
  closedBoxNotes,
  purseFailure,
  type BidAttempt,
  type BidNote,
  type Purse,
} from "@/marketplace/bid";
import { submitBid } from "@/marketplace/bidFlow";
import { BUYOUT_GONE, buyoutAction, buyoutLabel, buyoutQuestion } from "@/marketplace/buyout";
import { submitBuyout } from "@/marketplace/buyoutFlow";
import { SIGN_IN_TO_MARKETPLACE } from "@/marketplace/browse";
import { actionArea, itemStats, listingItemLines, listingReader } from "@/marketplace/detail";
import { formatGold } from "@/marketplace/gold";
import type { Listing } from "@/marketplace/listing";
import { listingStatusLabel } from "@/marketplace/listingStatus";
import { rarityOf } from "@/marketplace/rarity";
import { formatTimeLeft } from "@/marketplace/timeLeft";
import { useCountdownNow } from "@/marketplace/useCountdownNow";
import { apiClient, publicApi } from "@/utils/api";

const TITLE_ID = "bazaar-detail-title";

const TONE: Record<BidNote["tone"] | "muted", string> = {
  ok: "text-brass-bright",
  error: "text-[color:var(--color-danger-text)]",
  muted: "text-vellum-dim",
};

const endTime = (endsAt: string) =>
  new Date(endsAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/**
 * One listing in full, with the bid box (FS-8EGFA req 24, 26–29). It opens on the row's copy
 * and refetches the listing at once. `onListing` hears every newer read, so the table can show
 * a landed bid without a reload. Focus moves in on open and returns to `returnFocus` on close.
 */
export default function ListingDetailDialog({
  listing: initial,
  memberId,
  onListing,
  onClose,
  returnFocus,
}: {
  listing: Listing;
  memberId: string | undefined;
  onListing: (listing: Listing) => void;
  onClose: () => void;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, { onClose, returnFocus, initialFocus: "input" });

  const [listing, setListing] = useState(initial);
  // What is shown, readable from inside the reader, which drops any read older than it. A failed
  // read keeps it; the bid box still has the server's word on submit.
  const shown = useRef(initial);
  const refresh = useMemo(
    () =>
      listingReader<Listing>({
        fetch: () => publicApi.getListing(initial.id),
        current: () => shown.current,
        apply: (read) => {
          shown.current = read;
          setListing(read);
          onListing(read);
        },
      }),
    [initial.id, onListing],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const now = useCountdownNow([listing.endsAt]);
  const { item } = listing;
  const panel = actionArea(listing, memberId, now);
  const stats = itemStats(item);
  const lines = listingItemLines(item);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[color-mix(in_srgb,var(--color-bg-darker)_80%,transparent)] p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        className="surface-raised relative flex max-h-full w-full max-w-lg animate-[fadeInScale_0.2s_ease-out] flex-col gap-5 overflow-y-auto rounded-[12px] p-6 backdrop-blur-[20px]"
        style={{ "--row-rarity": `var(--rarity-${rarityOf(item?.rarity).token})` } as React.CSSProperties}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-[6px] text-vellum-dim hover:text-brass-bright"
        >
          <XMarkIcon aria-hidden className="h-6 w-6" />
        </button>

        <header className="bazaar-row-edge flex items-center gap-4 pl-4 pr-10">
          <ItemIcon item={item ?? {}} size={56} />
          <div className="flex flex-col gap-1">
            <h2 id={TITLE_ID} className="text-xl font-semibold text-vellum">
              {item?.name ?? "Unknown relic"}
            </h2>
            {item && <RarityBadge tier={item.rarity} />}
          </div>
        </header>

        {item?.description && <p className="text-vellum-dim">{item.description}</p>}

        {stats.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {stats.map((s) => (
              <div key={s.label} className="flex justify-between gap-2">
                <dt className="text-vellum-dim">{s.label}</dt>
                <dd className="tabular-nums text-vellum">{s.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {lines && <ItemLinesBlock lines={lines} />}

        <hr className="rule-brass" />

        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[11px] uppercase tracking-[0.15em] text-vellum-dim">
            {listing.currentPrice === undefined ? "Opening price" : "Current price"}
          </span>
          {/* The view's focal number: the one amber price (req 30). */}
          <span className="text-2xl tabular-nums text-primary">
            <span className="text-vellum-muted" aria-hidden>
              ⟡
            </span>{" "}
            {formatGold(listing.currentPrice ?? listing.startPrice)}
            <span className="sr-only"> gold</span>
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <Fact label="Start price" value={`⟡ ${formatGold(listing.startPrice)}`} />
          <Fact label="Minimum bid" value={`⟡ ${formatGold(listing.minimumBid)}`} />
          {listing.buyoutPrice !== undefined && (
            <Fact label="Buyout price" value={`⟡ ${formatGold(listing.buyoutPrice)}`} />
          )}
          <Fact label="Bids" value={String(listing.bidCount)} />
          <Fact label="Time left" value={formatTimeLeft(listing.endsAt, now)} />
          <div className="col-span-2 flex justify-between gap-2">
            <dt className="text-vellum-dim">Ends</dt>
            <dd className="text-vellum">
              <time dateTime={listing.endsAt}>{endTime(listing.endsAt)}</time>
            </dd>
          </div>
        </dl>

        {panel === "signIn" && (
          <Link href={SIGN_IN_TO_MARKETPLACE} className="btn-secondary inline-flex min-h-[40px] items-center justify-center">
            Sign in to bid
          </Link>
        )}
        {/* Mounted for the seller whatever the panel, so Sell's answer outlives the re-read that
            ends the sale; it offers nothing unless the panel is "own" (FS-49Z37 req 13). */}
        {memberId !== undefined && memberId === listing.sellerId && (
          <SellerBlock listing={listing} memberId={memberId} now={now} refresh={refresh} />
        )}
        {/* One mount for "bid" and "closed", so the box keeps its answer as the auction ends. */}
        {(panel === "bid" || panel === "closed") && (
          <BidBox listing={listing} ended={panel === "closed"} refresh={refresh} />
        )}
        {/* Mounted outside the "bid" branch so its bought note outlives the listing leaving ACTIVE. */}
        <BuyoutAction listing={listing} memberId={memberId} now={now} refresh={refresh} />

        {/* An ACTIVE listing offering nothing has ended, so it reads "Ended — awaiting settlement". */}
        {panel === "none" && (
          <p className="text-center text-vellum-dim">
            {listingStatusLabel({ status: listing.status, ended: true })}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * The listed item's level, requirement, affixes and unique effect (FS-4R9M9 R59), worded as the
 * run's item views word them. An item from before item levels shows level 1 and no affix lines.
 */
function ItemLinesBlock({ lines }: { lines: ItemLines }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="flex flex-wrap gap-x-6 gap-y-1 text-vellum-dim">
        <span className="tabular-nums">{lines.itemLevel}</span>
        <span className="tabular-nums">{lines.requirement.text}</span>
      </p>
      {lines.affixes.length > 0 && (
        <ul aria-label="Affixes" className="flex flex-col gap-0.5 tabular-nums text-vellum">
          {lines.affixes.map((line, i) => (
            <li key={`${i}-${line}`}>{line}</li>
          ))}
        </ul>
      )}
      {lines.uniqueEffect && (
        <p className="border-l border-[color:var(--color-border-strong)] pl-3 text-vellum">
          <span className="mr-2 text-[11px] uppercase tracking-[0.15em] text-vellum-dim">
            Unique
          </span>
          {lines.uniqueEffect}
        </p>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-vellum-dim">{label}</dt>
      <dd className="tabular-nums text-vellum">{value}</dd>
    </div>
  );
}

/**
 * The bid box (req 26, 29): pre-filled with the minimum, the delver's available gold beside it,
 * one Idempotency-Key per bid reused on a retry of the same amount (the steps are
 * {@link submitBid}). A bid in flight when the countdown reaches zero still shows its answer.
 */
function BidBox({
  listing,
  ended,
  refresh,
}: {
  listing: Listing;
  ended: boolean;
  refresh: () => Promise<Listing | undefined>;
}) {
  const [purse, setPurse] = useState<Purse>({ state: "loading" });
  const [text, setText] = useState(String(listing.minimumBid));
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState<BidNote>();
  const touched = useRef(false);
  const inFlight = useRef(false);
  const attempt = useRef<BidAttempt>(undefined);

  const loadPurse = useCallback(async () => {
    try {
      const account = await apiClient.getWalletAccount();
      setPurse({ state: "ready", availableGold: account.availableGold });
    } catch (err) {
      setPurse(purseFailure(err));
    }
  }, []);

  useEffect(() => {
    void loadPurse();
  }, [loadPurse]);

  // Until the delver types, the box follows the minimum as fresh reads arrive.
  useEffect(() => {
    if (!touched.current) setText(String(listing.minimumBid));
  }, [listing.minimumBid]);

  const box = bidBox({ text, minimumBid: listing.minimumBid, purse, ended, submitting });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!box.canSubmit || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setNote(undefined);
    try {
      const result = await submitBid(
        {
          amount: box.amount,
          previous: attempt.current,
          availableGold: purse.state === "ready" ? purse.availableGold : undefined,
        },
        {
          placeBid: (amount, key) => apiClient.placeBid(listing.id, amount, key),
          refresh,
          reloadPurse: loadPurse,
          mint: () => uuid(),
          resetTouched: () => {
            touched.current = false;
          },
        },
      );
      attempt.current = result.attempt;
      setNote(result.note);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  if (box.canSubmit === false && box.closed)
    return (
      <div role="status" aria-live="polite" className="flex flex-col gap-1 text-center">
        {closedBoxNotes(note, box.reason ?? BID_ENDED).map((line) => (
          <p key={line.text} className={TONE[line.tone]}>
            {line.text}
          </p>
        ))}
      </div>
    );

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex items-end gap-3">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.15em] text-vellum-dim">Your bid</span>
          <input
            inputMode="numeric"
            autoComplete="off"
            value={text}
            onChange={(e) => {
              touched.current = true;
              setText(e.target.value);
              setNote(undefined);
            }}
            aria-describedby="bazaar-bid-reason"
            className="surface-well min-h-[40px] rounded-[6px] border border-[color:var(--color-border)] px-3 tabular-nums text-vellum focus:border-[color:var(--color-border-strong)]"
          />
        </label>
        <button
          type="submit"
          disabled={!box.canSubmit}
          className="btn-primary min-h-[40px] disabled:transform-none disabled:opacity-50"
        >
          {submitting ? "Bidding…" : "Bid"}
        </button>
      </div>
      <p className="text-sm text-vellum-dim">
        Available:{" "}
        <span className="tabular-nums text-vellum">
          {purse.state === "ready" ? `⟡ ${formatGold(purse.availableGold)}` : "—"}
        </span>
      </p>
      <p id="bazaar-bid-reason" role="status" aria-live="polite" className="min-h-[1.25rem] text-sm">
        {note ? (
          <span className={TONE[note.tone]}>{note.text}</span>
        ) : (
          box.reason && <span className={TONE.muted}>{box.reason}</span>
        )}
      </p>
    </form>
  );
}

/**
 * Buy out (FS-49Z37 req 5–12): the button where the bid box is, on a listing with a buyout price,
 * and an inline confirm that sends nothing until its own Buy out is pressed. The confirm holds one
 * Idempotency-Key per open, minted on its first press and dropped on close (ADR-0026); the steps
 * of a press are {@link submitBuyout}. It stays mounted as the listing leaves ACTIVE, so the
 * bought or refused note outlives the button.
 */
function BuyoutAction({
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
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<BidNote>();
  const key = useRef<string>(undefined);
  const inFlight = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);

  const action = buyoutAction({ listing, memberId, now, purse });

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
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);

  // Each open is a new buyout intent: no key until its first press (req 9).
  const open = () => {
    key.current = undefined;
    setNote(undefined);
    setConfirming(true);
  };

  const close = () => {
    key.current = undefined;
    setConfirming(false);
    setNote(undefined);
    trigger.current?.focus();
  };

  const price = listing.buyoutPrice;

  const confirm = async () => {
    if (price === undefined || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setNote(undefined);
    try {
      const result = await submitBuyout(
        {
          price,
          key: key.current,
          availableGold: purse.state === "ready" ? purse.availableGold : undefined,
        },
        {
          buyout: (amount, k) => apiClient.buyout(listing.id, amount, k),
          refresh,
          reloadPurse: loadPurse,
          mint: () => uuid(),
        },
      );
      setNote(result.note);
      // A sale, or a relic gone from sale, ends this intent: the confirm closes with its key.
      if (result.bought || result.note.text === BUYOUT_GONE) {
        key.current = undefined;
        setConfirming(false);
      } else {
        key.current = result.key;
      }
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  const noteLine = note && (
    <p role="status" aria-live="polite" className={`text-center text-sm ${TONE[note.tone]}`}>
      {note.text}
    </p>
  );

  // The confirm stays up if the listing ends while it is open: the press is still sent, and the
  // server's answer says the relic is no longer for sale (Edge States).
  if (confirming && price !== undefined)
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
            onClick={() => void confirm()}
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
          <span className={TONE[note.tone]}>{note.text}</span>
        ) : (
          action.reason && <span className={TONE.muted}>{action.reason}</span>
        )}
      </p>
    </div>
  );
}
