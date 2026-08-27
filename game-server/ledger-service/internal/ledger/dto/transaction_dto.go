package dto

import (
	"time"

	"github.com/google/uuid"
)

type TransactionDetails struct {
	TransactionID uuid.UUID   `db:"transaction_id"`
	ReferenceID   uuid.UUID   `db:"reference_id"`
	Reason        string      `db:"reason"`
	Currency      string      `db:"currency"`
	Legs          []LegDetail `db:"-"`
	CreatedAt     time.Time   `db:"created_at"`
}

type LegDetail struct {
	AccountID uuid.UUID `db:"account_id"`
	Amount    int64     `db:"amount"`
	Direction string    `db:"direction"`
}

type ListEntriesDetails struct {
	Entries []EntryDetail
}

type EntryDetail struct {
	ID            uuid.UUID `db:"id"`
	TransactionID uuid.UUID `db:"transaction_id"`
	ReferenceID   uuid.UUID `db:"reference_id"`
	Reason        string    `db:"reason"`
	Currency      string    `db:"currency"`
	AccountID     uuid.UUID `db:"account_id"`
	Amount        string    `db:"amount"`
	Direction     string    `db:"direction"`
	CreatedAt     time.Time `db:"created_at"`
}
