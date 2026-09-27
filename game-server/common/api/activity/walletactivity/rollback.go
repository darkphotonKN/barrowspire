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

// ReleaseAllHoldsInput names the bids whose holds to release, the same shape as
// ReleaseLosingHoldsInput: the set is one the workflow decided, not one wallet
// re-derives.
//
// It cannot be otherwise. wallet_holds carries bid_id as a soft reference and has no
// listing dimension at all — wallet does not know what a listing is — so there is no
// query by which wallet could sweep "every hold on the listing". ListingID rides
// along for logging and for the idempotency of the step, not as a lookup key.
type ReleaseAllHoldsInput struct {
	ListingID uuid.UUID   `json:"listing_id"`
	BidIDs    []uuid.UUID `json:"bid_ids"`
}
