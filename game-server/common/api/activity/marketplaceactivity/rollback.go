package marketplaceactivity

import "github.com/google/uuid"

// Marketplace's share of the pre-pivot rollback (Req 12). A semantic
// impossibility in 0a, 0b, 1a or 1b undoes everything done so far and ends the
// settlement in a final SETTLEMENT_FAILED. Each action is idempotent and retried
// without a cap, so a rollback never stops halfway.
//
// The FS names the rollback steps by what they do, not by an activity name. These
// names are this package's; rename them here while nothing schedules them yet.
const (
	// MarkSettlementFailedActivityName moves the listing to its terminal
	// SETTLEMENT_FAILED. A listing in that status is never re-settled.
	MarkSettlementFailedActivityName = "MarkSettlementFailed"
	// LoseAllBidsActivityName moves every bid on the listing to LOST, including
	// one already moved to WON by step 1a.
	LoseAllBidsActivityName = "LoseAllBids"
)

type MarkSettlementFailedInput struct {
	ListingID uuid.UUID `json:"listing_id"`
}

type LoseAllBidsInput struct {
	ListingID uuid.UUID `json:"listing_id"`
}
