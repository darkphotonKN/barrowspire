"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { v4 as uuid } from "uuid";
import ItemIcon from "@/components/ItemIcon";
import RarityBadge from "@/components/RarityBadge";
import { useDialogFocus } from "@/components/bazaar/useDialogFocus";
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
import { SIGN_IN_TO_MARKETPLACE } from "@/marketplace/browse";
import { bidPanel, itemStats, listingReader } from "@/marketplace/detail";
import { formatGold } from "@/marketplace/gold";
import type { Listing } from "@/marketplace/listing";
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
  const panel = bidPanel(listing, memberId);
  const stats = itemStats(item);

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
        {panel === "own" && <p className="text-center text-vellum-dim">Your listing</p>}
        {panel === "bid" && (
          <BidBox
            listing={listing}
            ended={listing.ended || Date.parse(listing.endsAt) <= now}
            refresh={refresh}
          />
        )}
      </div>
    </div>,
    document.body,
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
