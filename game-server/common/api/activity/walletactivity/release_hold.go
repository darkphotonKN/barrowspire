package walletactivity

import "github.com/google/uuid"

// ReleaseHoldActivityName gives back one bid's reservation: the compensating half of
// PlaceHold, for a bid marketplace has proven was never recorded, or one that has
// since left the auction. Retried without a cap, so the gold is never left stranded.
const ReleaseHoldActivityName = "ReleaseHold"

// ReleaseHoldInput names the one bid whose hold goes back. BidID is the whole lookup:
// wallet finds the hold by the id marketplace minted for it. ListingID rides along for
// logging only — wallet has no listing concept to look anything up by.
//
// No output. Releasing succeeds alike whether this attempt moved the hold, an earlier
// one already did, or there was never a hold at all, so there is nothing to report.
type ReleaseHoldInput struct {
	ListingID uuid.UUID `json:"listing_id"`
	BidID     uuid.UUID `json:"bid_id"`
}
