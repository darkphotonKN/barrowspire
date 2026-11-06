import type { components } from "@/api/generated/schema";

/**
 * One listing as the seller's own read sends it (list-my-listings), item joined (FS-8EGFA req 21):
 * it keeps the member ids and the sold price, because the seller is a party to the sale
 * (FS-GKHYD Req 3).
 */
export type Listing = components["schemas"]["Listing"];

/**
 * One listing as the public reads send it (browse-listings, get-listing), item joined. No member
 * ids and no sold price; `own` says whether the signed-in viewer is its seller (FS-GKHYD Req 1–2).
 */
export type PublicListing = components["schemas"]["PublicListing"];

/**
 * Whether the viewer is the listing's seller (FS-GKHYD Req 13): the read's `own`, and only for a
 * signed-in viewer, so a stale read marked own never makes a signed-out viewer the seller. The
 * one rule every "is this mine" check uses: the browse row, the detail's action area and its
 * seller block.
 */
export function viewerOwns(listing: { own: boolean }, memberId: string | undefined): boolean {
  return Boolean(memberId) && listing.own;
}
