package ledger

import (
	"errors"

	"github.com/google/uuid"
)

// --- Errors ---
var (
	ErrInvalidUUID           = errors.New("invalid uuid")
	ErrUnbalancedTransaction = errors.New("unbalanced transaction")
	ErrInvalidLegCount       = errors.New("invalid leg count")
	ErrInvalidLegAmount      = errors.New("invalid leg amount")
	ErrInvalidDirection      = errors.New("invalid direction")
	ErrInvalidCurrency       = errors.New("invalid currency")
	ErrInvalidReason         = errors.New("invalid reason")
)

// --- Domain ---

// Transaction is the aggregate root of this bounded context: one economic event
// and the legs that make it balance.
//
// There is no version field. An append-only record performs no read-modify-write,
// so optimistic concurrency would guard nothing.
type Transaction struct {
	transactionID uuid.UUID
	referenceID   uuid.UUID
	reason        TransactionReason
	currency      CurrencyType
	legs          []Leg
}

type Leg struct {
	accountID uuid.UUID
	direction Direction
	amount    int64
}

type LegInput struct {
	AccountID uuid.UUID
	Direction Direction
	Amount    int64
}

func NewTransaction(transactionID uuid.UUID, referenceID uuid.UUID, reason TransactionReason, currency CurrencyType, legs []LegInput) (*Transaction, error) {

	if currency != CurrencyGold {
		return nil, ErrInvalidCurrency
	}

	if reason != ReasonDeposit && reason != ReasonTransfer && reason != ReasonWithdraw && reason != ReasonSettleAuction {
		return nil, ErrInvalidReason
	}

	if transactionID == uuid.Nil {
		return nil, ErrInvalidUUID
	}

	if referenceID == uuid.Nil {
		return nil, ErrInvalidUUID
	}

	noOfLegs := len(legs)

	if noOfLegs < 2 {
		return nil, ErrInvalidLegCount
	}

	// map to private legs
	l := make([]Leg, 0, noOfLegs)
	for _, leg := range legs {
		if leg.Amount <= 0 {
			return nil, ErrInvalidLegAmount
		}

		l = append(l, Leg{
			accountID: leg.AccountID,
			direction: leg.Direction,
			amount:    leg.Amount,
		})
	}

	// validate legs sum to 0
	var sum int64 = 0
	for _, leg := range l {
		if leg.direction == DirectionDebit {
			sum -= leg.amount
			continue
		}
		if leg.direction == DirectionCredit {
			sum += leg.amount
			continue
		}
		return nil, ErrInvalidDirection
	}

	// validate ledger legs sum up to 0
	if sum != 0 {
		return nil, ErrUnbalancedTransaction
	}

	return &Transaction{
		transactionID: transactionID,
		referenceID:   referenceID,
		reason:        reason,
		currency:      currency,
		legs:          l,
	}, nil
}

// snapshot exposes fields for external use, with no path to write fields
type LegSnapshot struct {
	AccountID uuid.UUID
	Direction Direction
	Amount    int64
}

type LedgerSnapshot struct {
	TransactionID uuid.UUID
	ReferenceID   uuid.UUID
	Reason        TransactionReason
	Currency      CurrencyType
	Legs          []LegSnapshot
}

func (t *Transaction) Snapshot() LedgerSnapshot {
	legs := make([]LegSnapshot, 0, len(t.legs))

	for _, leg := range t.legs {
		legs = append(legs, LegSnapshot{
			AccountID: leg.accountID,
			Direction: leg.direction,
			Amount:    leg.amount,
		})
	}

	return LedgerSnapshot{
		TransactionID: t.transactionID,
		ReferenceID:   t.referenceID,
		Reason:        t.reason,
		Currency:      t.currency,
		Legs:          legs,
	}
}

// --- Ledger transaction: state and constants ---

// TransactionReason is why gold moved. Values mirror the ledger_transactions
// reason CHECK exactly — a new reason is a migration plus a constant, in that
// order, deliberately.
type TransactionReason string

const (
	ReasonSettleAuction TransactionReason = "SETTLE_AUCTION"
	ReasonDeposit       TransactionReason = "DEPOSIT"
	ReasonWithdraw      TransactionReason = "WITHDRAW"
	ReasonTransfer      TransactionReason = "TRANSFER"
)

// CurrencyType is a transaction-level fact: every leg of a transaction shares
// one currency, because sum-to-zero across mixed currencies is meaningless.
type CurrencyType string

const (
	CurrencyGold CurrencyType = "GOLD"
)

// Direction carries the sign, so amounts are always positive.
type Direction string

const (
	DirectionDebit  Direction = "DEBIT"
	DirectionCredit Direction = "CREDIT"
)
