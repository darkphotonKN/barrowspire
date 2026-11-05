/**
 * The seller withdrawing their own listing (FS-V7A5S req 14–16): when it is offered, what the
 * confirm says, and what each refusal means. Pure, so the views only wire them to state; the
 * server stays the authority on whether the listing may still be withdrawn (req 3).
 */

import { ApiError } from "@/utils/apiError";
import { BUYOUT_CONFLICT } from "./buyout";
import { actionArea } from "./detail";

/** The contested final stretch in which a listing with bids cannot be withdrawn (ADR-0051). */
export const WITHDRAW_LISTING_LOCK_MS = 30 * 60 * 1000;

export const WITHDRAW_LISTING_LOCKED =
  "Too late to withdraw — this auction has bids and ends within 30 minutes.";
export const WITHDRAW_LISTING_GONE = "This listing can no longer be withdrawn.";
export const WITHDRAW_LISTING_CONFLICT = BUYOUT_CONFLICT;
/**
 * A 503 or no answer (req 16 as amended 2026-11-05), whether nothing came back at all or an
 * ingress in front of the gateway answered 502 or 504 for it. The server may have withdrawn the
 * listing without starting its follow-up, or never been reached; either way, sending it again is
 * safe and finishes it.
 */
export const WITHDRAW_LISTING_RETRY = "The withdrawal didn't finish. Withdraw again to complete it.";
/** Said once a withdrawal lands; the re-read listing then reads "Withdrawn". */
export const LISTING_WITHDRAWN = "Listing withdrawn — the relic comes back to you.";

/**
 * The statuses that say the withdrawal's outcome is unknown: the gateway's own 503, and the 502
 * and 504 an ingress or load balancer answers when the gateway gave it nothing.
 */
const NO_ANSWER = new Set([502, 503, 504]);

/** A listing as the withdraw decision reads it. */
export interface WithdrawableListing {
  status: string;
  ended?: boolean;
  endsAt: string;
  bidCount: number;
  currentPrice?: number;
  buyoutPrice?: number;
}

/**
 * A regular bid is always below the buyout price, so a lead at it is the buyout: the sale is
 * decided and the listing is closed to every change (ADR-0051).
 */
const boughtOut = (l: WithdrawableListing): boolean =>
  l.buyoutPrice !== undefined && l.currentPrice !== undefined && l.currentPrice >= l.buyoutPrice;

/**
 * Req 14: ACTIVE, not ended, not bought out, and outside the final 30 minutes when it has bids.
 * The window is closed at its start, as the server's is. Whose listing it is, is the caller's
 * question.
 */
export function listingWithdrawable(listing: WithdrawableListing, now: number): boolean {
  if (listing.status.toUpperCase() !== "ACTIVE" || listing.ended) return false;
  const left = Date.parse(listing.endsAt) - now;
  if (left <= 0 || boughtOut(listing)) return false;
  return listing.bidCount === 0 || left > WITHDRAW_LISTING_LOCK_MS;
}

/** Withdraw on the detail: only the seller's own live listing, and only while withdrawable. */
export function withdrawListingOffered(
  listing: WithdrawableListing & { sellerId: string },
  memberId: string | undefined,
  now: number,
): boolean {
  return actionArea(listing, memberId, now) === "own" && listingWithdrawable(listing, now);
}

/** Req 15: the confirm's question. With bids, it names how many and that their gold goes back. */
export function withdrawListingConfirmText(bidCount: number): string {
  const question = "Withdraw this listing? The relic comes back to you";
  if (bidCount === 0) return `${question}.`;
  const bids = bidCount === 1 ? "1 bid" : `${bidCount} bids`;
  return `${question}, and its ${bids} ${bidCount === 1 ? "is" : "are"} cancelled — every bidder gets their gold back.`;
}

/**
 * What a refused withdrawal means (req 16), routed by status and the problem's `code`. `refetch`
 * asks the caller to re-read the listing, which then shows why it can no longer be withdrawn.
 * `retry` asks the caller to keep the confirm open, so its button sends the withdrawal again; the
 * listing is not re-read, since a withdrawn one would hide the action the retry needs.
 */
export function withdrawListingFailure(err: unknown): {
  message: string;
  refetch?: true;
  retry?: true;
} {
  if (!(err instanceof ApiError) || NO_ANSWER.has(err.status))
    return { message: WITHDRAW_LISTING_RETRY, retry: true };
  if (err.status === 400 && err.code === "LISTING_WITHDRAW_LOCKED")
    return { message: WITHDRAW_LISTING_LOCKED, refetch: true };
  if (err.status === 400 && err.code === "FAILED_PRECONDITION")
    return { message: WITHDRAW_LISTING_GONE, refetch: true };
  if (err.status === 409 && err.code === "CONFLICT") return { message: WITHDRAW_LISTING_CONFLICT };
  return { message: err.detail };
}
