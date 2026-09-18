package marketplaceactivity

import "github.com/google/uuid"

// SetWinningBidActivityName is step 1a: the winning bid moves WINNING -> WON.
// The last step before the pivot, and the last one a rollback can undo.
const SetWinningBidActivityName = "SetWinningBid"

type SetWinningBidInput struct {
	ListingID   uuid.UUID `json:"listing_id"`
	WinnerBidID uuid.UUID `json:"winner_bid_id"`
}
