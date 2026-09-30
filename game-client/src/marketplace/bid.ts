/**
 * The bid box's decisions (FS-8EGFA req 26, 29): what the delver typed, whether it may be sent,
 * which Idempotency-Key it goes with, and what each refusal says. Pure, so the dialog only wires
 * them to state; the server stays the authority on every one of them.
 */

import { ApiError } from "@/utils/apiError";
import { BROWSE_UNREACHABLE } from "./browse";
import { formatGold } from "./gold";

export const BID_ENDED = "This auction has ended.";
export const BID_NOT_ENOUGH_GOLD = "Not enough gold";
export const BID_CONFLICT = "Someone bid at the same moment — try again.";
export const PURSE_NOT_READY = "Your purse isn't ready yet — try again shortly.";
export const PURSE_FAILED = "Your purse could not be read — try again shortly.";
const NOT_WHOLE = "Enter a whole amount of gold.";

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

/** The delver's wallet as the bid box sees it: 404 means the purse is not made yet (ADR-0014). */
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
 * refused here (req 26); an ended auction closes the box for good (Edge States).
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
 * amount is a new bid with a new key. The caller forgets the attempt once a bid lands.
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
 * What a refused bid means (req 29), routed by the problem's `code`. `refetch` asks the caller
 * to reload the listing and then say {@link outbidMessage} with the new minimum.
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
  }
  if (err.status === 409) return { message: BID_CONFLICT };
  return { message: err.detail };
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
