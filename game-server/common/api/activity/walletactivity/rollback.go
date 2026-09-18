package walletactivity

import "github.com/google/uuid"

// ReleaseAllHoldsActivityName is wallet's share of the pre-pivot rollback (Req 12):
// every RESERVED hold on the listing is released, the winner's included. Idempotent
// and retried without a cap, so a rollback never leaves a bidder's gold stuck.
//
// It runs only before the pivot. Past it the winner's hold is COMMITTED, and there
// is no ReverseCommit (ADR-0017, Req 15) — releasing a committed hold is not a
// thing this contract can express.
//
// The FS names this step by what it does, not by an activity name. The name is
// this package's; rename it here while nothing schedules it yet.
const ReleaseAllHoldsActivityName = "ReleaseAllHolds"

// ReleaseAllHoldsInput takes the listing rather than a bid list: a rollback runs
// when the workflow's own view of the bids may be exactly what went wrong, so
// wallet sweeps its own records instead of trusting a list.
type ReleaseAllHoldsInput struct {
	ListingID uuid.UUID `json:"listing_id"`
}
