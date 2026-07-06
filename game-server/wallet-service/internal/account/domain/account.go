package domain

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

// --- Errors ---
var (
	ErrInvalidGold         = errors.New("invalid gold")
	ErrInvalidUUID         = errors.New("invalid uuid")
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

func NewAccount(memberID uuid.UUID) (*Account, error) {
	if memberID == uuid.Nil {
		return nil, ErrInvalidUUID
	}

	return &Account{
		id:        uuid.New(),
		memberID:  memberID,
		gold:      0, // new accounts always start with 0 gold
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
			bidID:     hold.BidID,
			status:    hold.Status,
			amount:    hold.Amount,
			expiredAt: hold.ExpiredAt,
			createdAt: hold.CreatedAt,
			updatedAt: hold.UpdatedAt,
		})
	}

	// reconstitute core account from params and validated holds
	reconstitutedAccount := Account{
		id:        params.ID,
		memberID:  params.MemberID,
		holds:     holds,
		gold:      params.Gold,
		createdAt: params.CreatedAt,
		updatedAt: params.UpdatedAt,
	}

	return &reconstitutedAccount, nil
}

// places hold through account aggregate root, birthing the WalletHold without exposing
// the access externally.
func (account *Account) PlaceHold(id uuid.UUID, amount int, bidId uuid.UUID, now time.Time) error {
	// validate account still holds (reconstituted account - attempted hold)
	if account.gold-amount < 0 {
		return ErrHoldsExceedBalanace
	}

	// attempt to birth wallethold, validates through invariants internally
	newHold, err := newWalletHold(bidId, id, amount, now)

	if err != nil {
		// pass down domain sentinel error
		return err
	}

	account.holds = append(account.holds, newHold)

	return nil
}
