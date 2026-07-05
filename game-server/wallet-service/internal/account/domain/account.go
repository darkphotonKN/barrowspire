package domain

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

// --- Errors ---
var (
	ErrInvalidGold         = errors.New("invalid gold")
	ErrHoldsExceedBalanace = errors.New("holds exceed balace")
)

// --- Domain ---
type Account struct {
	id        uuid.UUID
	memberID  uuid.UUID
	gold      int
	holds     []*WalletHold
	createdAt time.Time
	updatedAt time.Time
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
		updatedAt: time.Now(),
	}, nil
}

type ReconstituteParams struct {
	ID        uuid.UUID
	MemberID  uuid.UUID
	Gold      int
	Holds     []*HoldReconstituteParams
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (account *Account) Reconstitute(params ReconstituteParams) (*Account, error) {
	// check holds invariant checkout for all the holds passed in
	totalGoldHeld := 0
	for _, hold := range params.Holds {
		totalGoldHeld += hold.Amount
	}

	if params.Gold-totalGoldHeld < 0 {
		return nil, ErrHoldsExceedBalanace
	}

	holds := make([]*WalletHold, 0, len(params.Holds))

	// reconstitute each hold
	for _, hold := range params.Holds {
		holds = append(holds, &WalletHold{
			id:        hold.ID,
			accountID: hold.AccountID,
			// fill
		})
	}

	// reconstitute core account from params and validated holds
	reconstitutedAccount := Account{
		id:       params.ID,
		memberID: params.MemberID,
		holds:    holds,
		// fill
	}

	return &reconstitutedAccount, nil
}

func (account *Account) PlaceHold() error {
}
