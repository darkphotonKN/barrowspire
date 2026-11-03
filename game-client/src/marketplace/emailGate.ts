/**
 * The marketplace's half of the email-verified gate (FS-V6SFK §Requirements 29, 38).
 * marketplace-service refuses listing, bidding and buyout for an unverified member with
 * `400 · EMAIL_UNVERIFIED`; each action's failure mapper answers it with its line below, and each
 * action's flow marks that note with {@link gateFlag}, so the note renders as a prompt that opens
 * the verification panel. Withdraw, accept and every read are never gated, so nothing else here
 * needs the prompt.
 */

import { ApiError } from "@/utils/apiError";

export const EMAIL_UNVERIFIED = "EMAIL_UNVERIFIED";

export const VERIFY_TO_LIST = "Listing a relic needs a verified email.";
export const VERIFY_TO_BID = "Bidding needs a verified email.";
export const VERIFY_TO_BUY_OUT = "Buying out needs a verified email.";

/** Marks the gate's refusal on a note: the note offers the verification panel. */
export interface GateFlag {
  verifyEmail?: true;
}

/**
 * The flag for a refusal, read from its code, never from the copy a mapper chose: a note
 * carries `verifyEmail` exactly when the gate refused it.
 */
export function gateFlag(err: unknown): GateFlag {
  return err instanceof ApiError && err.code === EMAIL_UNVERIFIED ? { verifyEmail: true } : {};
}
