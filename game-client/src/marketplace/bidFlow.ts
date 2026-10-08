/**
 * One press of Bid, start to answer (FS-8EGFA req 26, 29). The fetchers and the box's `touched`
 * reset are injected, so the order of the steps is testable without a dialog:
 *
 * 1. mint a key, or reuse the one a refused bid of the same amount went with;
 * 2. send the bid;
 * 3. landed: forget the attempt (the next bid is a new bid with a new key), let the box follow
 *    the minimum again, and re-read the listing and purse before saying it leads;
 *    outbid: let the box follow the minimum again and re-read before naming the new minimum;
 *    otherwise: keep the attempt, so a retry of the same amount lands at most once.
 */

import {
  bidAttempt,
  bidFailure,
  bidLeads,
  outbidMessage,
  type BidAttempt,
  type BidNote,
} from "./bid";
import { BROWSE_UNREACHABLE } from "./browse";

export interface BidSubmitDeps {
  placeBid: (amount: number, idempotencyKey: string) => Promise<void>;
  /** Re-reads the listing; undefined when the read failed. */
  refresh: () => Promise<{ minimumBid: number } | undefined>;
  reloadPurse: () => Promise<void>;
  mint: () => string;
  /** Lets the box follow the minimum again; called before the re-read so the new one lands in it. */
  resetTouched: () => void;
}

export async function submitBid(
  bid: { amount: number; previous: BidAttempt | undefined; availableGold: number | undefined },
  deps: BidSubmitDeps,
): Promise<{ attempt: BidAttempt | undefined; note: BidNote }> {
  const attempt = bidAttempt(bid.previous, bid.amount, deps.mint);
  try {
    await deps.placeBid(attempt.amount, attempt.key);
  } catch (err) {
    const failure = bidFailure(err, { amount: attempt.amount, availableGold: bid.availableGold });
    if (!("refetch" in failure)) return { attempt, note: { tone: "error", text: failure.message } };
    deps.resetTouched();
    const fresh = await deps.refresh();
    return {
      attempt,
      note: { tone: "error", text: fresh ? outbidMessage(fresh.minimumBid) : BROWSE_UNREACHABLE },
    };
  }
  deps.resetTouched();
  await Promise.all([deps.refresh(), deps.reloadPurse()]);
  return { attempt: undefined, note: { tone: "ok", text: bidLeads(attempt.amount) } };
}
