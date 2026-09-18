package walletactivity

import "github.com/google/uuid"

// ReleaseLosingHoldsActivityName is step 2: every losing bidder's gold goes back.
// The first step of the tail, so it rolls forward — a bidder whose gold is still
// held is a parked settlement, never a failed one.
const ReleaseLosingHoldsActivityName = "ReleaseLosingHolds"

// ReleaseLosingHoldsInput lists the losing bids explicitly and names the winner
// too, so the step is a set difference the workflow decided rather than a query
// wallet re-runs. WinnerBidID makes releasing the winner's committed hold
// impossible even if the list is wrong.
type ReleaseLosingHoldsInput struct {
	ListingID    uuid.UUID   `json:"listing_id"`
	WinnerBidID  uuid.UUID   `json:"winner_bid_id"`
	LosingBidIDs []uuid.UUID `json:"losing_bid_ids"`
}

// ReleaseLosingHoldsOutput reports how many holds this call actually moved. A
// retry that finds them all released returns 0 and is still success.
type ReleaseLosingHoldsOutput struct {
	ReleasedCount int `json:"released_count"`
}
