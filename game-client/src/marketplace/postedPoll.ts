/**
 * Waiting for a posted listing to appear (FS-8EGFA req 25).
 *
 * `create-listing` answers 202 with no id: marketplace reserves the item first, and the listing
 * exists only once the reservation is confirmed. So the page re-reads `list-my-listings` until a
 * listing for the item it just posted is ACTIVE, or gives up. The clock and the fetcher are
 * injected, so the whole schedule is testable without waiting.
 */

export const POLL_INTERVAL_MS = 1500;
export const POLL_MAX_TRIES = 8;

export type PollOutcome = "found" | "gaveUp" | "cancelled";

export interface PostedPollDeps<L> {
  /** One read of the delver's listings, newest first (the first page is enough). */
  fetchMine: () => Promise<{ listings: L[] }>;
  /** Waits `ms`; the real one is a timer, a test's records the wait. */
  sleep: (ms: number) => Promise<void>;
  /** Every page read, so the Mine table shows the newest one while the poll runs. */
  onPage?: (page: { listings: L[] }) => void;
  /** True once the page has gone away; the poll then stops without another read. */
  cancelled?: () => boolean;
  intervalMs?: number;
  maxTries?: number;
}

/**
 * Waits one interval, reads, and repeats until a listing for `itemId` is ACTIVE or the tries run
 * out. A failed read counts as a miss rather than ending the poll: the listing may still land.
 */
export async function pollForPostedListing<L extends { itemId: string; status: string }>(
  itemId: string,
  deps: PostedPollDeps<L>,
): Promise<{ outcome: PollOutcome; attempts: number }> {
  const interval = deps.intervalMs ?? POLL_INTERVAL_MS;
  const tries = deps.maxTries ?? POLL_MAX_TRIES;

  for (let attempt = 1; attempt <= tries; attempt++) {
    await deps.sleep(interval);
    if (deps.cancelled?.()) return { outcome: "cancelled", attempts: attempt - 1 };

    let page: { listings: L[] };
    try {
      page = await deps.fetchMine();
    } catch {
      continue;
    }
    deps.onPage?.(page);
    if (page.listings.some((l) => l.itemId === itemId && l.status.toUpperCase() === "ACTIVE"))
      return { outcome: "found", attempts: attempt };
  }
  return { outcome: "gaveUp", attempts: tries };
}

/** The real clock, for the page. */
export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
