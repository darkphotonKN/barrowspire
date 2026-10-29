/**
 * The bid box's decisions (FS-8EGFA req 26, 29): what the player typed, whether it may be sent,
 * which Idempotency-Key it goes with, and what each refusal says. Pure, so the dialog only wires
 * them to state; the server stays the authority on every one of them.
 */

import { ApiError } from "@/utils/apiError";
import { BROWSE_UNREACHABLE } from "./browse";
import { formatGold } from "./gold";

export const BID_ENDED = "This auction has ended.";
export const BID_NOT_ENOUGH_GOLD = "Not enough gold";
export const BID_CONFLICT = "Someone bid at the same moment — try again.";
export const BID_LAPSED = "That attempt lapsed — try again.";
export const PURSE_NOT_READY = "Your purse isn't ready yet — try again shortly.";
export const PURSE_FAILED = "Your purse could not be read — try again shortly.";
const NOT_WHOLE = "Enter a whole amount of gold.";
export const BID_AT_BUYOUT = "Bids must stay below the buyout price — to buy now, use Buy out.";

export const outbidMessage = (minimumBid: number): string =>
  `Someone bid higher — the minimum is now ⟡${formatGold(minimumBid)}.`;

export const bidLeads = (amount: number): string =>
  `Your bid of ⟡${formatGold(amount)} leads.`;

/**
 * The amount in the box, or null when it is not a whole number of gold above zero. Digit
 * grouping is allowed so a pasted "1,234" reads as the page printed it. Integers only: no
 * floating-point value ever becomes a bid.
 */
export function parseBidAmount(text: string): number | null {
  const digits = text.trim().replace(/,/g, "");
  if (!/^\d+$/.test(digits)) return null;
  const amount = Number(digits);
  if (amount < 1 || !Number.isSafeInteger(amount)) return null;
  return amount;
}

/** The player's wallet as the bid box sees it: 404 means the purse is not made yet (ADR-0014). */
export type Purse =
  | { state: "loading" }
  | { state: "ready"; availableGold: number }
  | { state: "missing" }
  | { state: "failed" };

export function purseFailure(err: unknown): Purse {
  return err instanceof ApiError && err.status === 404
    ? { state: "missing" }
    : { state: "failed" };
}

export interface BidBoxInput {
  text: string;
  minimumBid: number;
  /** When set, the highest acceptable bid is one below it (FS-49Z37 req 20). */
  buyoutPrice?: number;
  purse: Purse;
  /** By the server's word or by the countdown reaching zero. */
  ended: boolean;
  submitting: boolean;
}

export type BidBoxState =
  | { canSubmit: true; amount: number; reason?: never; closed?: never }
  | { canSubmit: false; reason?: string; closed?: true };

/**
 * Whether Bid may be pressed, and why not. Below the minimum or above the available gold is
 * refused here (req 26), as is a bid at or above the buyout price (FS-49Z37 req 20), which is
 * named before the purse so the player is pointed at Buy out; an ended auction closes the box
 * for good (Edge States).
 */
export function bidBox(input: BidBoxInput): BidBoxState {
  if (input.ended) return { canSubmit: false, reason: BID_ENDED, closed: true };
  const { purse } = input;
  if (purse.state === "missing") return { canSubmit: false, reason: PURSE_NOT_READY };
  if (purse.state === "failed") return { canSubmit: false, reason: PURSE_FAILED };
  if (purse.state === "loading") return { canSubmit: false };

  const amount = parseBidAmount(input.text);
  if (amount === null) return { canSubmit: false, reason: NOT_WHOLE };
  if (amount < input.minimumBid)
    return {
      canSubmit: false,
      reason: `The minimum bid is ⟡${formatGold(input.minimumBid)}.`,
    };
  if (input.buyoutPrice !== undefined && amount >= input.buyoutPrice)
    return { canSubmit: false, reason: BID_AT_BUYOUT };
  if (amount > purse.availableGold)
    return { canSubmit: false, reason: BID_NOT_ENOUGH_GOLD };
  if (input.submitting) return { canSubmit: false };
  return { canSubmit: true, amount };
}

/** One bid as sent: its amount and the Idempotency-Key every retry of it carries. */
export interface BidAttempt {
  amount: number;
  key: string;
}

/**
 * The attempt a submit belongs to. Sending the same amount again is a retry of the same bid and
 * reuses its key, so a double submit or a retry after a conflict lands at most once; a new
 * amount is a new bid with a new key. The caller forgets the attempt once a bid lands, or once
 * {@link keepsBidKey} says its key is spent.
 */
export function bidAttempt(
  previous: BidAttempt | undefined,
  amount: number,
  mint: () => string,
): BidAttempt {
  if (previous && previous.amount === amount) return previous;
  return { amount, key: mint() };
}

/**
 * Whether a failed bid's key may be sent again (FS-49Z37 req 22–23). Only where a same-key
 * retry is the right retry: a busy listing (`409 · CONFLICT`, whose hold ADR-0027 keeps), a
 * `503`, or no answer at all. Every other answer spends the key: a refused or lapsed bid's key
 * answers `409 · ALREADY_EXISTS` on reuse, so the next press must mint a new one.
 */
export function keepsBidKey(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  if (err.status === 503) return true;
  return err.status === 409 && err.code === "CONFLICT";
}

/**
 * What a refused bid means (req 29), routed by the problem's `code`. `refetch` asks the caller
 * to reload the listing and then let {@link validationRefusal} name the cause.
 */
export function bidFailure(
  err: unknown,
  context: { amount: number; availableGold?: number },
): { refetch: true } | { message: string } {
  if (!(err instanceof ApiError) || err.status === 503)
    return { message: BROWSE_UNREACHABLE };
  switch (err.code) {
    case "VALIDATION_FAILED":
      return { refetch: true };
    case "FAILED_PRECONDITION":
      return context.availableGold !== undefined && context.availableGold < context.amount
        ? { message: BID_NOT_ENOUGH_GOLD }
        : { message: BID_ENDED };
    case "ALREADY_EXISTS":
      return { message: BID_LAPSED };
  }
  if (err.status === 409) return { message: BID_CONFLICT };
  return { message: err.detail };
}

/**
 * What a `VALIDATION_FAILED` bid meant, judged by the listing re-read after it (FS-49Z37 req 21).
 * The server answers a bid at or above the buyout price and a plain too-low bid alike, so an
 * amount at or above the re-read buyout price was the cap; anything else was outbid.
 */
export function validationRefusal(
  amount: number,
  fresh: { minimumBid: number; buyoutPrice?: number },
): string {
  return fresh.buyoutPrice !== undefined && amount >= fresh.buyoutPrice
    ? BID_AT_BUYOUT
    : outbidMessage(fresh.minimumBid);
}

/** A line under the bid box: the server's answer to a bid. */
export interface BidNote {
  tone: "ok" | "error";
  text: string;
}

/**
 * What a closed box says (Edge States). A bid still in flight when the countdown reaches zero
 * keeps its answer, leads or refused, above the closed message; one refused as ended is not
 * told so twice.
 */
export function closedBoxNotes(
  note: BidNote | undefined,
  closed: string,
): { tone: BidNote["tone"] | "muted"; text: string }[] {
  const shut = { tone: "muted" as const, text: closed };
  if (!note) return [shut];
  if (note.text === closed) return [note];
  return [note, shut];
}
