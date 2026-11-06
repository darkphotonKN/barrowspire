/**
 * One press of Withdraw in the confirm, start to answer (FS-V7A5S req 15, 16). The fetchers are
 * injected, so the order of the steps is testable without a dialog:
 *
 * 1. send the DELETE (no key, no body);
 * 2. withdrawn: re-read the listing, which now reads "Withdrawn", and say so;
 *    no longer withdrawable, or too late: re-read the listing, so it shows why;
 *    a 503 or no answer: ask for a retry and leave the listing as it is (req 16 as amended);
 *    any other refusal: say what it means.
 */

import type { BidNote } from "./bid";
import { LISTING_WITHDRAWN, withdrawListingFailure } from "./withdrawListing";

export interface WithdrawListingSubmitDeps {
  withdrawListing: () => Promise<void>;
  /** Re-reads the listing. */
  refresh: () => Promise<unknown>;
}

export async function submitWithdrawListing(
  deps: WithdrawListingSubmitDeps,
): Promise<{ withdrawn: boolean; retry?: true; note: BidNote }> {
  try {
    await deps.withdrawListing();
  } catch (err) {
    const failure = withdrawListingFailure(err);
    const note: BidNote = { tone: "error", text: failure.message };
    if (failure.retry) return { withdrawn: false, retry: true, note };
    if (failure.refetch) await deps.refresh();
    return { withdrawn: false, note };
  }
  await deps.refresh();
  return { withdrawn: true, note: { tone: "ok", text: LISTING_WITHDRAWN } };
}
