package account

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

// --- Errors ---
var (
	ErrInvalidAmount = errors.New("invalid amount")
)

// --- State and Constants ---
type WalletHoldStatus string

const (
	StatusCommited WalletHoldStatus = "commited"
	StatusReserved WalletHoldStatus = "reserved"
	StatusReleased WalletHoldStatus = "released"
)

const (
	holdDuration time.Duration = time.Hour * 1
)

// --- Domain ---
type WalletHold struct {
	id        uuid.UUID
	accountID uuid.UUID
	bidID     uuid.UUID
	status    WalletHoldStatus
	amount    int
	expiredAt time.Time
	createdAt time.Time
	updatedAt time.Time
}

// private, only account the aggregate root can access
func newWalletHold(bidID uuid.UUID, accountID uuid.UUID, amount int, now time.Time) (*WalletHold, error) {
	// invariants
	if amount < 0 {
		return nil, ErrInvalidAmount
	}

	if bidID == uuid.Nil {
		return nil, ErrInvalidUUID
	}

	return &WalletHold{
		id:        uuid.New(),
		accountID: accountID,
		bidID:     bidID,
		// initialize with status reserved, always
		status: StatusReserved,
		amount: amount,
		// fixed value of 1 hour for the hold
		expiredAt: now.Add(holdDuration),
		createdAt: now,
		updatedAt: now,
	}, nil
}

type HoldReconstituteParams struct {
	ID        uuid.UUID
	AccountID uuid.UUID
	BidID     uuid.UUID
	Status    WalletHoldStatus
	Amount    int
	ExpiredAt time.Time
	CreatedAt time.Time
	UpdatedAt time.Time
}
