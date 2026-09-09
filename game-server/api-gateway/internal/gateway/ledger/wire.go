package ledger

import (
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/ledger"
	"time"
)

type Transaction struct {
	TransactionID string    `json:"transaction_id"`
	ReferenceID   string    `json:"reference_id"`
	Reason        string    `json:"reason"`
	Currency      string    `json:"currency"`
	Legs          []Leg     `json:"legs"`
	CreatedAt     time.Time `json:"created_at"`
}

type Leg struct {
	AccountID string `json:"account_id"`
	Amount    int64  `json:"amount"`
	Direction string `json:"direction"`
}

// mappers
func transactionFromProto(res *pb.GetTransactionResponse) *Transaction {
	if res == nil {
		return nil
	}

	legs := make([]Leg, 0, len(res.Legs))

	for _, leg := range res.Legs {
		legs = append(legs, Leg{
			AccountID: leg.AccountId,
			Amount:    leg.Amount,
			Direction: leg.Direction,
		})
	}

	transaction := &Transaction{
		TransactionID: res.TransactionId,
		ReferenceID:   res.ReferenceId,
		Reason:        res.Reason,
		Currency:      res.Currency,
		Legs:          legs,
	}

	if res.CreatedAt != nil {
		transaction.CreatedAt = res.CreatedAt.AsTime()
	}

	return transaction
}
