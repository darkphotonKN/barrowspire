/**
 * One press of "List a relic", start to answer (FS-8EGFA req 25). The fetchers and the page's
 * reactions are injected, so the order is testable without a page:
 *
 * 1. post the listing with the end time the chosen duration gives;
 * 2. refused: answer the refusal's copy, and nothing else happens;
 * 3. accepted (202): hand over (close the drawer, say it is posted, switch to Mine), answer at
 *    once, and poll for the listing in the background; when the poll ends, say how it went,
 *    unless the poll was cancelled or the page has gone by then.
 */

import {
  POSTED_LIVE,
  STILL_PROCESSING,
  createListingFailureMessage,
  endsAtFor,
  type DurationId,
} from "./listRelic";
import type { PollOutcome } from "./postedPoll";

export interface PostListingDeps {
  createListing: (itemId: string, startPrice: number, endsAt: string) => Promise<void>;
  /** The listing was accepted: close the drawer, say it is posted, switch to Mine. */
  onPosted: () => void;
  /** Waits for the listing to show under Mine. */
  poll: (itemId: string) => Promise<{ outcome: PollOutcome }>;
  /** The poll has ended: say how, and re-read the relics so the one listed shows Listed. */
  onSettled: (notice: string) => void;
  /** True once the page has gone. */
  cancelled: () => boolean;
  now: () => number;
}

/** Resolves to the refusal's copy, or null once the listing is accepted. */
export async function postListing(
  listing: { itemId: string; startPrice: number; duration: DurationId },
  deps: PostListingDeps,
): Promise<string | null> {
  try {
    await deps.createListing(
      listing.itemId,
      listing.startPrice,
      endsAtFor(listing.duration, deps.now()),
    );
  } catch (err) {
    return createListingFailureMessage(err);
  }
  deps.onPosted();
  void deps.poll(listing.itemId).then(({ outcome }) => {
    if (outcome === "cancelled" || deps.cancelled()) return;
    deps.onSettled(outcome === "found" ? POSTED_LIVE : STILL_PROCESSING);
  });
  return null;
}
