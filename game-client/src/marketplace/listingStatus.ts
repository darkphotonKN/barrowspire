/**
 * The status a listing shows under Mine (FS-8EGFA req 23).
 *
 * `ended` is a read-side fact the server sets on an ACTIVE listing past its end time, so it only
 * changes what an ACTIVE listing says: a listing already settling, sold or withdrawn keeps its
 * own label. A status the page has no copy for is shown as its words, never hidden.
 */

const LABELS: Record<string, string> = {
  ACTIVE: "Active",
  PENDING_SETTLEMENT: "Settling",
  SOLD: "Sold",
  CANCELLED: "Withdrawn",
};

export const ENDED_AWAITING_SETTLEMENT = "Ended — awaiting settlement";

export function listingStatusLabel(listing: {
  status: string;
  ended?: boolean;
}): string {
  const status = listing.status.toUpperCase();
  if (status === "ACTIVE" && listing.ended) return ENDED_AWAITING_SETTLEMENT;
  return LABELS[status] ?? words(status);
}

/** `SETTLEMENT_FAILED` → "Settlement failed". */
function words(status: string): string {
  const text = status.toLowerCase().replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
