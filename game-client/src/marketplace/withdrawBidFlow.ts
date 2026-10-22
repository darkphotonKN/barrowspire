/**
 * One press of Withdraw inside the confirm, start to answer (FS-EYQ8K req 12–14). The fetchers
 * are injected, so the order of the steps is testable without a dialog:
 *
 * 1. send the withdraw (no key, no body);
 * 2. withdrawn: re-read the list and the purse, so the bid leaves the list and its gold shows
 *    as returned, then say so;
 *    no longer withdrawable: re-read the list, so it shows why;
 *    any other refusal: say what it means.
 */

import type { BidNote } from "./bid";
import { WITHDRAWN, withdrawFailure } from "./withdrawBid";

export interface WithdrawSubmitDeps {
  withdraw: () => Promise<void>;
  /** Re-reads My bids from its first page. */
  refresh: () => Promise<unknown>;
  reloadPurse: () => Promise<void>;
}

export async function submitWithdraw(
  deps: WithdrawSubmitDeps,
): Promise<{ withdrawn: boolean; note: BidNote }> {
  try {
    await deps.withdraw();
  } catch (err) {
    const failure = withdrawFailure(err);
    if (failure.refetch) await deps.refresh();
    return { withdrawn: false, note: { tone: "error", text: failure.message } };
  }
  await Promise.all([deps.refresh(), deps.reloadPurse()]);
  return { withdrawn: true, note: { tone: "ok", text: WITHDRAWN } };
}
