/**
 * Which of the seller's confirms is open on their listing (FS-49Z37 req 13–17, FS-V7A5S req
 * 14–16). Pure, so the seller block only keeps the state and renders what this answers.
 */

import { sellerBlock } from "./accept";
import { withdrawListingOffered, type WithdrawableListing } from "./withdrawListing";

export type SellerConfirm = "accept" | "withdraw" | undefined;

/** What the seller block remembers between presses. */
export interface SellerConfirmState {
  /** The confirm the seller last opened, until they back out or it is answered. */
  asked: SellerConfirm;
  /** The last withdrawal answered 503 or not at all, so its confirm sends it again (req 16). */
  retrying: boolean;
  /** The last action landed: the listing is sold or withdrawn. */
  done: boolean;
}

/**
 * The confirm to show. A landed action shows none. A confirm whose action stops being offered
 * while it is open (the listing ended, was outbid into the final 30 minutes, was re-read as
 * withdrawn) drops, except a withdraw confirm awaiting its retry: the server may already hold
 * that listing withdrawn with its follow-up not started, and only sending it again finishes it
 * (req 16 as amended 2026-11-05). That exception is still the seller's alone.
 */
export function openSellerConfirm(
  listing: WithdrawableListing & { sellerId: string },
  memberId: string | undefined,
  now: number,
  { asked, retrying, done }: SellerConfirmState,
): SellerConfirm {
  if (done) return undefined;
  if (asked === "accept")
    return sellerBlock(listing, memberId, now).kind === "accept" ? "accept" : undefined;
  if (asked === "withdraw") {
    const awaitingRetry = retrying && memberId !== undefined && listing.sellerId === memberId;
    return awaitingRetry || withdrawListingOffered(listing, memberId, now) ? "withdraw" : undefined;
  }
  return undefined;
}
