package ledgeractivity

import "github.com/google/uuid"

// input output types for append ledger related activity
const AppendLedgerActivityName = "AppendLedgerTx"

type AppendLedgerTxInput struct {
	TransactionID uuid.UUID `json:"transaction_id"`
	Reason        string    `json:"reason"`
	Currency      string    `json:"currency"`
	ReferenceID   uuid.UUID `json:"reference_id"`
	Legs          []Leg     `json:"legs"`
}

// Reason values for AppendLedgerTxInput. They mirror ledger_transactions'
// reason CHECK; the ledger refuses any other value as non-retryable. Reason stays
// a plain string on the wire (FS-F9R7Q open question 3).
const (
	// ReasonSettlement is an auction settling (FS-NXP1W step 5).
	ReasonSettlement = "SETTLEMENT"
	ReasonDeposit    = "DEPOSIT"
	ReasonWithdraw   = "WITHDRAW"
	ReasonTransfer   = "TRANSFER"
)

type Leg struct {
	AccountID uuid.UUID `json:"account_id"`
	Amount    int64     `json:"amount"`
	Direction string    `json:"direction"`
}

type AppendLedgerTxOutput struct {
	Applied bool `json:"applied"`
}
