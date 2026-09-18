package walletactivity

import "github.com/google/uuid"

// CreditSellerActivityName is step 3: the sale proceeds reach the seller. The gap
// between the pivot and this step is the intended escrow window.
const CreditSellerActivityName = "CreditSeller"

// CreditSellerInput names the seller by member; wallet resolves the account. The
// credit is the only saga step with no prior hold to make it idempotent, so the
// caller mints the key (ADR-0009): workflow ID plus activity name, which is stable
// across every retry and replay of the same settlement.
type CreditSellerInput struct {
	SellerID       uuid.UUID `json:"seller_id"`
	Amount         int64     `json:"amount"`
	IdempotencyKey string    `json:"idempotency_key"`
}

// CreditSellerOutput gives the workflow the seller's account ID for the ledger
// legs, in the same way CommitHoldOutput gives it the buyer's.
type CreditSellerOutput struct {
	SellerWalletAccountID uuid.UUID `json:"seller_wallet_account_id"`
}
