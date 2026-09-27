package account

import (
	"time"

	"github.com/google/uuid"
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
		return nil, ErrCorruptAccountState
	}

	return &account, nil
}

// places hold through account aggregate root, birthing the WalletHold without exposing
// the access externally.
func (a *Account) PlaceHold(id uuid.UUID, amount int, bidId uuid.UUID, expiresAt time.Time, now time.Time) error {
	// validate new amount of gold held checks out across holds and account's
	availableGold := a.getAvailableGold()

	if availableGold < amount {
		return ErrHoldsExceedBalance
	}

	// attempt to birth wallethold, validates through invariants internally
	// id is the hold's own; the account is this aggregate. Passing id as the
	// account once stamped every hold with a random account_id
	newHold, err := newWalletHold(id, bidId, a.id, amount, expiresAt, now)
	if err != nil {
		// propogate down domain sentinel error
		return err
	}

	// update holds, placing it in memory, evolving aggregate
	a.holds = append(a.holds, newHold)

	return nil
}

func (a *Account) Deposit(amount int, now time.Time) error {
	if amount <= 0 {
		return ErrInvalidGold
	}
	a.gold += amount
	a.updatedAt = now
	return nil
}

func (a *Account) Withdraw(amount int, now time.Time) error {
	if amount <= 0 {
		return ErrInvalidGold
	}
	availableGold := a.getAvailableGold()

	if availableGold < amount {
		return ErrHoldsExceedBalance
	}

	a.gold -= amount
	a.updatedAt = now

	return nil
}

// CommitHold is settlement's pivot (FS-NXP1W §Req 28): the hold for bidID moves
// RESERVED -> COMMITTED and the account is debited by the hold's own amount.
// expectedAmount is the caller's figure, used only as a cross-check. Returns the
// amount actually committed.
func (a *Account) CommitHold(bidID uuid.UUID, expectedAmount int, now time.Time) (int, error) {
	h := a.findHoldByBidID(bidID)

	if h == nil {
		return 0, ErrHoldNotFound
	}

	// checked before the already-applied shortcut, so a retry carrying a
	// different figure is refused too rather than quietly reported as success
	if h.amount != expectedAmount {
		return 0, ErrHoldAmountMismatch
	}

	// already applied: the activity's own retry catching up. Same output, and
	// no second debit
	if h.status == StatusCommitted {
		return h.amount, nil
	}

	// after the shortcut on purpose: a hold committed in time is still applied
	// however late its retry arrives, but a reserved one past expiry no longer
	// protects the gold
	if now.After(h.expiredAt) {
		return 0, ErrHoldExpired
	}

	// unreachable while holds are correct — Reconstitute refuses an account whose
	// holds exceed its gold — so reaching it means an invariant already broke.
	// Checked before the transition so the hold is left untouched.
	if a.gold < h.amount {
		return 0, ErrInsufficientGold
	}

	// transition to commit and update hold
	if err := h.transitionTo(StatusCommitted, now); err != nil {
		return 0, err
	}

	// deduct gold from total
	a.gold = a.gold - h.amount
	a.updatedAt = now

	return h.amount, nil
}

// ReleaseHold is wallet's share of the pre-pivot rollback (FS-NXP1W §Req 12): the
// hold for bidID moves RESERVED -> RELEASED and the gold it was fencing off becomes
// available again. No gold moves — availability is derived from the RESERVED holds,
// so dropping out of RESERVED is the whole effect.
//
// A hold already RELEASED is success: the rollback is retried without a cap, so it
// has to survive re-running. A COMMITTED hold is refused by the FSM, and that
// refusal is load-bearing — past the pivot the gold is spent and there is no
// ReverseCommit to undo it with (ADR-0017, §Req 15).
func (a *Account) ReleaseHold(bidID uuid.UUID, now time.Time) error {
	h := a.findHoldByBidID(bidID)

	if h == nil {
		return ErrHoldNotFound
	}

	// the rollback's own retry catching up
	if h.status == StatusReleased {
		return nil
	}

	if err := h.transitionTo(StatusReleased, now); err != nil {
		return err
	}

	a.updatedAt = now

	return nil
}

// --- Helpers ---

// findHoldByBidID resolves a hold by the bid it was placed against, the only key
// settlement carries. bid_id is UNIQUE, so at most one hold can match.
func (a *Account) findHoldByBidID(bidID uuid.UUID) *WalletHold {
	for _, hold := range a.holds {
		if hold.bidID == bidID {
			return hold
		}
	}

	return nil
}

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
