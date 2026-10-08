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

// ReleaseLosingHoldsOutput reports how many of the listing's losing holds are
// released once the step returns — not how many this call moved. A retried step has
// to answer the same thing every time (Req 9: already applied returns the same output
// the first application would give), so a re-run over holds an earlier attempt
// released still reports them. Counting only this call's work would have a crash
// recovery record that a settlement released nothing, for one that released
// everything.
type ReleaseLosingHoldsOutput struct {
	ReleasedCount int `json:"released_count"`
}
