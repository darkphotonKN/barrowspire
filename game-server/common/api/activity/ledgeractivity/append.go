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

type Leg struct {
	AccountID uuid.UUID `json:"account_id"`
	Amount    int64     `json:"amount"`
	Direction string    `json:"direction"`
}

type AppendLedgerTxOutput struct {
	Applied bool `json:"applied"`
}
