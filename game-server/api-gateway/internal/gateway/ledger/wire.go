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

type EntryPage struct {
	Entries []Entry `json:"entries"`
	// nillable, nil means no next page
	NextCursor *string `json:"next_cursor"`
}

type Entry struct {
	ID            string    `json:"id"`
	TransactionID string    `json:"transaction_id"`
	AccountID     string    `json:"account_id"`
	Amount        int64     `json:"amount"`
	Direction     string    `json:"direction"`
	CreatedAt     time.Time `json:"created_at"`
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

func entryPageFromProto(res *pb.ListEntriesResponse) *EntryPage {
	// nil dereference guard
	if res == nil {
		return nil
	}

	entries := make([]Entry, 0, len(res.Entries))

	for _, entry := range res.Entries {
		newEntry := Entry{
			ID:        entry.Id,
			AccountID: entry.AccountId,
			Amount:    entry.Amount,
			Direction: entry.Direction,
		}

		if entry.CreatedAt != nil {
			newEntry.CreatedAt = entry.CreatedAt.AsTime()
		}

		entries = append(entries, newEntry)
	}

	return &EntryPage{
		Entries:    entries,
		NextCursor: &res.Pagination.NextCursor,
	}
}
