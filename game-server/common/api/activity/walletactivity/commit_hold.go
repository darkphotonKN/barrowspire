// Package walletactivity is wallet-service's half of the settlement activity
// contract (ADR-0019): the activity names the workflow schedules and the payloads
// it passes, for the steps wallet itself owns and executes.
//
// Changes are additive only. Never remove a field, retype one, or change a JSON
// tag: Temporal replays live histories against these definitions.
package walletactivity

import "github.com/google/uuid"

// CommitHoldActivityName is step 1b, the pivot (ADR-0010): the buyer's hold moves
// RESERVED -> COMMITTED and the account is debited in one save. It is the first
// step that moves real gold. Everything before it can roll back; nothing after it
// does.
const CommitHoldActivityName = "CommitHold"

// CommitHoldInput keys the pivot on the winning bid, not on an account: the hold
// is wallet's own record and marketplace never learns account IDs from wallet's
// data model.
//
// ExpectedAmount is a cross-check, not the amount debited. Wallet debits the
// hold's own amount; a mismatch is raised loudly rather than reconciled.
type CommitHoldInput struct {
	WinnerBidID    uuid.UUID `json:"winner_bid_id"`
	ExpectedAmount int64     `json:"expected_amount"`
}

// CommitHoldOutput gives the workflow the buyer's account ID to pass straight to
// the ledger legs, and the amount actually committed.
//
// A hold already COMMITTED returns this same output and moves no gold, so a retry
// that catches up is indistinguishable from the first application.
type CommitHoldOutput struct {
	BuyerWalletAccountID uuid.UUID `json:"buyer_wallet_account_id"`
	CommittedAmount      int64     `json:"committed_amount"`
}
