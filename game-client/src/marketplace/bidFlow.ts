/**
 * One press of Bid, start to answer (FS-8EGFA req 26, 29). The fetchers and the box's `touched`
 * reset are injected, so the order of the steps is testable without a dialog:
 *
 * 1. mint a key, or reuse the one a failed bid of the same amount kept;
 * 2. send the bid;
 * 3. landed: forget the attempt (the next bid is a new bid with a new key), let the box follow
 *    the minimum again, and re-read the listing and purse before saying it leads;
 *    outbid: let the box follow the minimum again and re-read before naming the new minimum, or
 *    the buyout cap when the re-read shows the amount was at or above it (FS-49Z37 req 21);
 *    either failure: keep the attempt only where {@link keepsBidKey} says a same-key retry is
 *    right (FS-49Z37 req 22–23), so a retry of a busy listing lands at most once and a spent
 *    key is never sent again.
 */

import {
  bidAttempt,
  bidFailure,
  bidLeads,
  keepsBidKey,
  validationRefusal,
  type BidAttempt,
  type BidNote,
} from "./bid";
import { BROWSE_UNREACHABLE } from "./browse";

export interface BidSubmitDeps {
  placeBid: (amount: number, idempotencyKey: string) => Promise<void>;
  /** Re-reads the listing; undefined when the read failed. */
  refresh: () => Promise<{ minimumBid: number; buyoutPrice?: number } | undefined>;
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
    const kept = keepsBidKey(err) ? attempt : undefined;
    if (!("refetch" in failure))
      return { attempt: kept, note: { tone: "error", text: failure.message } };
    deps.resetTouched();
    const fresh = await deps.refresh();
    return {
      attempt: kept,
      note: {
        tone: "error",
        text: fresh ? validationRefusal(attempt.amount, fresh) : BROWSE_UNREACHABLE,
      },
    };
  }
  deps.resetTouched();
  await Promise.all([deps.refresh(), deps.reloadPurse()]);
  return { attempt: undefined, note: { tone: "ok", text: bidLeads(attempt.amount) } };
}
