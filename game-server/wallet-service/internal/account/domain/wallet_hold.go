package domain

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

var (
	StatusCommited WalletHoldStatus = "status_commited"
	StatusReserved WalletHoldStatus = "status_reserved"
	StatusReleased WalletHoldStatus = "status_released"
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
func newWalletHold(bidID uuid.UUID, accountID uuid.UUID, amount int) (*WalletHold, error) {
	if amount < 0 {
		return nil, ErrInvalidAmount
	}

	now := time.Now()

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
