/**
 * The Buy out button's decisions (FS-49Z37 req 5–12): whether it is offered, whether it may be
 * pressed, which Idempotency-Key a press goes with, and what each refusal says. Pure, so the
 * dialog only wires them to state; the server stays the authority on every one of them.
 */

import { ApiError } from "@/utils/apiError";
import {
  BID_LAPSED,
  BID_NOT_ENOUGH_GOLD,
  keepsBidKey,
  PURSE_FAILED,
  PURSE_NOT_READY,
  type Purse,
} from "./bid";
import { BROWSE_UNREACHABLE } from "./browse";
import { actionArea } from "./detail";
import { formatGold } from "./gold";

export const BUYOUT_CONFLICT = "Someone acted at the same moment — try again.";
export const BUYOUT_LAPSED = BID_LAPSED;
export const BUYOUT_PRICE_CHANGED = "The buyout price has changed — check it and try again.";
export const BUYOUT_GONE = "This relic is no longer for sale.";
export const BOUGHT = "Bought — the relic reaches your stash once the sale settles.";

export const buyoutLabel = (price: number): string => `Buy out — ${formatGold(price)} gold`;

export const buyoutQuestion = (relic: string, price: number): string =>
  `Buy ${relic} outright for ${formatGold(price)} gold? The auction ends at once.`;

export interface BuyoutActionInput {
  listing: {
    sellerId: string;
    status: string;
    ended?: boolean;
    endsAt: string;
    buyoutPrice?: number;
  };
  memberId: string | undefined;
  now: number;
  purse: Purse;
}

export type BuyoutAction =
  | { shown: false }
  | { shown: true; price: number; canPress: boolean; reason?: string };

/**
 * Buy out is offered where the bid box is (signed in, not the seller, ACTIVE, not ended) and
 * the listing has a buyout price (req 5). It is pressable only when the available gold covers
 * the price; a purse not read yet or unreadable says what the bid box says (req 6).
 */
export function buyoutAction(input: BuyoutActionInput): BuyoutAction {
  const { listing, purse } = input;
  const price = listing.buyoutPrice;
  if (price === undefined || actionArea(listing, input.memberId, input.now) !== "bid")
    return { shown: false };
  if (purse.state === "missing") return { shown: true, price, canPress: false, reason: PURSE_NOT_READY };
  if (purse.state === "failed") return { shown: true, price, canPress: false, reason: PURSE_FAILED };
  if (purse.state === "loading") return { shown: true, price, canPress: false };
  if (purse.availableGold < price)
    return { shown: true, price, canPress: false, reason: BID_NOT_ENOUGH_GOLD };
  return { shown: true, price, canPress: true };
}

/**
 * Whether a refused buyout's key may be sent again (req 9, 12; ADR-0026). The same split as a
 * bid's key: kept for a busy listing (`409 · CONFLICT`), a `503` or no answer, where a resend is
 * the same intent; spent by every other answer, so the next press mints a new one.
 */
export const keepsBuyoutKey: (err: unknown) => boolean = keepsBidKey;

/**
 * What a refused buyout says (req 12), routed by the problem's `code`. `refetch` asks the caller
 * to re-read the listing as well: its price changed, or it is no longer for sale. `ends` says the
 * intent is over, so the confirm closes: the relic is no longer for sale.
 */
export function buyoutFailure(
  err: unknown,
  context: { price: number; availableGold?: number },
): { message: string; refetch?: true; ends?: true } {
  if (!(err instanceof ApiError) || err.status === 503) return { message: BROWSE_UNREACHABLE };
  switch (err.code) {
    case "CONFLICT":
      return { message: BUYOUT_CONFLICT };
    case "ALREADY_EXISTS":
      return { message: BUYOUT_LAPSED };
    case "VALIDATION_FAILED":
      return { message: BUYOUT_PRICE_CHANGED, refetch: true };
    case "FAILED_PRECONDITION":
      return context.availableGold !== undefined && context.availableGold < context.price
        ? { message: BID_NOT_ENOUGH_GOLD }
        : { message: BUYOUT_GONE, refetch: true, ends: true };
  }
  return { message: err.detail };
}
