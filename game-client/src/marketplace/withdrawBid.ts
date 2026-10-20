/**
 * Withdrawing a bid from My bids (FS-EYQ8K req 10–14): which rows offer it, what the confirm
 * says, and what each refusal means. Pure, so the view only wires them to state; the server stays
 * the authority on whether the bid may still be withdrawn.
 */

import { ApiError } from "@/utils/apiError";
import { BID_CONFLICT } from "./bid";
import { BROWSE_UNREACHABLE } from "./browse";
import { formatGold } from "./gold";
import { listingLive, type MyBid } from "./myBids";

export const WITHDRAW_GONE = "This bid can no longer be withdrawn.";
/** Said once a withdraw lands, as the bid leaves the list and its gold returns to the purse. */
export const WITHDRAWN = "Your bid is withdrawn.";

/** A bid as the withdraw decisions read it. */
type WithdrawableBid = Pick<MyBid, "amount" | "status"> & {
  listing: Pick<MyBid["listing"], "status" | "ended" | "endsAt">;
};

const WITHDRAWABLE = new Set(["WINNING", "OUTBID"]);

/**
 * Req 10: a leading or outbid bid on a listing still taking bids. Never a `PENDING` one, which
 * lasts a moment, nor a decided one.
 */
export function withdrawOffered(bid: WithdrawableBid, now: number): boolean {
  return WITHDRAWABLE.has(bid.status.toUpperCase()) && listingLive(bid.listing, now);
}

/**
 * Req 11: the confirm's question, by the bid's status. A leading bid hands the lead to the next
 * highest (ADR-0028); an outbid one only frees its gold (ADR-0029).
 */
export function withdrawConfirmText(bid: Pick<MyBid, "amount" | "status">): string {
  const question = `Withdraw your bid of ${formatGold(bid.amount)} gold?`;
  return bid.status.toUpperCase() === "WINNING"
    ? `${question} The next highest bid takes the lead.`
    : `${question} Your gold is returned.`;
}

/**
 * What a refused withdraw means (req 14). `refetch` asks the caller to re-read the list, which
 * then shows why: the auction ended, or the bid was decided.
 */
export function withdrawFailure(err: unknown): { message: string; refetch?: true } {
  if (!(err instanceof ApiError) || err.status === 503) return { message: BROWSE_UNREACHABLE };
  if (err.status === 400 && err.code === "FAILED_PRECONDITION")
    return { message: WITHDRAW_GONE, refetch: true };
  if (err.status === 409) return { message: BID_CONFLICT };
  return { message: err.detail };
}
