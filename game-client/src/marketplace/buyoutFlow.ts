/**
 * One press of Buy out inside the confirm dialog, start to answer (FS-49Z37 req 8–12). The
 * fetchers are injected, so the order of the steps is testable without a dialog:
 *
 * 1. reuse the key this open dialog holds, or mint one on its first press (ADR-0026);
 * 2. send exactly the price the dialog shows;
 * 3. bought: re-read the listing and the purse, then say so; the dialog drops its key;
 *    refused: say the answer's copy, re-read the listing where it changed under us, and keep
 *    the key only where {@link keepsBuyoutKey} says a resend is the same intent.
 */

import type { BidNote } from "./bid";
import { BOUGHT, buyoutFailure, keepsBuyoutKey } from "./buyout";

export interface BuyoutSubmitDeps {
  buyout: (amount: number, idempotencyKey: string) => Promise<void>;
  /** Re-reads the listing. */
  refresh: () => Promise<unknown>;
  reloadPurse: () => Promise<void>;
  mint: () => string;
}

export type BuyoutResult =
  | { bought: true; note: BidNote }
  | { bought: false; ends: boolean; key: string | undefined; note: BidNote };

export async function submitBuyout(
  press: { price: number; key: string | undefined; availableGold: number | undefined },
  deps: BuyoutSubmitDeps,
): Promise<BuyoutResult> {
  const key = press.key ?? deps.mint();
  try {
    await deps.buyout(press.price, key);
  } catch (err) {
    const failure = buyoutFailure(err, { price: press.price, availableGold: press.availableGold });
    if (failure.refetch) await deps.refresh();
    return {
      bought: false,
      ends: failure.ends === true,
      key: keepsBuyoutKey(err) ? key : undefined,
      note: { tone: "error", text: failure.message },
    };
  }
  await Promise.all([deps.refresh(), deps.reloadPurse()]);
  return { bought: true, note: { tone: "ok", text: BOUGHT } };
}

/** The confirm dialog and the one Idempotency-Key its buyout intent holds (req 9; ADR-0026). */
export interface BuyoutConfirm {
  open: boolean;
  key: string | undefined;
}

export type BuyoutConfirmEvent =
  | { type: "open" }
  | { type: "close" }
  | { type: "answered"; result: BuyoutResult };

/**
 * The confirm's lifetime, so the dialog only renders it (req 9, 26). Opening starts a new intent
 * with no key, and the first press mints one ({@link submitBuyout}). An answer keeps the confirm
 * open under the key it kept, or under none once it spent it. A sale, or a relic no longer for
 * sale, ends the intent. Closing drops the key, so reopening is a new intent.
 */
export function buyoutConfirm(state: BuyoutConfirm, event: BuyoutConfirmEvent): BuyoutConfirm {
  switch (event.type) {
    case "open":
      return { open: true, key: undefined };
    case "close":
      return { open: false, key: undefined };
    case "answered": {
      const { result } = event;
      if (result.bought || result.ends) return { open: false, key: undefined };
      return { open: state.open, key: result.key };
    }
  }
}
