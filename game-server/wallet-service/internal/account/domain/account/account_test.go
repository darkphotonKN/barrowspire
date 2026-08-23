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

			err := acc.PlaceHold(uuid.New(), tt.amount, uuid.New(), time.Now())

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

		require.NoError(t, acc.PlaceHold(uuid.New(), 100, uuid.New(), time.Now()))
	})

	t.Run("hold exceeding the balance is rejected", func(t *testing.T) {
		acc := accountWithGold(t, 100)

		err := acc.PlaceHold(uuid.New(), 101, uuid.New(), time.Now())

		assert.ErrorIs(t, err, ErrHoldsExceedBalance)
	})

	t.Run("holds accumulate against available gold", func(t *testing.T) {
		acc := accountWithGold(t, 100)
		require.NoError(t, acc.PlaceHold(uuid.New(), 60, uuid.New(), time.Now()))

		// 60 already reserved, so only 40 remains available
		err := acc.PlaceHold(uuid.New(), 41, uuid.New(), time.Now())

		assert.ErrorIs(t, err, ErrHoldsExceedBalance)
		assert.Len(t, acc.Snapshot().WalletHolds, 1, "the rejected hold must not be appended")
	})
}

// TestNewHoldIsBornReserved pins the hold FSM's starting state.
func TestNewHoldIsBornReserved(t *testing.T) {
	acc := accountWithGold(t, 100)

	require.NoError(t, acc.PlaceHold(uuid.New(), 10, uuid.New(), time.Now()))

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
	require.NoError(t, acc.PlaceHold(uuid.New(), 60, uuid.New(), time.Now()))

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
		require.NoError(t, acc.PlaceHold(uuid.New(), 60, uuid.New(), time.Now()))

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
	require.NoError(t, acc.PlaceHold(uuid.New(), 60, uuid.New(), time.Now()))
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
	require.NoError(t, acc.PlaceHold(uuid.New(), 300, bidID, time.Now()))

	// before: the gold is still on the books, but 300 of it is spoken for
	assert.Equal(t, 1000, acc.Snapshot().Gold)
	assert.Equal(t, 700, acc.getAvailableGold(), "a reserved hold is not spendable")

	require.NoError(t, acc.CommitHold(bidID, time.Now()))

	snap := acc.Snapshot()
	assert.Equal(t, 700, snap.Gold, "committing must actually spend the gold")
	assert.Equal(t, StatusCommitted, snap.WalletHolds[0].Status)

	// available is unchanged across the commit: the 300 left the balance and the
	// hold left RESERVED in the same step, so the buyer neither gains nor loses
	// spending power at settlement
	assert.Equal(t, 700, acc.getAvailableGold())
}

// TestCommitHoldRejectsUnknownAndAlreadySettledHolds covers the guards around the
// spend. The repeat case is the one that matters for the saga: settlement events
// are delivered at-least-once, so a redelivered CommitHold is expected traffic,
// not a client error — and today the FSM refuses it. That is recorded here as
// current behaviour, not endorsed: making it idempotent is outstanding work.
func TestCommitHoldRejectsUnknownAndAlreadySettledHolds(t *testing.T) {
	tests := []struct {
		name string
		// commitTwice drives the same hold through CommitHold a second time
		commitTwice bool
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
		{
			name:        "an already committed hold cannot be committed again",
			commitTwice: true,
			wantErr:     ErrInvalidHoldTransition,
			wantGold:    700, // the first commit stands; the second must not deduct again
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			bidID := uuid.New()

			acc := accountWithGold(t, 1000)
			require.NoError(t, acc.PlaceHold(uuid.New(), 300, bidID, time.Now()))

			target := bidID
			if tt.useUnknownBid {
				target = uuid.New()
			}

			if tt.commitTwice {
				require.NoError(t, acc.CommitHold(target, time.Now()))
			}

			err := acc.CommitHold(target, time.Now())

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
	require.NoError(t, acc.PlaceHold(uuid.New(), 100, firstBid, time.Now()))
	require.NoError(t, acc.PlaceHold(uuid.New(), 250, secondBid, time.Now()))

	require.NoError(t, acc.CommitHold(secondBid, time.Now()))

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
