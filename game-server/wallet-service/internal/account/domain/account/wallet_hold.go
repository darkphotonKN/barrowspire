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
	StatusCommitted WalletHoldStatus = "COMMITTED"
	StatusReserved  WalletHoldStatus = "RESERVED"
	StatusReleased  WalletHoldStatus = "RELEASED"
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
func newWalletHold(id uuid.UUID, bidID uuid.UUID, accountID uuid.UUID, amount int, expiresAt time.Time, now time.Time) (*WalletHold, error) {
	// invariants
	if amount <= 0 {
		return nil, ErrInvalidAmount
	}

	if bidID == uuid.Nil {
		return nil, ErrInvalidUUID
	}

	// a hold that is already expired protects nothing: the sweeper may release
	// it before settlement can commit it
	if !expiresAt.After(now) {
		return nil, ErrInvalidHoldExpiry
	}

	return &WalletHold{
		id:        id,
		accountID: accountID,
		bidID:     bidID,
		// initialize with status reserved, always
		status: StatusReserved,
		amount: amount,
		// the caller's: listing expiry plus settlement grace (FS-NXP1W §Req 19)
		expiredAt: expiresAt,
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

type WalletHoldSnapshot struct {
	ID        uuid.UUID
	AccountID uuid.UUID
	BidID     uuid.UUID
	Status    WalletHoldStatus
	Amount    int
	ExpiredAt time.Time
	CreatedAt time.Time
	UpdatedAt time.Time
}
