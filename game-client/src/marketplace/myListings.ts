/**
 * How a row reads under Mine (FS-8EGFA req 23): the player's listings in every status. The status
 * label replaces the Bid action, and only a live auction counts down. A withdrawable one also
 * offers Withdraw (FS-V7A5S req 14).
 */

import { formatGold } from "./gold";
import { listingStatusLabel } from "./listingStatus";
import { buyoutBadge } from "./rows";
import { ENDED, formatTimeLeft } from "./timeLeft";
import { listingWithdrawable } from "./withdrawListing";

export interface MineListing {
  status: string;
  ended?: boolean;
  endsAt: string;
  startPrice: number;
  currentPrice?: number;
  soldPrice?: number;
  buyoutPrice?: number;
  bidCount: number;
}

export interface MineRow {
  status: string;
  /** Still taking bids: ACTIVE, not ended by the server's word or by the countdown. */
  live: boolean;
  timeLeft: string;
  price: { gold: string; opening: boolean };
  /** `Buyout {price}` when the seller set one (FS-49Z37 req 3). */
  buyout?: string;
  /** The seller may withdraw it now (FS-V7A5S req 14). */
  withdraw: boolean;
}

export function mineRow(listing: MineListing, now: number): MineRow {
  const active = listing.status.toUpperCase() === "ACTIVE";
  const live = active && !listing.ended && Date.parse(listing.endsAt) > now;
  const gold = listing.soldPrice ?? listing.currentPrice;
  return {
    // A countdown that ran out while shown ends the listing now, not at the server's next word.
    status: listingStatusLabel({ status: listing.status, ended: active && !live }),
    live,
    timeLeft: live ? formatTimeLeft(listing.endsAt, now) : active ? ENDED : "—",
    price: {
      gold: formatGold(gold ?? listing.startPrice),
      opening: gold === undefined,
    },
    buyout: buyoutBadge(listing),
    withdraw: listingWithdrawable(listing, now),
  };
}
