package account

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestPlaceHoldAmountInvariant pins the "amount > 0" hold-birth invariant.
// A zero-gold hold reserves nothing yet would still consume the UNIQUE(bid_id)
// slot for that bid, so it must be rejected the same way a negative one is.
func TestPlaceHoldAmountInvariant(t *testing.T) {
	tests := []struct {
		name    string
		amount  int
		wantErr error
	}{
		{name: "negative amount is rejected", amount: -1, wantErr: ErrInvalidAmount},
		{name: "zero amount is rejected", amount: 0, wantErr: ErrInvalidAmount},
		{name: "positive amount within balance is accepted", amount: 1, wantErr: nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			acc := accountWithGold(t, 100)

			err := acc.PlaceHold(uuid.New(), tt.amount, uuid.New(), holdExpiry(), time.Now())

			if tt.wantErr != nil {
				assert.ErrorIs(t, err, tt.wantErr)
				assert.Empty(t, acc.Snapshot().WalletHolds, "a rejected hold must not be appended")
				return
			}

			require.NoError(t, err)
			assert.Len(t, acc.Snapshot().WalletHolds, 1)
		})
	}
}

// TestPlaceHoldLifetimeInvariant covers the balance guard: the sum of RESERVED
// holds can never exceed the account's gold.
func TestPlaceHoldLifetimeInvariant(t *testing.T) {
	t.Run("hold equal to the full balance is allowed", func(t *testing.T) {
		acc := accountWithGold(t, 100)

		require.NoError(t, acc.PlaceHold(uuid.New(), 100, uuid.New(), holdExpiry(), time.Now()))
	})

	t.Run("hold exceeding the balance is rejected", func(t *testing.T) {
		acc := accountWithGold(t, 100)

		err := acc.PlaceHold(uuid.New(), 101, uuid.New(), holdExpiry(), time.Now())

		assert.ErrorIs(t, err, ErrHoldsExceedBalance)
	})

	t.Run("holds accumulate against available gold", func(t *testing.T) {
		acc := accountWithGold(t, 100)
		require.NoError(t, acc.PlaceHold(uuid.New(), 60, uuid.New(), holdExpiry(), time.Now()))

		// 60 already reserved, so only 40 remains available
		err := acc.PlaceHold(uuid.New(), 41, uuid.New(), holdExpiry(), time.Now())

		assert.ErrorIs(t, err, ErrHoldsExceedBalance)
		assert.Len(t, acc.Snapshot().WalletHolds, 1, "the rejected hold must not be appended")
	})
}

// TestNewHoldIsBornReserved pins the hold FSM's starting state.
func TestNewHoldIsBornReserved(t *testing.T) {
	acc := accountWithGold(t, 100)

	require.NoError(t, acc.PlaceHold(uuid.New(), 10, uuid.New(), holdExpiry(), time.Now()))

	holds := acc.Snapshot().WalletHolds
	require.Len(t, holds, 1)
	assert.Equal(t, StatusReserved, holds[0].Status)
}

// TestDepositAmountInvariant pins the "amount > 0" guard on Deposit. A zero or
// negative deposit is not a no-op to be tolerated — it is a malformed request,
// and letting a negative one through would turn Deposit into an unguarded
// withdrawal that bypasses the available-balance check entirely.
func TestDepositAmountInvariant(t *testing.T) {
	tests := []struct {
		name     string
		amount   int
		wantErr  error
		wantGold int
	}{
		{name: "negative amount is rejected", amount: -1, wantErr: ErrInvalidGold, wantGold: 100},
		{name: "zero amount is rejected", amount: 0, wantErr: ErrInvalidGold, wantGold: 100},
		{name: "positive amount is credited", amount: 50, wantErr: nil, wantGold: 150},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			acc := accountWithGold(t, 100)

			err := acc.Deposit(tt.amount, time.Now())

			if tt.wantErr != nil {
				assert.ErrorIs(t, err, tt.wantErr)
			} else {
				require.NoError(t, err)
			}

			// asserted on both paths: a rejected deposit must leave the
			// balance untouched, not merely return an error after mutating.
			assert.Equal(t, tt.wantGold, acc.Snapshot().Gold)
		})
	}
}

// TestDepositStampsUpdatedAt covers the timestamp the repository persists.
// Save writes updated_at from the after-snapshot, so a verb that forgets to
// advance it leaves the column frozen at the value the row was loaded with —
// the balance changes but the row claims it never did.
func TestDepositStampsUpdatedAt(t *testing.T) {
	acc := accountWithGold(t, 100)
	now := time.Now().Add(time.Hour)

	require.NoError(t, acc.Deposit(50, now))

	assert.Equal(t, now, acc.Snapshot().UpdatedAt)
}

// TestWithdrawAmountInvariant pins the "amount > 0" guard on Withdraw. This is
// a distinct failure from an unaffordable withdrawal: a bad amount is a
// malformed request (ErrInvalidGold -> InvalidArgument), while an unaffordable
// one is a valid request the account state refuses (ErrHoldsExceedBalance ->
// FailedPrecondition). Collapsing them would report "out of gold" as "bad input".
func TestWithdrawAmountInvariant(t *testing.T) {
	tests := []struct {
		name     string
		amount   int
		wantErr  error
		wantGold int
	}{
		{name: "negative amount is rejected", amount: -1, wantErr: ErrInvalidGold, wantGold: 100},
		{name: "zero amount is rejected", amount: 0, wantErr: ErrInvalidGold, wantGold: 100},
		{name: "positive amount within balance is debited", amount: 30, wantErr: nil, wantGold: 70},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			acc := accountWithGold(t, 100)

			err := acc.Withdraw(tt.amount, time.Now())

			if tt.wantErr != nil {
				assert.ErrorIs(t, err, tt.wantErr)
			} else {
				require.NoError(t, err)
			}

			assert.Equal(t, tt.wantGold, acc.Snapshot().Gold)
		})
	}
}

// TestWithdrawRespectsHolds is the core guard of this aggregate: gold already
// promised to a RESERVED hold is not spendable. Withdraw must measure against
// available gold (balance - reserved), never the raw balance. Checking the raw
// balance would let a withdrawal drain gold a pending bid is counting on,
// leaving the account over-committed and unloadable — see the reconstitute
// test below for what that failure actually looks like.
func TestWithdrawRespectsHolds(t *testing.T) {
	acc := accountWithGold(t, 100)
	require.NoError(t, acc.PlaceHold(uuid.New(), 60, uuid.New(), holdExpiry(), time.Now()))

	// 60 is reserved, so only 40 is available — 41 must be refused even
	// though the raw balance of 100 would comfortably cover it.
	err := acc.Withdraw(41, time.Now())

	assert.ErrorIs(t, err, ErrHoldsExceedBalance)
	assert.Equal(t, 100, acc.Snapshot().Gold, "a rejected withdrawal must not debit the balance")
}

// TestWithdrawAvailableBoundary is the other half of the pair above: the exact
// available amount must be allowed. Together they pin the boundary at 40/41 so
// an off-by-one in either direction fails.
func TestWithdrawAvailableBoundary(t *testing.T) {
	t.Run("withdrawing exactly the available gold is allowed", func(t *testing.T) {
		acc := accountWithGold(t, 100)
		require.NoError(t, acc.PlaceHold(uuid.New(), 60, uuid.New(), holdExpiry(), time.Now()))

		require.NoError(t, acc.Withdraw(40, time.Now()))
		assert.Equal(t, 60, acc.Snapshot().Gold)
	})

	t.Run("withdrawing the full balance is allowed when nothing is held", func(t *testing.T) {
		acc := accountWithGold(t, 100)

		require.NoError(t, acc.Withdraw(100, time.Now()))
		assert.Equal(t, 0, acc.Snapshot().Gold)
	})
}

// TestWithdrawnStateStillReconstitutes proves the lifetime invariant survives a
// full persistence round trip. Reconstitute re-checks that available gold is
// non-negative and rejects the account outright if it is not, so an account
// drained past its holds could never be loaded again. Snapshotting a
// maximally-withdrawn account and feeding it back is the same path the
// repository takes on the next FindByID.
func TestWithdrawnStateStillReconstitutes(t *testing.T) {
	acc := accountWithGold(t, 100)
	require.NoError(t, acc.PlaceHold(uuid.New(), 60, uuid.New(), holdExpiry(), time.Now()))
	require.NoError(t, acc.Withdraw(40, time.Now()))

	snap := acc.Snapshot()

	// mirror repository/account_repository.go's FindByID, which rebuilds the
	// hold params from persisted rows before handing them to Reconstitute.
	holds := make([]*HoldReconstituteParams, 0, len(snap.WalletHolds))
	for _, hold := range snap.WalletHolds {
		holds = append(holds, &HoldReconstituteParams{
			ID:        hold.ID,
			AccountID: hold.AccountID,
			BidID:     hold.BidID,
			Status:    hold.Status,
			Amount:    hold.Amount,
			ExpiredAt: hold.ExpiredAt,
			CreatedAt: hold.CreatedAt,
			UpdatedAt: hold.UpdatedAt,
		})
	}

	reloaded, err := Reconstitute(ReconstituteParams{
		ID:        snap.ID,
		MemberID:  snap.MemberID,
		Gold:      snap.Gold,
		Holds:     holds,
		Version:   snap.Version,
		CreatedAt: snap.CreatedAt,
		UpdatedAt: snap.UpdatedAt,
	})

	require.NoError(t, err, "withdrawing down to the available balance must not corrupt the account")
	assert.Equal(t, 60, reloaded.Snapshot().Gold)
}

// TestCommitHoldSpendsTheReservedGold is the money test: CommitHold is the only
// path in the aggregate that permanently removes gold from an account. It has to
// do two things together — deduct the amount from the balance and move the hold
// out of RESERVED — because available gold is derived as gold minus RESERVED
// holds. Doing only one of them mis-states the balance: deducting without the
// transition double-counts the spend, and transitioning without the deduction
// hands the buyer their gold back for free.
func TestCommitHoldSpendsTheReservedGold(t *testing.T) {
	bidID := uuid.New()

	acc := accountWithGold(t, 1000)
	require.NoError(t, acc.PlaceHold(uuid.New(), 300, bidID, holdExpiry(), time.Now()))

	// before: the gold is still on the books, but 300 of it is spoken for
	assert.Equal(t, 1000, acc.Snapshot().Gold)
	assert.Equal(t, 700, acc.getAvailableGold(), "a reserved hold is not spendable")

	_, err := acc.CommitHold(bidID, 300, time.Now())
	require.NoError(t, err)

	snap := acc.Snapshot()
	assert.Equal(t, 700, snap.Gold, "committing must actually spend the gold")
	assert.Equal(t, StatusCommitted, snap.WalletHolds[0].Status)

	// available is unchanged across the commit: the 300 left the balance and the
	// hold left RESERVED in the same step, so the buyer neither gains nor loses
	// spending power at settlement
	assert.Equal(t, 700, acc.getAvailableGold())
}

// TestCommitHoldRejectsUnknownHolds covers the guard around the spend: a bid
// the account holds nothing for is refused and moves no gold.
func TestCommitHoldRejectsUnknownHolds(t *testing.T) {
	tests := []struct {
		name string
		// useUnknownBid addresses a bid the account has no hold for
		useUnknownBid bool
		wantErr       error
		wantGold      int
	}{
		{
			name:          "a bid with no hold is rejected",
			useUnknownBid: true,
			wantErr:       ErrHoldNotFound,
			wantGold:      1000,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			bidID := uuid.New()

			acc := accountWithGold(t, 1000)
			require.NoError(t, acc.PlaceHold(uuid.New(), 300, bidID, holdExpiry(), time.Now()))

			target := bidID
			if tt.useUnknownBid {
				target = uuid.New()
			}

			_, err := acc.CommitHold(target, 300, time.Now())

			assert.ErrorIs(t, err, tt.wantErr)
			assert.Equal(t, tt.wantGold, acc.Snapshot().Gold,
				"a rejected commit must not move gold")
		})
	}
}

// TestCommitHoldOnlySettlesTheAddressedHold pins that the bid id actually selects
// which hold is spent. An account can carry several concurrent holds — one per
// bid — so a lookup that matched the wrong one, or the first one, would spend a
// different bid's money.
func TestCommitHoldOnlySettlesTheAddressedHold(t *testing.T) {
	firstBid, secondBid := uuid.New(), uuid.New()

	acc := accountWithGold(t, 1000)
	require.NoError(t, acc.PlaceHold(uuid.New(), 100, firstBid, holdExpiry(), time.Now()))
	require.NoError(t, acc.PlaceHold(uuid.New(), 250, secondBid, holdExpiry(), time.Now()))

	_, err := acc.CommitHold(secondBid, 250, time.Now())
	require.NoError(t, err)

	assert.Equal(t, 750, acc.Snapshot().Gold, "only the addressed hold's amount is spent")

	byBid := map[uuid.UUID]WalletHoldStatus{}
	for _, hold := range acc.Snapshot().WalletHolds {
		byBid[hold.BidID] = hold.Status
	}

	assert.Equal(t, StatusCommitted, byBid[secondBid])
	assert.Equal(t, StatusReserved, byBid[firstBid], "the untouched hold stays reserved")
}

// accountWithGold builds an account holding the given gold. NewAccount always
// starts at 0, so gold is seeded through Reconstitute — the same path the
// repository uses when loading from the database.
func accountWithGold(t *testing.T, gold int) *Account {
	t.Helper()

	acc, err := Reconstitute(ReconstituteParams{
		ID:        uuid.New(),
		MemberID:  uuid.New(),
		Gold:      gold,
		Version:   0,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	require.NoError(t, err)

	return acc
}

// Settlement retries its activities, so a CommitHold that already landed is its
// own retry catching up (FS-NXP1W §Req 28): success, the same amount, no gold
// moved. Refusing it would make the saga fail a pivot that actually happened.
func TestCommitHold_AlreadyCommitted_ReturnsSameAmountWithoutMovingGold(t *testing.T) {
	bidID := uuid.New()
	acc := accountWithGold(t, 1000)
	require.NoError(t, acc.PlaceHold(uuid.New(), 300, bidID, holdExpiry(), time.Now()))
	_, err := acc.CommitHold(bidID, 300, time.Now())
	require.NoError(t, err)

	amount, err := acc.CommitHold(bidID, 300, time.Now())

	require.NoError(t, err)
	assert.Equal(t, 300, amount)
	assert.Equal(t, 700, acc.Snapshot().Gold, "the retry must not debit a second time")
}

// The debit is always the hold's own amount; the caller's figure is only a
// cross-check. A disagreement means one side's record is wrong, so it is refused
// loudly rather than reconciled by trusting either number (FS-NXP1W §Req 28).
func TestCommitHold_AmountMismatch_IsRefusedWithoutMovingGold(t *testing.T) {
	bidID := uuid.New()
	acc := accountWithGold(t, 1000)
	require.NoError(t, acc.PlaceHold(uuid.New(), 300, bidID, holdExpiry(), time.Now()))

	_, err := acc.CommitHold(bidID, 250, time.Now())

	assert.ErrorIs(t, err, ErrHoldAmountMismatch)
	snap := acc.Snapshot()
	assert.Equal(t, 1000, snap.Gold)
	assert.Equal(t, StatusReserved, snap.WalletHolds[0].Status)
}

// Past its expiry a hold no longer protects the gold — the sweeper may release
// it at any moment — so committing it would spend money the buyer may already
// have back (FS-NXP1W §Req 28). A hold committed before it expired is still
// already applied, however late the retry arrives.
func TestCommitHold_Expiry(t *testing.T) {
	placedAt := time.Now()
	afterExpiry := placedAt.Add(time.Hour + time.Minute)

	t.Run("an expired reserved hold is refused without moving gold", func(t *testing.T) {
		bidID := uuid.New()
		acc := accountWithGold(t, 1000)
		require.NoError(t, acc.PlaceHold(uuid.New(), 300, bidID, placedAt.Add(time.Hour), placedAt))

		_, err := acc.CommitHold(bidID, 300, afterExpiry)

		assert.ErrorIs(t, err, ErrHoldExpired)
		snap := acc.Snapshot()
		assert.Equal(t, 1000, snap.Gold)
		assert.Equal(t, StatusReserved, snap.WalletHolds[0].Status)
	})

	t.Run("a hold committed in time stays already applied after expiry", func(t *testing.T) {
		bidID := uuid.New()
		acc := accountWithGold(t, 1000)
		require.NoError(t, acc.PlaceHold(uuid.New(), 300, bidID, placedAt.Add(time.Hour), placedAt))
		_, err := acc.CommitHold(bidID, 300, placedAt)
		require.NoError(t, err)

		amount, err := acc.CommitHold(bidID, 300, afterExpiry)

		require.NoError(t, err)
		assert.Equal(t, 300, amount)
		assert.Equal(t, 700, acc.Snapshot().Gold)
	})
}

// The debit guard is a last line of defence. Reconstitute already refuses an
// account whose reserved holds exceed its gold, so this state is built by hand
// to stand for "an invariant already broke somewhere". Reaching the guard must
// abort the pivot rather than drive the balance negative (FS-NXP1W §Req 28).
func TestCommitHold_GoldBelowTheHold_AbortsWithoutDebiting(t *testing.T) {
	bidID := uuid.New()
	now := time.Now()
	acc := &Account{
		id:   uuid.New(),
		gold: 100,
		holds: []*WalletHold{{
			id:        uuid.New(),
			bidID:     bidID,
			status:    StatusReserved,
			amount:    300,
			expiredAt: now.Add(time.Hour),
		}},
	}

	_, err := acc.CommitHold(bidID, 300, now)

	assert.ErrorIs(t, err, ErrInsufficientGold)
	assert.Equal(t, 100, acc.Snapshot().Gold, "the balance must never go negative")
	assert.Equal(t, StatusReserved, acc.Snapshot().WalletHolds[0].Status)
}

// Like Deposit and Withdraw, a commit changes the balance, so it stamps the
// account — Save writes updated_at from the snapshot.
func TestCommitHold_StampsTheAccount(t *testing.T) {
	bidID := uuid.New()
	acc := accountWithGold(t, 1000)
	require.NoError(t, acc.PlaceHold(uuid.New(), 300, bidID, holdExpiry(), time.Now()))
	committedAt := time.Now().Add(time.Minute)

	_, err := acc.CommitHold(bidID, 300, committedAt)

	require.NoError(t, err)
	assert.Equal(t, committedAt, acc.Snapshot().UpdatedAt)
}

// wallet_holds.account_id references accounts(id), and FindByBidID resolves a
// bid to its account through it. A hold stamped with anything but its own
// account's id fails that foreign key on insert and can never be found again.
func TestPlaceHold_HoldBelongsToItsAccount(t *testing.T) {
	acc := accountWithGold(t, 1000)

	require.NoError(t, acc.PlaceHold(uuid.New(), 300, uuid.New(), holdExpiry(), time.Now()))

	snap := acc.Snapshot()
	assert.Equal(t, snap.ID, snap.WalletHolds[0].AccountID)
}

// The hold's expiry is the caller's — listing expiry plus settlement grace — not
// a fixed hour from now. Derived here it would bear no relation to when the
// auction settles, and the sweeper could release a hold settlement is about to
// commit (FS-NXP1W §Req 19).
func TestPlaceHold_Expiry(t *testing.T) {
	now := time.Now()

	t.Run("the hold stores the expiry it was given", func(t *testing.T) {
		acc := accountWithGold(t, 1000)
		expiresAt := now.Add(26 * time.Hour)

		require.NoError(t, acc.PlaceHold(uuid.New(), 300, uuid.New(), expiresAt, now))

		assert.Equal(t, expiresAt, acc.Snapshot().WalletHolds[0].ExpiredAt)
	})

	t.Run("an expiry that is not in the future is refused", func(t *testing.T) {
		acc := accountWithGold(t, 1000)

		err := acc.PlaceHold(uuid.New(), 300, uuid.New(), now, now)

		assert.ErrorIs(t, err, ErrInvalidHoldExpiry)
		assert.Empty(t, acc.Snapshot().WalletHolds, "no hold may be placed")
	})
}

// holdExpiry is a hold expiry comfortably in the future, for tests where when
// the hold lapses is beside the point.
func holdExpiry() time.Time {
	return time.Now().Add(time.Hour)
}
