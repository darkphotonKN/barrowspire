package account

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

// --- Errors ---
var (
	ErrInvalidGold            = errors.New("invalid gold")
	ErrInvalidUUID            = errors.New("invalid uuid")
	ErrHoldsExceedBalanace    = errors.New("holds exceed balace")
	ErrConcurrentModification = errors.New("concurrent modification")
)

// --- Domain ---
type Account struct {
	id        uuid.UUID
	memberID  uuid.UUID
	gold      int
	holds     []*WalletHold
	createdAt time.Time
	updatedAt time.Time

	// version
	// used for optimistic locking, important in all roots of DDD hexagonal
	// architecture for preventing check, modify, then act races.
	// retries will be costly due to a host of wasted work if there is high
	// contention on a single resource as every time a race is caught with this
	// version a retry is needed, and causes a retry storm. Prevent with
	// standard race prevention mechanisms like row lock or isolation: serializable
	// based on the situation
	version int
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
		version:   0, // births with 0, all aggregate roots start with 0
	}, nil
}

type ReconstituteParams struct {
	ID        uuid.UUID
	MemberID  uuid.UUID
	Gold      int
	Holds     []*HoldReconstituteParams
	Version   int
	CreatedAt time.Time
	UpdatedAt time.Time
}

func Reconstitute(params ReconstituteParams) (*Account, error) {
	// check holds invariant checkout for all the holds passed in
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
	account := Account{
		id:        params.ID,
		memberID:  params.MemberID,
		holds:     holds,
		gold:      params.Gold,
		createdAt: params.CreatedAt,
		updatedAt: params.UpdatedAt,
		version:   params.Version,
	}

	// run cross holds invariant validation
	available := account.getAvailableGold()
	if available < 0 {
		return nil, ErrHoldsExceedBalanace
	}

	return &account, nil
}

// places hold through account aggregate root, birthing the WalletHold without exposing
// the access externally.
func (a *Account) PlaceHold(id uuid.UUID, amount int, bidId uuid.UUID, now time.Time) error {
	// validate new amount of gold held checks out across holds and account's
	availableGold := a.getAvailableGold()

	if availableGold < amount {
		return ErrHoldsExceedBalanace
	}

	// attempt to birth wallethold, validates through invariants internally
	newHold, err := newWalletHold(bidId, id, amount, now)

	if err != nil {
		// propogate down domain sentinel error
		return err
	}

	// update holds, placing it in memory, evolving aggregate
	a.holds = append(a.holds, newHold)

	return nil
}

// --- Helpers ---

// validates total holds amount does not exceed available gold in account
func (a *Account) getAvailableGold() int {
	totalGoldHeld := 0
	for _, hold := range a.holds {
		// skip holds that shouldn't count
		if hold.status != StatusReserved {
			continue
		}
		totalGoldHeld += hold.amount
	}

	return a.gold - totalGoldHeld
}

// snapshot exposes fields for external use, with no path to write fields
type AccountSnapshot struct {
	ID          uuid.UUID
	MemberID    uuid.UUID
	Gold        int
	Version     int
	WalletHolds []WalletHoldSnapshot
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (a *Account) Snapshot() AccountSnapshot {
	holds := make([]WalletHoldSnapshot, 0, len(a.holds))

	for _, hold := range a.holds {
		holds = append(holds, WalletHoldSnapshot{
			ID:        hold.id,
			AccountID: hold.accountID,
			BidID:     hold.bidID,
			Status:    hold.status,
			Amount:    hold.amount,
			ExpiredAt: hold.expiredAt,
			CreatedAt: hold.createdAt,
			UpdatedAt: hold.updatedAt,
		})
	}

	return AccountSnapshot{
		ID:          a.id,
		MemberID:    a.memberID,
		Gold:        a.gold,
		Version:     a.version,
		WalletHolds: holds,
		CreatedAt:   a.createdAt,
		UpdatedAt:   a.updatedAt,
	}
}
