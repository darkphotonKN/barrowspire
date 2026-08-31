package repository

import (
	"time"

	"github.com/google/uuid"
)

// The persistence-facing shapes of the two ledger tables: one struct per table,
// fields in column order, `db` tags naming the columns from
// migrations/000001_create_ledger_transactions_and_entries.up.sql exactly.
//
// These are rows, not domain types. They hold no invariant — sum-to-zero, the
// closed reason and direction sets, and the positivity of amount are all
// enforced in domain/ledger before anything reaches here, and again by the
// table CHECKs after. That is why reason, currency and direction are plain
// strings: a value type on a row would imply the row validates something, and
// it does not. The domain's string-backed value types (ledger.TransactionReason,
// ledger.CurrencyType, ledger.Direction) convert at the edge, per FS-0003
// §Open question 3.

// LedgerTransaction is one row of ledger_transactions: the economic event that
// a set of legs belongs to. Its fields are transaction-level facts —
// notably currency, which is one per transaction rather than one per leg,
// because sum-to-zero across mixed currencies is meaningless (§Req 8).
//
// TransactionID is caller-minted and has no DEFAULT: it is the sole idempotency
// guard, so the ledger never mints one (ADR-0009, §Open question 1).
type LedgerTransaction struct {
	TransactionID uuid.UUID `db:"transaction_id"`
	Reason        string    `db:"reason"`
	ReferenceID   uuid.UUID `db:"reference_id"`
	Currency      string    `db:"currency"`
	CreatedAt     time.Time `db:"created_at"`
}

// LedgerEntry is one row of ledger_entries: the persisted form of a leg. It is
// deliberately wider than a domain Leg — id, transaction_id and created_at are
// what let an entry stand alone on the read path, where a leg cannot.
//
// Amount is int64 and always positive; direction carries the sign, so a signed
// amount is unrepresentable rather than merely rejected (§Req 6, ADR-0008). It
// is not an unsigned Go type: the positivity is the DB CHECK's and the domain's
// to state, and uint64 would only move an overflow into the driver.
//
// AccountID is a soft reference to wallet-service's accounts.id (§Req 15) —
// a key this context stores and matches on, with no FK, no join and no
// existence check. An entry naming an account wallet has never heard of is
// valid here and is a reconciler finding, not a write-time error.
type LedgerEntry struct {
	ID            uuid.UUID `db:"id"`
	TransactionID uuid.UUID `db:"transaction_id"`
	AccountID     uuid.UUID `db:"account_id"`
	Direction     string    `db:"direction"`
	Amount        int64     `db:"amount"`
	CreatedAt     time.Time `db:"created_at"`
}
