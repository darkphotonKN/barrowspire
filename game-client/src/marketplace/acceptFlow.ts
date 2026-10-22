/**
 * One press of Sell, start to answer (FS-49Z37 req 15–17). The fetchers are injected, so the
 * order of the steps is testable without a dialog:
 *
 * 1. send the accept (no key, no body);
 * 2. accepted: re-read the listing, and only the listing. The seller's gold arrives at
 *    settlement, so the purse would not change. Then say it is sold;
 *    no longer for sale: re-read the listing, so it shows why;
 *    any other refusal: say what it means.
 */

import { ACCEPT_SOLD, acceptFailure } from "./accept";
import type { BidNote } from "./bid";

export interface AcceptSubmitDeps {
  acceptBid: () => Promise<void>;
  /** Re-reads the listing. */
  refresh: () => Promise<unknown>;
}

export async function submitAccept(
  deps: AcceptSubmitDeps,
): Promise<{ sold: boolean; note: BidNote }> {
  try {
    await deps.acceptBid();
  } catch (err) {
    const failure = acceptFailure(err);
    if (failure.refetch) await deps.refresh();
    return { sold: false, note: { tone: "error", text: failure.message } };
  }
  await deps.refresh();
  return { sold: true, note: { tone: "ok", text: ACCEPT_SOLD } };
}
