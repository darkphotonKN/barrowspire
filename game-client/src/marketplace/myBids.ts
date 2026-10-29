/**
 * How a row reads under My bids (FS-EYQ8K req 15–18): one row per bid the player placed, the relic
 * it is on, where its auction stands and whether they lead. Pure, so the page only wires it.
 */

import type { components } from "@/api/generated/schema";
import type { BrowsePage } from "./browse";
import { formatGold } from "./gold";
import { buyoutBadge } from "./rows";
import { ENDED, formatTimeLeft } from "./timeLeft";

/** One of the player's bids as the gateway sends it, listing summary and item joined. */
export type MyBid = components["schemas"]["MyBid"];
type MyBidPage = components["schemas"]["MyBidPage"];

/** A bid keyed by its own id, so the listing pager and reducer page it unchanged. */
export type MyBidEntry = MyBid & { id: string };

/** The empty My bids view (req 17), in the voice of the other empty states. */
export const NO_BIDS = "You have no bids.";

const LABELS: Record<string, string> = {
  WINNING: "Leading",
  OUTBID: "Outbid",
  PENDING: "Placing…",
  WON: "Won",
  LOST: "Lost",
};

/** Req 16. A status the page has no copy for is shown as its words, never hidden. */
export function bidStatusLabel(status: string): string {
  const key = status.toUpperCase();
  if (LABELS[key]) return LABELS[key];
  const text = key.toLowerCase().replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A page of bids in the shape the listing pager reads: each row keyed by its bid id. */
export function bidPage(page: MyBidPage): BrowsePage<MyBidEntry> {
  return {
    listings: page.bids.map((bid) => ({ ...bid, id: bid.bidId })),
    nextCursor: page.nextCursor,
  };
}

export interface MyBidRow {
  status: string;
  /** Leading or won: the bid that stands. Brass-bright, never amber. */
  emphasis: boolean;
  /** The player's own bid. */
  amount: { gold: string; opening: false };
  /** What the auction stands at now, anyone's; absent when nobody leads. */
  price?: { gold: string; opening: false };
  /** `Buyout {price}` when the seller set one (FS-49Z37 req 3). */
  buyout?: string;
  /** Still taking bids: ACTIVE, not ended by the server's word or by the countdown. */
  live: boolean;
  timeLeft: string;
}

/** Still taking bids: ACTIVE, and not ended by the server's word or by the countdown. */
export function listingLive(
  listing: Pick<MyBid["listing"], "status" | "ended" | "endsAt">,
  now: number,
): boolean {
  return (
    listing.status.toUpperCase() === "ACTIVE" && !listing.ended && Date.parse(listing.endsAt) > now
  );
}

export function myBidRow(bid: Omit<MyBid, "item">, now: number): MyBidRow {
  const { listing } = bid;
  const live = listingLive(listing, now);
  const status = bid.status.toUpperCase();
  return {
    status: bidStatusLabel(bid.status),
    emphasis: status === "WINNING" || status === "WON",
    amount: { gold: formatGold(bid.amount), opening: false },
    price:
      listing.currentPrice === undefined
        ? undefined
        : { gold: formatGold(listing.currentPrice), opening: false },
    buyout: buyoutBadge(listing),
    live,
    timeLeft: live ? formatTimeLeft(listing.endsAt, now) : ENDED,
  };
}
