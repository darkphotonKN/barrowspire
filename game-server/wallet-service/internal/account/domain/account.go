package domain

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

// --- Errors ---
var (
	ErrInvalidGold = errors.New("invalid gold")
)

// --- Domain ---
type Account struct {
	id        uuid.UUID
	memberID  uuid.UUID
	gold      int
	createdAt time.Time
}

func NewAccount(memberID uuid.UUID, gold int) (*Account, error) {
	if gold < 0 {
		return nil, ErrInvalidGold
	}

	return &Account{
		id:        uuid.New(),
		memberID:  memberID,
		gold:      gold,
		createdAt: time.Now(),
	}, nil
}
