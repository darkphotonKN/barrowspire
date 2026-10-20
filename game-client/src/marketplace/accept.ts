/**
 * The seller's side of the detail (FS-49Z37 req 13–17): what the seller block offers, what the
 * confirm says, and what each refusal of an accept means. Pure, so the block only wires them to
 * state; the server stays the authority on whether a bid leads and whether the sale goes ahead.
 */

import { ApiError } from "@/utils/apiError";
import { BROWSE_UNREACHABLE } from "./browse";
import { actionArea } from "./detail";
import { formatGold } from "./gold";

export const NO_BIDS = "No bids yet.";
export const ACCEPT_SOLD = "Sold — your gold arrives once the sale settles.";
export const ACCEPT_CONFLICT = "Someone acted at the same moment — try again.";
export const ACCEPT_GONE = "This relic is no longer for sale.";

export const leadingBidLine = (currentPrice: number): string =>
  `Leading bid: ${formatGold(currentPrice)} gold`;

/**
 * The confirm's question (req 14). It promises the leading bid, not the amount: settlement sells
 * to whichever bid leads when it freezes the listing, so a higher bid landing first wins.
 */
export const acceptConfirmText = (currentPrice: number): string =>
  `End the auction and sell to the leading bid (currently ${formatGold(currentPrice)} gold)? ` +
  "A higher bid landing first is the one that wins.";

export type SellerBlock =
  | { kind: "accept"; currentPrice: number }
  | { kind: "noBids" }
  | { kind: "none" };

/**
 * What the seller block offers (req 13): the leading bid and Accept when someone leads, "No bids
 * yet." when nobody does. Only where {@link actionArea} gives the seller their own live listing;
 * anything not ACTIVE, or ended, offers nothing.
 */
export function sellerBlock(
  listing: {
    sellerId: string;
    status: string;
    ended?: boolean;
    endsAt: string;
    currentPrice?: number;
  },
  memberId: string | undefined,
  now: number,
): SellerBlock {
  if (actionArea(listing, memberId, now) !== "own") return { kind: "none" };
  return listing.currentPrice === undefined
    ? { kind: "noBids" }
    : { kind: "accept", currentPrice: listing.currentPrice };
}

/**
 * What a refused accept means (req 17), routed by status and the problem's `code`. `refetch`
 * asks the caller to re-read the listing, which then shows it is no longer for sale.
 */
export function acceptFailure(err: unknown): { message: string; refetch?: true } {
  if (!(err instanceof ApiError) || err.status === 503) return { message: BROWSE_UNREACHABLE };
  if (err.status === 409 && err.code === "CONFLICT") return { message: ACCEPT_CONFLICT };
  if (err.status === 400 && err.code === "FAILED_PRECONDITION")
    return { message: ACCEPT_GONE, refetch: true };
  return { message: err.detail };
}
